import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/database.types";

/**
 * Inquiries flow: caregiver sends an inquiry, the clinic rep replies and
 * confirms a date, the caregiver sees the outcome, and the background
 * notification jobs land.
 *
 * Chromium-only: mutates shared demo accounts. Idempotent: own threads
 * (subject marker "[e2e]") are deleted up front, so reruns start clean.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
// Standard supabase-local demo value; not a production secret. Matches
// .env.local, which the dev server (spawned by playwright.config.ts) loads
// on its own — this constant just lets the test PROCESS see the same value.
const JOBS_PROCESSOR_SECRET =
  process.env.JOBS_PROCESSOR_SECRET ??
  "local-dev-jobs-secret-not-for-production";

const SUBJECT = "[e2e] Assessment availability";

function adminDb() {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page
    .locator("#main-content")
    .getByRole("button", { name: /^sign in$/i })
    .click();
  await page.waitForURL("**/account");
}

/** Signs the current session out via the account-menu form and lands on "/". */
async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL("**/");
}

/** The clinic clinicrep@ actively manages, plus its public slug. */
async function managedClinic(): Promise<{ id: string; slug: string }> {
  const db = adminDb();
  const { data: list } = await db.auth.admin.listUsers();
  const rep = list.users.find((u) => u.email === "clinicrep@thrivemap.test");
  if (!rep) throw new Error("seed data: clinicrep@ user not found");
  const { data: grant } = await db
    .from("clinic_managers")
    .select("clinic_id")
    .eq("user_id", rep.id)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (!grant) throw new Error("seed data: clinicrep@ has no managed clinic");
  const { data: clinic } = await db
    .from("clinics")
    .select("slug")
    .eq("id", grant.clinic_id)
    .single();
  if (!clinic) throw new Error("seed data: managed clinic row missing");
  return { id: grant.clinic_id, slug: clinic.slug };
}

/** auth.users id for the seeded demo caregiver. */
async function caregiverUserId(): Promise<string> {
  const db = adminDb();
  const { data: list } = await db.auth.admin.listUsers();
  const user = list.users.find((u) => u.email === "caregiver@thrivemap.test");
  if (!user) throw new Error("seed data: caregiver@ user not found");
  return user.id;
}

/** A published clinic with no active managers (unclaimed). */
async function unclaimedClinicSlug(): Promise<string> {
  const db = adminDb();
  const { data: clinics } = await db
    .from("clinics")
    .select("slug, clinic_managers(id, revoked_at)")
    .in("status", ["published_verified", "published_unverified"])
    .is("deleted_at", null)
    .limit(50);
  const hit = clinics?.find(
    (c) => !c.clinic_managers?.some((m) => m.revoked_at === null),
  );
  if (!hit) throw new Error("seed data: no unclaimed clinic found");
  return hit.slug;
}

/**
 * Completed inquiry_notification jobs for one inquiry. Reads the whole
 * (job_type, status) slice and filters by payload in JS — scoping to our
 * inquiry id, not the whole jobs table, which other suites also populate.
 */
async function completedNotificationJobs(inquiryId: string): Promise<number> {
  const db = adminDb();
  const { data } = await db
    .from("jobs")
    .select("payload")
    .eq("job_type", "inquiry_notification")
    .eq("status", "completed");
  return (data ?? []).filter(
    (row) =>
      (row.payload as { inquiry_id?: string } | null)?.inquiry_id === inquiryId,
  ).length;
}

/** Ticks the job processor once via the internal endpoint. */
async function tickJobs(page: Page) {
  const response = await page.request.post("/api/internal/jobs/process", {
    headers: { "x-jobs-secret": JOBS_PROCESSOR_SECRET },
  });
  if (!response.ok()) {
    throw new Error(`jobs tick failed: ${response.status()}`);
  }
}

