import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("is the app shell: search prompt, service shortcuts, map", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /where are you looking for support/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: /search by city/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /use my location/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /speech & language therapy/i }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: /^map/i })).toBeAttached();
  });

  test("a search from the homepage rewrites the URL to /clinics", async ({
    page,
  }) => {
    await page.goto("/");
    const searchBox = page.getByRole("combobox", { name: /search by city/i });
    await searchBox.fill("Quezon");
    await page.getByRole("option", { name: /quezon city/i }).click();
    await expect(page).toHaveURL(/\/clinics\?.*lat=14\.6/);
    await expect(page.getByText(/clinics? found/)).toBeVisible();
  });
});

test.describe("about page", () => {
  test("carries the former marketing sections", async ({ page }) => {
    await page.goto("/about");
    await expect(
      page.getByRole("heading", {
        name: /find the right support near you/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /browse by service/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /speech & language therapy/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /featured verified clinics/i }),
    ).toBeVisible();
  });
});

test.describe("clinic search", () => {
  test("search by city shows results and markers", async ({ page }) => {
    await page.goto("/clinics");
    const searchBox = page.getByRole("combobox", { name: /search by city/i });
    await searchBox.fill("Quezon");
    const option = page.getByRole("option", { name: /quezon city/i });
    await expect(option).toBeVisible();
    await option.click();

    await expect(page).toHaveURL(/lat=14\.6/);
    await expect(page.getByText(/clinics? found/)).toBeVisible();
    const cards = page.locator("[data-clinic-id]");
    await expect(cards.first()).toBeVisible();

    // Map markers present in the GeoJSON source (desktop only). Tile/glyph
    // fetches can be slow in CI, so assert on source data rather than
    // fully-rendered style state.
    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 768) {
      await page.waitForFunction(
        async () => {
          const map = (
            window as unknown as {
              __thrivemapMap?: {
                getSource(
                  id: string,
                ): { getData(): Promise<{ features: unknown[] }> } | undefined;
              };
            }
          ).__thrivemapMap;
          const source = map?.getSource("clinics");
          if (!source) return false;
          const data = await source.getData();
          return data.features.length > 0;
        },
        { timeout: 20_000 },
      );
    }
  });

  test("filters narrow results and update the URL", async ({ page }) => {
    await page.goto("/clinics?lat=14.5995&lng=120.9842&radius=25");
    await page.getByRole("button", { name: /more filters/i }).click();
    await page
      .getByRole("checkbox", { name: /speech & language therapy/i })
      .click();
    await expect(page).toHaveURL(/services=speech-therapy/);
    await page.keyboard.press("Escape");
    await expect(page.getByText(/clinics? found/)).toBeVisible();
  });

  test("load more pages through a non-distance sort", async ({ page }) => {
    // Alphabetical (and the other non-distance sorts) used to be limit-only:
    // page one was all you ever got.
    await page.goto("/clinics?sort=alphabetical");
    // The shell streams in server-rendered; a click before hydration is
    // lost (there is nothing to replay it), so wait until it is interactive.
    await page.locator("[data-slot=app-shell][data-hydrated]").waitFor();
    const cards = page.locator("[data-clinic-id]");
    await expect(cards.first()).toBeVisible();
    const firstPage = await cards.count();
    expect(firstPage).toBe(20);

    await page.getByRole("button", { name: /load more clinics/i }).click();
    await expect(cards).not.toHaveCount(firstPage);

    const ids = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-clinic-id")),
    );
    expect(ids.length).toBeGreaterThan(firstPage);
    expect(new Set(ids).size).toBe(ids.length);

    // Ordering must survive the page boundary.
    const names = await cards
      .locator("h3")
      .evaluateAll((els) => els.map((el) => el.textContent!.trim()));
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  test("verified-only filter shows only verified badges", async ({ page }) => {
    await page.goto("/clinics?lat=14.5995&lng=120.9842&radius=25&verified=1");
    const cards = page.locator("[data-clinic-id]");
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await expect(
        cards.nth(i).getByText("Verified", { exact: true }),
      ).toBeVisible();
    }
  });
});

test.describe("clinic profile", () => {
  test("opens from search results with full details", async ({ page }) => {
    await page.goto("/clinics/little-steps-developmental-center");
    await expect(
      page.getByRole("heading", { name: /little steps developmental center/i }),
    ).toBeVisible();
    await expect(
      page.getByText("Verified", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /opening hours/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /services/i }).first(),
    ).toBeVisible();
    // Base UI renders link-styled buttons with role="button"
    await expect(
      page.getByRole("button", { name: /report incorrect information/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /claim this clinic/i }),
    ).toBeVisible();
  });

  test("unverified clinic shows the caution banner", async ({ page }) => {
    await page.goto("/clinics/sunrise-kids-therapy-center");
    await expect(
      page.getByText(/unverified listing\. information may be incomplete/i),
    ).toBeVisible();
  });

  test("clinic page carries JSON-LD structured data", async ({ page }) => {
    await page.goto("/clinics/little-steps-developmental-center");
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    const parsed = JSON.parse(jsonLd!);
    expect(parsed["@type"]).toBe("MedicalBusiness");
    expect(parsed.address.addressCountry).toBe("PH");
  });
});

test.describe("SEO surfaces", () => {
  test("sitemap lists clinics, services, and locations", async ({
    request,
  }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("/clinics/little-steps-developmental-center");
    expect(body).toContain("/services/speech-therapy");
    expect(body).toContain("/locations/metro-manila/quezon-city");
  });

  test("robots.txt blocks private areas", async ({ request }) => {
    const res = await request.get("/robots.txt");
    const body = await res.text();
    expect(body).toContain("Disallow: /admin");
    expect(body).toContain("Sitemap:");
  });
});
