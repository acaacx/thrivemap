import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/database.types";

/**
 * Caregiver ratings: the public clinic page's aggregate display thresholds
 * (no ratings / below-threshold / averages shown), and a caregiver's own
 * submit → update → remove flow.
 *
 * Chromium-only: mutates a shared demo account's rating on a shared demo
 * clinic. Idempotent: the caregiver's own row on the target clinic is
 * deleted up front, so reruns start clean.
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

// Seed data (supabase/seed.sql): three ratings puts this clinic above the
// display threshold.
const THREE_RATING_SLUG = "rainbow-bridge-therapy-center";
// One rating keeps this clinic below the threshold.
const ONE_RATING_SLUG = "kaleidoscope-child-development-clinic";
// No seeded ratings — dedicated clean-slate target for the submit/update/
// remove flow below (distinct from the rep-managed clinic, which
// e2e/therapists.spec.ts already relies on staying empty).
const CLEAN_SLUG = "bgc-kids-thrive-center";

const DIMENSIONS = [
  "Communication & responsiveness",
  "Sensory-friendliness",
  "Neurodiversity-affirming approach",
  "Scheduling & waiting time",
];

async function cleanOwnRating(slug: string) {
  const db = adminDb();
  const { data: list } = await db.auth.admin.listUsers();
  const caregiver = list.users.find(
    (u) => u.email === "caregiver@thrivemap.test",
  );
  if (!caregiver) throw new Error("seed data: caregiver@ user not found");
  const { data: clinic } = await db
    .from("clinics")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!clinic) throw new Error(`seed data: clinic ${slug} not found`);
  await db
    .from("clinic_ratings")
    .delete()
    .eq("clinic_id", clinic.id)
    .eq("user_id", caregiver.id);
}

async function selectStar(page: Page, legend: string, n: number) {
  await page
    .getByRole("group", { name: legend })
    .getByText(String(n), { exact: true })
    .click();
}

test.describe.configure({ mode: "serial" });

test.describe("clinic ratings", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "mutates a shared demo account; run once",
    );
  });

  test("clinic with 3+ ratings shows dimension averages", async ({ page }) => {
    await page.goto(`/clinics/${THREE_RATING_SLUG}`);
    await expect(
      page.getByRole("heading", { name: "Caregiver ratings" }),
    ).toBeVisible();
    for (const legend of DIMENSIONS) {
      await expect(page.getByText(legend)).toBeVisible();
    }
    await expect(page.getByText("Based on 3 ratings")).toBeVisible();
  });

  test("clinic below the display threshold hides averages", async ({
    page,
  }) => {
    await page.goto(`/clinics/${ONE_RATING_SLUG}`);
    await expect(
      page.getByRole("heading", { name: "Caregiver ratings" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "This clinic has ratings, but not enough yet to show averages.",
      ),
    ).toBeVisible();
    await expect(page.getByText(/^Based on/)).toHaveCount(0);
  });

  test("caregiver submits, updates, and removes a rating", async ({ page }) => {
    await cleanOwnRating(CLEAN_SLUG);
    await signIn(page, "caregiver@thrivemap.test");
    await page.goto(`/clinics/${CLEAN_SLUG}`);

    await expect(
      page.getByRole("heading", { name: "Caregiver ratings" }),
    ).toBeVisible();
    await expect(page.getByText("No ratings yet.")).toBeVisible();

    await selectStar(page, "Communication & responsiveness", 4);
    await selectStar(page, "Sensory-friendliness", 5);
    await selectStar(page, "Neurodiversity-affirming approach", 3);
    await selectStar(page, "Scheduling & waiting time", 4);
    await page.getByRole("button", { name: "Save rating" }).click();
    await expect(page.getByRole("status")).toHaveText("Rating saved.");

    // Reload to confirm the form comes back prefilled from the saved row.
    await page.reload();
    await expect(
      page
        .getByRole("group", { name: "Communication & responsiveness" })
        .getByRole("radio", { name: "4 stars" }),
    ).toBeChecked();
    await expect(
      page
        .getByRole("group", { name: "Sensory-friendliness" })
        .getByRole("radio", { name: "5 stars" }),
    ).toBeChecked();
    await expect(
      page
        .getByRole("group", { name: "Neurodiversity-affirming approach" })
        .getByRole("radio", { name: "3 stars" }),
    ).toBeChecked();
    await expect(
      page
        .getByRole("group", { name: "Scheduling & waiting time" })
        .getByRole("radio", { name: "4 stars" }),
    ).toBeChecked();

    await selectStar(page, "Communication & responsiveness", 2);
    await page.getByRole("button", { name: "Update rating" }).click();
    await expect(page.getByRole("status")).toHaveText("Rating saved.");

    await page.getByRole("button", { name: "Remove my rating" }).click();
    await expect(page.getByRole("status")).toHaveText("Rating removed.");

    await cleanOwnRating(CLEAN_SLUG);
  });
});