test.describe("inquiries", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Shared demo accounts; chromium project only.",
    );
  });

  test.beforeEach(async () => {
    const db = adminDb();
    const { data } = await db
      .from("inquiries")
      .select("id")
      .like("subject", "[e2e]%");
    const ids = (data ?? []).map((r) => r.id);
    if (ids.length) {
      await db.from("clinic_reports").delete().in("inquiry_id", ids);
      await db.from("inquiries").delete().in("id", ids);
    }
  });

  test("caregiver sends, rep replies and confirms, caregiver sees outcome", async ({
    page,
  }) => {
    const clinic = await managedClinic();

    // 1-3: caregiver opens a thread from the clinic page.
    await signIn(page, "caregiver@thrivemap.test");
    await page.goto(`/clinics/${clinic.slug}`);
    await page.getByRole("button", { name: "Send an inquiry" }).click();
    await page.getByLabel("Subject").fill(SUBJECT);
    await page
      .getByLabel("Message")
      .fill("Hi, do you have openings for an initial assessment?");
    await page.getByLabel("Preferred date").fill("2026-09-20");
    await page.getByLabel("Time note").fill("weekday mornings");
    await page.getByRole("button", { name: "Send inquiry" }).click();

    await page.waitForURL(/\/account\/inquiries\/[0-9a-f-]+$/);
    const inquiryId = page.url().split("/").pop()!;
    await expect(
      page.getByText("Hi, do you have openings for an initial assessment?"),
    ).toBeVisible();

    // 4: DB reflects the new open thread.
    await expect
      .poll(async () => {
        const db = adminDb();
        const { data } = await db
          .from("inquiries")
          .select("status")
          .eq("id", inquiryId)
          .maybeSingle();
        return data?.status ?? null;
      })
      .toBe("open");

    // 5: rep sees the thread in the portal inbox.
    await signOut(page);
    await signIn(page, "clinicrep@thrivemap.test");
    await page.goto(`/clinic-portal/${clinic.id}/inquiries`);
    await expect(
      page.getByRole("link").filter({ hasText: SUBJECT }),
    ).toBeVisible();
    await page.getByRole("link").filter({ hasText: SUBJECT }).click();
    await page.waitForURL(
      `**/clinic-portal/${clinic.id}/inquiries/${inquiryId}`,
    );

    // 6: rep replies.
    const replyBody = "Yes, we have a slot that morning.";
    await page.getByLabel("Your reply").fill(replyBody);
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(page.getByText(replyBody)).toBeVisible();

    // 7: rep confirms, keeping the defaulted (preferred) date.
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByLabel("Confirmed date")).toHaveValue("2026-09-20");
    await page.getByRole("button", { name: "Confirm date" }).click();
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();

    // 8: DB reflects the confirmation.
    await expect
      .poll(async () => {
        const db = adminDb();
        const { data } = await db
          .from("inquiries")
          .select("status, confirmed_date")
          .eq("id", inquiryId)
          .maybeSingle();
        return {
          status: data?.status ?? null,
          date: data?.confirmed_date ?? null,
        };
      })
      .toEqual({ status: "confirmed", date: "2026-09-20" });

    // 9: caregiver sees the reply and the confirmed outcome.
    await signOut(page);
    await signIn(page, "caregiver@thrivemap.test");
    await page.goto(`/account/inquiries/${inquiryId}`);
    await expect(page.getByText(replyBody)).toBeVisible();
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();

    // 10: notification jobs (created, replied, confirmed) all completed.
    await expect
      .poll(
        async () => {
          await tickJobs(page);
          return completedNotificationJobs(inquiryId);
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(3);
  });

  test("closed thread hides the reply box", async ({ page }) => {
    const clinic = await managedClinic();
    const caregiverId = await caregiverUserId();
    const db = adminDb();

    const { data: inquiry, error: inquiryError } = await db
      .from("inquiries")
      .insert({
        clinic_id: clinic.id,
        caregiver_id: caregiverId,
        subject: `${SUBJECT} (closed)`,
        status: "closed",
      })
      .select("id")
      .single();
    if (inquiryError || !inquiry) {
      throw new Error(`seed insert failed: ${inquiryError?.message}`);
    }
    await db.from("inquiry_messages").insert({
      inquiry_id: inquiry.id,
      sender_id: caregiverId,
      sender_role: "caregiver",
      body: "Is Tuesday still available?",
    });

    await signIn(page, "caregiver@thrivemap.test");
    await page.goto(`/account/inquiries/${inquiry.id}`);
    await expect(page.getByText("This conversation is closed.")).toBeVisible();
    await expect(page.getByLabel("Your reply")).toHaveCount(0);
  });

  test("manager cannot see the caregiver-side view of a thread", async ({
    page,
  }) => {
    const clinic = await managedClinic();
    const caregiverId = await caregiverUserId();
    const db = adminDb();

    const { data: inquiry, error: inquiryError } = await db
      .from("inquiries")
      .insert({
        clinic_id: clinic.id,
        caregiver_id: caregiverId,
        subject: `${SUBJECT} (ownership)`,
        status: "open",
      })
      .select("id")
      .single();
    if (inquiryError || !inquiry) {
      throw new Error(`seed insert failed: ${inquiryError?.message}`);
    }

    // clinicrep@ is an RLS participant on this thread (manages the clinic),
    // but the /account surfaces are caregiver-only — the app-level
    // ownership guard, not RLS, is what's under test here.
    await signIn(page, "clinicrep@thrivemap.test");
    await page.goto("/account/inquiries");
    await expect(page.getByText(`${SUBJECT} (ownership)`)).toHaveCount(0);
    await page.goto(`/account/inquiries/${inquiry.id}`);
    await expect(page.getByText(/could not be found/i)).toBeVisible();
  });

  test("unclaimed clinic shows the claim hint", async ({ page }) => {
    const slug = await unclaimedClinicSlug();
    await signIn(page, "caregiver@thrivemap.test");
    await page.goto(`/clinics/${slug}`);
    await expect(page.getByText(/hasn't been claimed/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send an inquiry" }),
    ).toHaveCount(0);
  });
});
