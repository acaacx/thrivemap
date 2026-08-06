import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Dev-server cold compiles of the admin/portal routes can eat most of the
  // default 30s budget when suites run in parallel workers.
  timeout: 60_000,
  // Turbopack compiles each dynamic route lazily on its first hit per dev
  // server process — confirmed via request-timing logs to cost 3-4.6s of
  // "next.js" time alone (e.g. the first GET of a brand-new route like
  // /clinic-portal/[clinicId]/team), dropping to <1s on every subsequent
  // hit once cached. Whichever spec is first to exercise a given route in
  // a full parallel run pays that tax, and under `pnpm test:e2e` that can
  // stack with other workers' concurrent load on the one shared dev
  // server + local Supabase stack. The suite-level `timeout` above already
  // budgets for this; the default per-assertion expect() timeout (5s) does
  // not, so a UI-update assertion right after a first-time navigation can
  // fail even though the app is working correctly and finishes moments
  // later. Bumped with headroom over the observed peak, not tuned to a
  // specific spec.
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Every worker's requests funnel through the ONE shared `pnpm dev` process
  // and the ONE local Supabase Docker stack (Postgres, GoTrue, Storage, ...).
  // `docker info` shows the Docker Desktop VM itself is capped at 4 vCPUs
  // regardless of host core count — ~12 Supabase containers share that pool,
  // and GoTrue + Postgres sit on the hot path of every single page load
  // (middleware's getUser() + the page's own getCurrentUser(), each a real
  // network round trip). Playwright's local default (~half the HOST cores,
  // e.g. 5-6 on an 11-core machine) oversubscribes that 4-vCPU ceiling badly
  // enough that a server action's response was observed to never reach the
  // dev server's request log within a 15s expect() timeout. Capping workers
  // below the Docker VM's vCPU count trades wall-clock time for headroom
  // against that shared bottleneck.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
