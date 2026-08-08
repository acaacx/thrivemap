import { expect, test, type Page } from "@playwright/test";
import { SNAPSHOT_KEY } from "@/modules/favorites/snapshot";

/**
 * PWA surfaces: web manifest shape, the /offline page's empty and
 * populated states (driven purely by localStorage, no network needed),
 * and that visiting favorites while signed in populates the on-device
 * snapshot used by /offline.
 *
 * Chromium-only: /offline reads and seeds localStorage directly via
 * addInitScript, which is redundant to verify per-browser-engine.
 */

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

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "localStorage-driven; no need to run per browser engine",
  );
});

test.describe("PWA manifest", () => {
  test("manifest.webmanifest is well-formed", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("ThriveMap");
    expect(body.icons).toHaveLength(3);
    expect(body.display).toBe("standalone");
  });
});

test.describe("/offline", () => {
  test("shows empty state with no saved clinics", async ({ page }) => {
    await page.addInitScript(
      (key) => window.localStorage.removeItem(key),
      SNAPSHOT_KEY,
    );
    await page.goto("/offline");
    await expect(
      page.getByText("No saved clinics on this device yet."),
    ).toBeVisible();
  });

  test("shows a seeded snapshot with a tel link", async ({ page }) => {
    await page.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      {
        key: SNAPSHOT_KEY,
        value: JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          items: [
            {
              slug: "rainbow-bridge-therapy-center",
              name: "Rainbow Bridge Therapy Center (Fictional)",
              address: "Pasig, Metro Manila",
              phone: "+63 2 8100 0001",
            },
          ],
        }),
      },
    );
    await page.goto("/offline");
    await expect(
      page.getByText("Rainbow Bridge Therapy Center (Fictional)"),
    ).toBeVisible();
    await expect(page.getByText("Pasig, Metro Manila")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "+63 2 8100 0001" }),
    ).toHaveAttribute("href", "tel:+63 2 8100 0001");
  });
});

test.describe("favorites snapshot wiring", () => {
  test("visiting favorites while signed in writes the on-device snapshot", async ({
    page,
  }) => {
    await signIn(page, "caregiver@thrivemap.test");
    await page.goto("/account/favorites");
    await expect(
      page.getByRole("heading", { name: "Favorites" }),
    ).toBeVisible();

    // FavoritesSnapshot writes from a client-side useEffect after hydration,
    // which can land slightly after the SSR'd heading is visible — poll
    // rather than reading localStorage synchronously.
    let raw: string | null = null;
    await expect
      .poll(async () => {
        raw = await page.evaluate(
          (key) => window.localStorage.getItem(key),
          SNAPSHOT_KEY,
        );
        return raw;
      })
      .not.toBeNull();
    const parsed = JSON.parse(raw!);
    const slugs = parsed.items.map((item: { slug: string }) => item.slug);
    expect(slugs).toContain("rainbow-bridge-therapy-center");
  });
});
