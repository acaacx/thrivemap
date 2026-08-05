import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/database.types";

/**
 * Places import flow: trigger an import (fixture provider), process the job,
 * review candidates, promote one to a draft clinic.
 *
 * Chromium-only: mutates shared demo accounts/queues (same rule as stage 3).
 * Idempotent: fixture rows are deleted up front, so reruns start clean.
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

async function cleanupFixtureData() {
  const db = adminDb();
  await db
    .from("external_place_candidates")
    .delete()
    .like("external_id", "fixture-%");
  await db.from("clinics").delete().like("google_place_id", "fixture-%");
  // Allow the import to re-enqueue today: the trigger action idempotency-keys
  // per term+city+day.
  await db.from("jobs").delete().like("idempotency_key", "candidate-import:%");
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

test.describe("places import", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Shared demo accounts; chromium project only.",
    );
  });

  test("admin imports fixture candidates and promotes one", async ({
    page,
  }) => {
    await cleanupFixtureData();
    await signIn(page, "admin@thrivemap.test");

    await page.goto("/admin/candidates");
    await page.getByLabel("Service").selectOption("autism-therapy");
    const cityValue = await page
      .locator("#import-city option", { hasText: "Quezon City" })
      .first()
      .getAttribute("value");
    await page.getByLabel("City").selectOption(cityValue!);
    await page.getByRole("button", { name: "Queue import" }).click();
    await expect(page.getByText(/import queued/i)).toBeVisible();

    await page.goto("/admin/jobs");
    await page.getByRole("button", { name: "Run tick now" }).click();
    // Other suites leave completed jobs in the table, so the UI can't tell us
    // when THIS import lands — poll the database for the fixture rows.
    await expect
      .poll(
        async () => {
          const { count } = await adminDb()
            .from("external_place_candidates")
            .select("id", { count: "exact", head: true })
            .like("external_id", "fixture-%");
          return count ?? 0;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(3);

    await page.goto("/admin/candidates");
    await expect(page.getByText("Fixture Autism Care Center")).toBeVisible();

    const card = page.locator("li", {
      hasText: "Fixture Autism Care Center",
    });
    await card.getByRole("button", { name: "Promote" }).click();
    await expect(page.getByText(/draft clinic created/i)).toBeVisible();
    await expect(page.getByText("Fixture Autism Care Center")).toBeHidden();

    const { data: clinic } = await adminDb()
      .from("clinics")
      .select("status, source_type")
      .eq("google_place_id", "fixture-autism-001")
      .single();
    expect(clinic).toMatchObject({
      status: "draft",
      source_type: "external_import",
    });
  });
});
