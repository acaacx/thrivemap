import { expect, test, type Page } from "@playwright/test";

/** Signs in as the seeded demo caregiver via the login form. */
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("caregiver@thrivemap.test");
  await page.getByLabel("Password").fill("password123");
  await page
    .locator("#main-content")
    .getByRole("button", { name: /^sign in$/i })
    .click();
  await page.waitForURL("**/account");
}

test.describe("authentication", () => {
  test("caregiver can sign in and reach their account", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { name: /profile/i })).toBeVisible();
    await expect(page.getByText("caregiver@thrivemap.test")).toBeVisible();
  });

  test("signed-out visitors are redirected from account pages", async ({ page }) => {
    await page.goto("/account/favorites");
    await page.waitForURL("**/login**");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });
});

test.describe("favorites", () => {
  test("caregiver can favorite and unfavorite a clinic", async ({ page }, testInfo) => {
    // Both projects share the demo caregiver account; running this mutation
    // flow concurrently in two projects races the same session. Chromium-only.
    test.skip(testInfo.project.name !== "chromium", "chromium-only mutation flow");
    const slug = "bloom-developmental-services";
    await signIn(page);
    await page.goto(`/clinics/${slug}`);

    // Reset any leftover favorited state from previous runs.
    const anyFavoriteButton = page.getByRole("button", { name: /favorites/i }).first();
    await anyFavoriteButton.waitFor();
    if ((await anyFavoriteButton.getAttribute("aria-pressed")) === "true") {
      await anyFavoriteButton.click();
      await expect(anyFavoriteButton).toHaveAttribute("aria-pressed", "false");
    }

    const favoriteButton = page.getByRole("button", { name: /save .* to favorites/i });
    await favoriteButton.click();
    await expect(
      page.getByRole("button", { name: /remove .* from favorites/i }),
    ).toBeVisible();

    await page.goto("/account/favorites");
    await expect(page.locator(`[data-clinic-id]`).first()).toBeVisible();

    // Clean up: unfavorite so the test is repeatable.
    await page.goto(`/clinics/${slug}`);
    await page.getByRole("button", { name: /remove .* from favorites/i }).click();
    await expect(
      page.getByRole("button", { name: /save .* to favorites/i }),
    ).toBeVisible();
  });
});

test.describe("suggest a clinic", () => {
  test("duplicate check surfaces similar listings before submitting", async ({ page }) => {
    await page.goto("/suggest-clinic");
    await page.getByLabel(/clinic name/i).fill("Little Steps Developmental Center");
    await page
      .getByLabel(/full address/i)
      .fill("123 Some Street, Barangay 1, Quezon City, Metro Manila");
    await page
      .getByRole("checkbox", { name: /information i.m sharing is accurate/i })
      .click();
    await page.getByRole("button", { name: /check for duplicates/i }).click();

    await expect(page.getByRole("heading", { name: /is it one of these/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /little steps developmental center/i }),
    ).toBeVisible();
  });

  test("new clinic suggestion is accepted", async ({ page }) => {
    await page.goto("/suggest-clinic");
    const unique = `Playwright Test Clinic ${Date.now()}`;
    await page.getByLabel(/clinic name/i).fill(unique);
    await page
      .getByLabel(/full address/i)
      .fill("456 Test Avenue, Barangay 9, Cebu City, Cebu");
    await page.getByLabel(/your email/i).fill("caregiver@thrivemap.test");
    await page
      .getByRole("checkbox", { name: /information i.m sharing is accurate/i })
      .click();
    await page.getByRole("button", { name: /check for duplicates/i }).click();
    await page.getByRole("button", { name: /submit/i }).first().click();
    await expect(page.getByText(/suggestion received/i)).toBeVisible();
  });
});

test.describe("report incorrect information", () => {
  test("anonymous visitor can file a report", async ({ page }) => {
    await page.goto("/clinics/sunrise-kids-therapy-center/report");
    await page.getByRole("radio", { name: /wrong phone number/i }).check();
    await page
      .getByLabel(/details/i)
      .fill("Playwright test report — phone number appears disconnected.");
    await page.getByRole("button", { name: /send report/i }).click();
    await expect(page.getByText(/report received/i)).toBeVisible();
  });
});

test.describe("suggest a correction", () => {
  test("signed-in caregiver can send a change request", async ({ page }) => {
    await signIn(page);
    await page.goto("/clinics/bloom-developmental-services/suggest-edit");
    await page.getByLabel(/which detail/i).fill("Opening hours");
    await page
      .getByLabel(/what should change/i)
      .fill("Playwright test — clinic now opens at 9am on weekdays.");
    await page.getByRole("button", { name: /send correction request/i }).click();
    await expect(page.getByText("Request sent", { exact: true })).toBeVisible();

    await page.goto("/account/submissions");
    await expect(page.getByText(/clinic now opens at 9am/i).first()).toBeVisible();
  });
});
