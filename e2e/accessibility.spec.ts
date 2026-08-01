import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { name: "landing", path: "/" },
  { name: "search", path: "/clinics?lat=14.5995&lng=120.9842&radius=10" },
  { name: "clinic profile", path: "/clinics/little-steps-developmental-center" },
  { name: "service landing", path: "/services/speech-therapy" },
  { name: "about", path: "/about" },
];

for (const { name, path } of pages) {
  test(`${name} page has no serious axe violations`, async ({ page }) => {
    await page.goto(path);
    // networkidle never settles on map pages (tile streaming) — wait for the
    // main landmark plus a settle delay instead.
    await page.locator("#main-content").waitFor();
    await page.waitForTimeout(1500);
    const results = await new AxeBuilder({ page })
      // The map canvas is a supplement; clinics are listed accessibly beside it.
      .exclude(".maplibregl-map")
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(
      serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
    ).toEqual([]);
  });
}
