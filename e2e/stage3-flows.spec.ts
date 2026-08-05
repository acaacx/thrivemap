import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/database.types";

/**
 * Stage 3 flows: claim wizard, admin claim approval, admin submission
 * approval, duplicate scan + merge.
 *
 * Chromium-only: these flows mutate shared demo accounts and moderation
 * queues; running them concurrently in two Playwright projects races itself.
 * Each run creates its own uniquely-named clinics/submissions so reruns stay
 * idempotent (rows accumulate locally, which is fine).
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function adminDb() {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const RUN = Date.now();
const CLAIM_CLINIC = {
  name: `E2E Claim Clinic ${RUN}`,
  slug: `e2e-claim-clinic-${RUN}`,
};
const SUBMISSION_NAME = `E2E Submission Clinic ${RUN}`;
const DUP_A = { name: `E2E Dup Alpha ${RUN}`, slug: `e2e-dup-alpha-${RUN}` };
const DUP_B = { name: `E2E Dup Beta ${RUN}`, slug: `e2e-dup-beta-${RUN}` };
const DUP_PHONE = `+63 2 ${String(RUN).slice(-7)}`;

async function createPublishedClinic(
  clinic: { name: string; slug: string },
  phone?: string,
) {
  const db = adminDb();
  const { data, error } = await db
    .from("clinics")
    .insert({
      name: clinic.name,
      slug: clinic.slug,
      status: "published_unverified",
      source_type: "manual",
      is_demo: true,
      phone: phone ?? null,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`clinic insert failed: ${error?.message}`);
  const { error: locationError } = await db.from("clinic_locations").insert({
    clinic_id: data.id,
    is_primary: true,
    address_line1: "1 Test Street",
    city: "Quezon City",
    city_slug: "quezon-city",
    province: "Metro Manila",
    province_slug: "metro-manila",
    location: "POINT(121.0437 14.676)",
  });
  if (locationError)
    throw new Error(`location insert failed: ${locationError.message}`);
  return data.id;
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

test.describe("stage 3: claims, admin, duplicates", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "chromium-only mutation flows",
    );
  });

  test("clinic representative completes the claim wizard", async ({ page }) => {
    await createPublishedClinic(CLAIM_CLINIC);
    await signIn(page, "clinicrep@thrivemap.test");
    await page.goto(`/clinics/${CLAIM_CLINIC.slug}/claim`);

    // Step 1: details
    await page.getByLabel("Full name").fill("Rep Reyes");
    await page.getByLabel("Work email").fill("rep@e2e-claim.example");
    await page.getByLabel("Mobile number").fill("+63 917 555 0100");
    await page.getByLabel("Job title").fill("Clinic Director");
    await page.getByText("Owner", { exact: true }).click();
    await page.getByRole("button", { name: /continue to documents/i }).click();

    // Step 2: one verification document
    await page.getByLabel(/file \(pdf or image/i).setInputFiles({
      name: "proof.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF",
      ),
    });
    await expect(page.getByText("proof.pdf")).toBeVisible();
    await page.getByRole("button", { name: /continue to review/i }).click();

    // Step 3: consent + submit
    await page
      .getByRole("checkbox", { name: /consent to verification/i })
      .click();
    await page.getByRole("button", { name: /submit claim/i }).click();
    await expect(page.getByText(/claim submitted/i)).toBeVisible();

    // Status is visible from the account page.
    await page.goto("/account/claims");
    await expect(
      page
        .locator("li", { hasText: CLAIM_CLINIC.name })
        .getByText(/submitted/i),
    ).toBeVisible();
  });

  test("admin approves the claim and the rep gets portal access", async ({
    page,
  }) => {
    await signIn(page, "admin@thrivemap.test");
    await page.goto("/admin/claims");
    await page
      .locator("li", { hasText: CLAIM_CLINIC.name })
      .getByRole("button", { name: /review/i })
      .click();
    await page.waitForURL("**/admin/claims/**");
    await expect(page.getByText("rep@e2e-claim.example")).toBeVisible();

    await page.getByRole("button", { name: /approve claim/i }).click();
    await expect(page.getByText(/claim approved/i)).toBeVisible();

    // Listing is now verified.
    await page.goto(`/clinics/${CLAIM_CLINIC.slug}`);
    await expect(
      page.getByText("Verified", { exact: true }).first(),
    ).toBeVisible();

    // The representative can manage it from the portal.
    await page.context().clearCookies();
    await signIn(page, "clinicrep@thrivemap.test");
    await page.goto("/clinic-portal");
    await expect(page.getByText(CLAIM_CLINIC.name)).toBeVisible();
    await page
      .locator("li", { hasText: CLAIM_CLINIC.name })
      .getByRole("button", { name: /manage/i })
      .click();
    await page.waitForURL("**/clinic-portal/**/profile");
    await expect(
      page.getByRole("heading", { name: CLAIM_CLINIC.name }),
    ).toBeVisible();
  });

  test("admin approves a submission into a published listing", async ({
    page,
  }) => {
    const db = adminDb();
    const { error } = await db.from("clinic_submissions").insert({
      clinic_name: SUBMISSION_NAME,
      address: "789 Approval Road, Quezon City",
      latitude: 14.65,
      longitude: 121.05,
      service_slugs: [],
      consent_given: true,
      submitter_email: "caregiver@thrivemap.test",
    });
    if (error) throw new Error(`submission insert failed: ${error.message}`);

    await signIn(page, "admin@thrivemap.test");
    await page.goto("/admin/submissions");
    const card = page.locator("li", { hasText: SUBMISSION_NAME });
    await card.getByRole("button", { name: /approve & publish/i }).click();
    // Success feedback is a toast (survives the refresh that removes the card).
    await expect(page.getByText(/published as \/clinics\//i)).toBeVisible();

    const slug = SUBMISSION_NAME.toLowerCase().replaceAll(" ", "-");
    await page.goto(`/clinics/${slug}`);
    await expect(
      page.getByRole("heading", { name: SUBMISSION_NAME }).first(),
    ).toBeVisible();
  });

  test("admin scans for duplicates and merges a pair", async ({ page }) => {
    const idA = await createPublishedClinic(DUP_A, DUP_PHONE);
    const idB = await createPublishedClinic(DUP_B, DUP_PHONE);

    await signIn(page, "admin@thrivemap.test");
    await page.goto("/admin/duplicates");
    // Under parallel load the first click can land before hydration and be
    // swallowed; re-click until the scan feedback appears (scan is idempotent).
    await expect(async () => {
      await page.getByRole("button", { name: /run scan/i }).click();
      await expect(page.getByText(/scan finished/i)).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 45_000 });

    const card = page
      .locator("li", { hasText: DUP_A.name })
      .filter({ hasText: DUP_B.name });
    await expect(card).toBeVisible();
    await card
      .getByLabel(/merge reason/i)
      .fill("E2E merge test — same phone and address.");
    await card
      .getByRole("button", { name: /keep a, merge b into it/i })
      .click();
    // Success feedback is a toast (survives the refresh that removes the card).
    await expect(page.getByText(/listings merged/i)).toBeVisible();

    // Exactly one of the pair is archived and points at the survivor.
    const db = adminDb();
    const { data: pair } = await db
      .from("clinics")
      .select("id, status, merged_into_clinic_id")
      .in("id", [idA, idB]);
    const archived = pair!.filter((c) => c.status === "archived");
    const kept = pair!.filter((c) => c.status !== "archived");
    expect(archived).toHaveLength(1);
    expect(kept).toHaveLength(1);
    expect(archived[0].merged_into_clinic_id).toBe(kept[0].id);
  });
});
