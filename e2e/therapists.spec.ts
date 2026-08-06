import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/database.types";

/**
 * Therapist profiles: a clinic manager adds, edits, reorders, and removes
 * team members from the portal Team tab; the public clinic page reflects
 * the roster; photo upload/removal round-trips through Supabase storage.
 *
 * Chromium-only: mutates shared demo accounts. Idempotent: own rows (name
 * marker "[e2e]") are deleted up front, so reruns start clean.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
// Standard supabase-local demo value; not a production secret. Matches
// .env.local, which the dev server (spawned by playwright.config.ts) loads
// on its own — this constant just lets the test PROCESS see the same value.

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

const NAME_A = "[e2e] Maria Santos";
const NAME_B = "[e2e] Jo Cruz";

// 1x1 transparent PNG for the photo upload.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function cleanup() {
  const db = adminDb();
  const { data: rows } = await db
    .from("clinic_therapists")
    .select("id, photo_path")
    .like("full_name", "[e2e]%");
  const paths = (rows ?? [])
    .map((r) => r.photo_path)
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) await db.storage.from("clinic-images").remove(paths);
  await db.from("clinic_therapists").delete().like("full_name", "[e2e]%");
}

test.describe.configure({ mode: "serial" });

test.describe("therapist profiles", () => {
  test.beforeAll(async () => {
    await cleanup();
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "mutates shared demo accounts; run once",
    );
  });

  test("manager adds, edits, reorders team members; public page shows them", async ({
    page,
  }) => {
    const clinic = await managedClinic();
    await signIn(page, "clinicrep@thrivemap.test");
    await page.goto(`/clinic-portal/${clinic.id}/team`);

    // Add two members.
    await page.getByRole("button", { name: "Add a team member" }).click();
    await page.getByLabel("Full name").fill(NAME_A);
    await page.getByLabel(/Credentials/).fill("OTRP");
    await page.getByLabel("Profession").fill("Occupational Therapist");
    await page.getByLabel(/Specialties/).fill("Sensory integration");
    await page.getByRole("button", { name: "Add team member" }).click();
    await expect(page.getByText(NAME_A)).toBeVisible();

    await page.getByRole("button", { name: "Add a team member" }).click();
    await page.getByLabel("Full name").fill(NAME_B);
    await page.getByLabel("Profession").fill("Speech Therapist");
    await page.getByRole("button", { name: "Add team member" }).click();
    await expect(page.getByText(NAME_B)).toBeVisible();

    // Edit A's bio.
    await page.getByRole("button", { name: `Edit ${NAME_A}` }).click();
    await page.getByLabel(/Short bio/).fill("Ten years of pediatric practice.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByRole("button", { name: `Edit ${NAME_A}` }),
    ).toBeVisible();

    // Reorder: move B up, expect B listed before A.
    await page.getByRole("button", { name: `Move ${NAME_B} up` }).click();
    await expect
      .poll(async () => {
        const texts = await page
          .locator("li", { hasText: "[e2e]" })
          .allInnerTexts();
        return texts.findIndex((t) => t.includes(NAME_B)) <
          texts.findIndex((t) => t.includes(NAME_A))
          ? "b-first"
          : "a-first";
      })
      .toBe("b-first");

    // Public page shows the care team.
    await page.goto(`/clinics/${clinic.slug}`);
    await expect(
      page.getByRole("heading", { name: "Care team" }),
    ).toBeVisible();
    await expect(page.getByText(NAME_A)).toBeVisible();
    await expect(page.getByText("Occupational Therapist")).toBeVisible();
    await expect(
      page.getByText("Ten years of pediatric practice."),
    ).toBeVisible();
  });

  test("manager uploads and removes a photo", async ({ page }) => {
    const clinic = await managedClinic();
    await signIn(page, "clinicrep@thrivemap.test");
    await page.goto(`/clinic-portal/${clinic.id}/team`);

    await page
      .locator(`input[type="file"][id^="photo-"]`)
      .first()
      .setInputFiles({
        name: "headshot.png",
        mimeType: "image/png",
        buffer: PNG_BYTES,
      });
    await expect(
      page.getByRole("button", { name: "Remove photo" }),
    ).toBeVisible();

    // Row now has a stored photo_path.
    const db = adminDb();
    await expect
      .poll(async () => {
        const { data } = await db
          .from("clinic_therapists")
          .select("photo_path")
          .like("full_name", "[e2e]%")
          .not("photo_path", "is", null);
        return data?.length ?? 0;
      })
      .toBeGreaterThan(0);

    await page.getByRole("button", { name: "Remove photo" }).click();
    await expect(
      page.getByRole("button", { name: "Remove photo" }),
    ).toHaveCount(0);
  });

  test("manager deletes team members", async ({ page }) => {
    const clinic = await managedClinic();
    await signIn(page, "clinicrep@thrivemap.test");
    await page.goto(`/clinic-portal/${clinic.id}/team`);

    for (const name of [NAME_A, NAME_B]) {
      await page.getByRole("button", { name: `Remove ${name}` }).click();
      await expect(page.getByText(name)).toHaveCount(0);
    }

    // Public page no longer shows the section.
    await page.goto(`/clinics/${clinic.slug}`);
    await expect(page.getByRole("heading", { name: "Care team" })).toHaveCount(
      0,
    );
  });
});
