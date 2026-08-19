import { expect, test } from "@playwright/test";

// Regression: ISSUE-002 — MapLibre was mounted behind the hidden mobile map
// pane, so a phone visit to /clinics in list view paid for a WebGL context
// and the style, glyphs and tiles of a 0x0 canvas. The map must only mount
// once the pane is shown.
// Found by /qa on 2026-08-18
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-18.md
//
// The app shell is list-first on phones. An explicit `view=list` keeps the
// regression deterministic even when a previous browser run stored Map.
//
// Uses the dev-only `window.__thrivemapMap` handle that ClinicMap exposes
// outside production, so it runs against `next dev` only (as the rest of the
// e2e suite does).

test.describe("mobile map pane", () => {
  test("map is not mounted until the Map view is chosen", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "phone-only layout; on desktop the map pane is always visible",
    );

    await page.goto("/clinics?loc=Quezon+City&view=list");
    await expect(
      page.locator("[data-slot=app-shell][data-hydrated]"),
    ).toBeVisible();
    await expect(page.locator("[data-clinic-id]").first()).toBeVisible();

    // List view: no map instance, even after the page has fully settled (the
    // old bug mounted it after a dynamic import, so a single early sample is
    // not enough).
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);
    expect(await page.evaluate(() => typeof window.__thrivemapMap)).toBe(
      "undefined",
    );

    await page.getByRole("radio", { name: "Map", exact: true }).click();

    // Switching to the Map view mounts it (WebGL may still fail in headless
    // Chromium — the instance is created before that, which is enough here).
    await expect
      .poll(() => page.evaluate(() => typeof window.__thrivemapMap))
      .toBe("object");

    // Toggling back keeps the list usable.
    await page.getByRole("radio", { name: "List", exact: true }).click();
    await expect(page.locator("[data-clinic-id]").first()).toBeVisible();
  });
});

declare global {
  interface Window {
    __thrivemapMap?: unknown;
  }
}
