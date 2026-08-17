import { expect, test } from "@playwright/test";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test.describe("OG card route", () => {
  test("returns a PNG with a full-card header", async ({ request }) => {
    const response = await request.get("/api/og/search");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const body = await response.body();
    expect(body.subarray(0, 4)).toEqual(PNG_MAGIC);
    expect(body.byteLength).toBeGreaterThan(5_000);
    expect(response.headers()["x-og-card"]).toBe("full");
    expect(response.headers()["cache-control"]).toContain("s-maxage=86400");
  });

  test("renders a different card for a filtered URL", async ({ request }) => {
    const [wide, filtered] = await Promise.all([
      request.get("/api/og/search"),
      request.get(
        "/api/og/search?loc=Cebu+City&lat=10.31&lng=123.89&radius=20",
      ),
    ]);
    const [a, b] = [await wide.body(), await filtered.body()];
    expect(a.equals(b)).toBe(false);
  });

  test("falls back with a short TTL when nothing matches", async ({
    request,
  }) => {
    // Open ocean east of Mindanao — a valid bbox with no clinics in it.
    const response = await request.get(
      "/api/og/search?north=8.2&south=8.1&east=126.9&west=126.8",
    );
    expect(response.status()).toBe(200);
    expect((await response.body()).subarray(0, 4)).toEqual(PNG_MAGIC);
    expect(response.headers()["x-og-card"]).toBe("fallback");
    expect(response.headers()["cache-control"]).toContain("s-maxage=60");
  });

  for (const [name, query] of [
    ["nonsense values", "?north=abc&south=xyz&lat=999&radius=-5"],
    [
      "injection attempt",
      "?loc=%3C%2Ftext%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    ],
    ["unknown keys", "?nope=1&other=2"],
    ["oversized loc", `?loc=${"A".repeat(500)}`],
    ["world bbox", "?north=89&south=-89&east=179&west=-179"],
  ] as const) {
    test(`survives ${name}`, async ({ request }) => {
      const response = await request.get(`/api/og/search${query}`);
      expect(response.status()).toBe(200);
      expect((await response.body()).subarray(0, 4)).toEqual(PNG_MAGIC);
      expect(["full", "fallback"]).toContain(response.headers()["x-og-card"]);
    });
  }
});

test.describe("OG metadata on /clinics", () => {
  test("og:url carries the query string", async ({ page }) => {
    await page.goto("/clinics?services=speech-therapy&loc=Cebu+City");
    const ogUrl = await page
      .locator('meta[property="og:url"]')
      .getAttribute("content");
    expect(ogUrl).toContain("/clinics?");
    expect(ogUrl).toContain("services=speech-therapy");
    expect(ogUrl).toContain("loc=Cebu");
  });

  test("og:image is absolute and points at the card route", async ({
    page,
  }) => {
    await page.goto("/clinics?loc=Davao+City");
    const image = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(image).toMatch(/^https?:\/\//);
    expect(image).toContain("/api/og/search");
    expect(image).toContain("loc=Davao");
  });

  test("og:title names the filter without the site-name suffix", async ({
    page,
  }) => {
    await page.goto("/clinics?services=speech-therapy&loc=Cebu+City");
    const title = await page
      .locator('meta[property="og:title"]')
      .getAttribute("content");
    expect(title).toBe("Speech therapy in Cebu City");
    // The page title does inherit the root template — that is the difference.
    expect(await page.title()).toContain("ThriveMap");
  });

  test("og:image:alt is present", async ({ page }) => {
    await page.goto("/clinics?loc=Davao+City");
    const alt = await page
      .locator('meta[property="og:image:alt"]')
      .getAttribute("content");
    expect(alt).toBeTruthy();
    expect(alt!.length).toBeGreaterThan(10);
  });

  test("two filters produce two distinct previews", async ({ page }) => {
    await page.goto("/clinics?loc=Cebu+City");
    const first = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    await page.goto("/clinics?loc=Davao+City");
    const second = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(first).not.toBe(second);
  });

  test("canonical stays on the bare path", async ({ page }) => {
    await page.goto("/clinics?loc=Cebu+City");
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical).not.toContain("?");
    expect(canonical).toContain("/clinics");
  });
});
