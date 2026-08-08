import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/database.types";
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

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
// Standard supabase-local demo value; not a production secret. Matches
// .env.local, which the dev server (spawned by playwright.config.ts) loads
// on its own — this constant just lets the test PROCESS see the same value.

/**
 * Signs in as the demo caregiver directly against GoTrue and injects the
 * resulting session as a cookie, instead of going through the app's login
 * form. The form's `signIn` server action rate-limits `auth:signin` to 10
 * attempts per email per 15 minutes (`src/modules/auth/actions.ts`,
 * in-memory limiter, no Upstash configured locally) — and the shared demo
 * caregiver account already sits at that ceiling from
 * caregiver-flows.spec.ts, inquiries.spec.ts, and ratings.spec.ts combined.
 * A direct GoTrue sign-in doesn't touch that app-level limiter at all.
 *
 * Cookie name/shape (`sb-<host-label>-auth-token`, `base64-` prefix +
 * base64url JSON session) verified empirically against this app's actual
 * post-login cookie output — @supabase/ssr's `createServerClient` (used in
 * `src/lib/supabase/server.ts`) reads exactly this format.
 */
async function authenticateAsCaregiver(page: Page) {
  const supabase = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "caregiver@thrivemap.test",
    password: "password123",
  });
  if (error || !data.session) {
    throw new Error(`direct sign-in failed: ${error?.message}`);
  }
  const hostLabel = new URL(SUPABASE_URL).hostname.split(".")[0];
  const value =
    "base64-" +
    Buffer.from(JSON.stringify(data.session)).toString("base64url");
  await page.context().addCookies([
    {
      name: `sb-${hostLabel}-auth-token`,
      value,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
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
    await authenticateAsCaregiver(page);
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
