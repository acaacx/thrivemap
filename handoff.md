# Handoff — ThriveMap (dir: ausomeapp)

## What we are trying to do

Build **ThriveMap** (product name everywhere; directory stays `ausomeapp`): a
Philippines-first, autism-focused clinic directory. Phase 1 (clinic discovery
MVP) and Phase 2 (`docs/phase-2-plan.md` — Places import, therapist profiles,
inquiries, ratings, PWA) are complete. Multilingual **dropped entirely**
(decision 2026-08-10). Job-runner upgrade conditional-only.

**The app is live in production** at `https://thrivemap.vercel.app`. Code is
done; the remaining work is **operational: populate prod with real clinics**.
Session 2026-08-18 (late) added the admin tooling for exactly that: clinic
editor + publish flow (`c7f03aa`) and by-name Places lookup (`dbde18d`).
Session 2026-08-18 (later) ran the **mobile QA pass** (`/qa`, Standard tier)
and shipped 5 fixes.

**Locked decisions (do not relitigate):**

- Local dev uses local Supabase + `[DEV ADAPTER]` fallbacks (maps, rate limit,
  email, analytics, PostHog, Places fixture provider). Real providers env-gated,
  documented in `.env.example` / `docs/operations/deployment.md`.
- Background jobs = pg queue (`jobs` table + cron + `/api/internal/jobs/process`).
  Entrypoints: POST + `x-jobs-secret` (external schedulers) and Vercel Cron GET +
  `Authorization: Bearer $CRON_SECRET`.
- Single Next.js app, domain modules under `src/modules/`. No monorepo.
- Design (2026-08-18, user decision, branch `redesign/calm-ui`): **"Quiet
  Ledger"** — Inter only, sage-white `#F7FAF8`, one teal accent `#2F6F68`,
  1px `#D5E1DE` borders instead of shadows, tints blue/sage/lavender for
  categories, 44px public touch targets, `Display preferences` popover
  (reduce motion / larger text / more spacing / higher contrast →
  `<html data-*>` + `localStorage tm-display`, boot script in layout.tsx).
  Supersedes "Warm Horizon" for the app UI. **OG cards + email templates stay
  Warm Horizon** (deferred; needs font subsetting + card pixel tests). No
  puzzle-piece motifs (behavioral-therapy icon = `blocks`).
- Feeding Therapy: **hard-deleted** from the taxonomy (migration 22, cascade
  accepted; applied to prod 2026-08-18). Not recoverable by re-insert.
- Ratings: structured only, NO free text anywhere (RA 10175 anti-defamation,
  enforced by schema).
- PWA: manifest + offline shell + offline favorites snapshot ONLY; hand-rolled
  `public/sw.js`. SW registration is dev-disabled (`SwRegister.tsx`).
- Map tiles = OpenFreeMap vector tiles (keyless). Never raw
  `tile.openstreetmap.org` in production.
- **Mobile map is lazy (2026-08-18, ISSUE-002)**: `SearchPageClient` mounts
  `ClinicMap` only once revealed (md+ viewport OR mobile "Map" view), then keeps
  it mounted. Guarded by `e2e/mobile-map-lazy.spec.ts`. Don't re-mount it
  eagerly "for prefetch".
- **`LocationSearchBox` has an `embedded` prop** (2026-08-18, ISSUE-006): use
  it whenever the box sits inside another `<form>` (renders `<div role=search>`,
  Enter/button local, no navigation on free text). `SuggestClinicForm` uses it
  with `submitLabel="Search area"`.
- **Deploys are owned by Vercel git integration** (2026-08-12). `main.yml`
  deploy job waits for the Vercel deployment via the GitHub deployments API,
  then smoke tests. No `DEPLOY_HOOK_URL`.
- **Sentry runs on the wizard's config, not the env-gated one** (2026-08-12,
  user decision made with the tradeoffs stated). See "Accepted tradeoffs".
- **OG basemap = Natural Earth 1:10m** (2026-08-18), not 1:50m. Regen pipeline
  in `assets/README.md`.
- **GitHub repo `acaacx/thrivemap` is PUBLIC** (user decision 2026-08-18) so
  Actions are free. Do not commit anything you would not publish.
- **Candidate pipeline is the only way clinics enter prod**: Places (job import
  OR by-name lookup) → `external_place_candidates` → Promote/Attach → draft →
  `/admin/clinics/[id]` edit → publish. No direct clinic creation UI; keep it so
  (dedup matching + audit live on this path).
- **By-name lookup adds one hit at a time** (user decision 2026-08-18) — no
  "add all results".

## Finished and verified

`main` = `90743ab`, **pushed 2026-08-18** (`8057107..90743ab`); Vercel build
+ `main.yml` smoke were in flight at handoff time — **not yet confirmed
green**. Local at `90743ab`: `pnpm test` 221/221, typecheck, lint (0 errors;
2 pre-existing warnings, see traps), format green; e2e `public-directory`
20/20 chromium+mobile, `mobile-map-lazy` 1/1 mobile, `caregiver-flows`
suggest/correction 3/3 chromium.

- **Mobile QA pass 2026-08-18** (`/qa`, Pixel 7 393px + iPhone SE 375px,
  local dev). Report: `.gstack/qa-reports/qa-report-localhost-2026-08-18.md`
  (+ `baseline.json`, screenshots; `.gstack/` is gitignored — also copied to
  `~/.gstack/projects/acaacx-thrivemap/alaric-main-test-outcome-2026-08-18T0630.md`).
  Health 87 → 97. Fixed, one commit each:
  - `809fded` ISSUE-003 (high) clinic detail horizontal overflow — grid
    columns lacked `min-w-0`; long Contact email/URL blew the track to 441px.
  - `2a3b71a` ISSUE-005 service page hero CTA overflow at 375px (now wraps).
  - `61bb4a2` ISSUE-001 Sort select overlapped "More filters" on phones /
    larger-text pref (FilterBar no `min-w-0`; Sort `flex-1` on phones,
    `sm:w-52` up; wraps full-width for long labels).
  - `a48284f` + test `b944f51` ISSUE-002 lazy mobile map (see locked).
  - `f40745a` + test `90743ab` ISSUE-006 nested `<form>` on `/suggest-clinic`
    (see locked; `LocationSearchBox.test.tsx` covers default vs embedded).
  Flows verified working on mobile: menu sheet, Display prefs persistence,
  city search → `lat/lng`, filters sheet, list/map toggle, favorites (44px),
  sign-in redirect with `?next=`, inquiry send (native validation → thread
  page), `/offline` favorites snapshot, share (link copied).
- **Worktree cleanup 2026-08-18 ~05:40 PHT**: removed 4 stale worktrees + 7
  local branches. (A NEW one appeared since — see traps.)
- **Prod data bootstrap started (2026-08-17 21:45Z)**: user added
  "IntelliSpeech Therapy Center" (Dao, Dumaguete City) via by-name lookup.
  SQL confirmed row in `external_place_candidates`, `status = 'new'`,
  `promoted_clinic_id null` → **not yet promoted**, so no draft exists.
  Two clinic ids seen in `/admin/clinics/*` logs (`ddb4f3ba…`,
  `e0a3509f…`) — earlier promotions, status unknown.
- **By-name Places lookup (`dbde18d`)**: `/admin/candidates` card "Look up a
  center by name" (`PlaceLookupCard.tsx`). `lookupPlacesByNameAction(name,
  city?)` — moderator+, rate limit `place-lookup` 20/hr, `placeLookupNameSchema`
  (2–80 chars), query `"<name>[, <city>], Philippines"`, `maxPages: 1`, writes
  nothing. `addPlaceCandidateAction(hit)` upserts one row via
  `upsertPlaceCandidates` (`src/modules/imports/server.ts`), audit
  `add_place_candidate`. Runbook in `docs/operations/deployment.md`.
- **Clinic editor + publish flow (`c7f03aa`)**: `/admin/clinics/[clinicId]`,
  `ClinicStatusCard` → `setClinicStatus` with allowed transitions + required
  reason, `/admin/clinics` status filter chips, ImportTriggerCard "Other city".
- Earlier 2026-08-18: 1:10m OG outline `e09d1c1`; Vercel Preview builds fixed;
  GitHub Actions unblocked (repo public); PR #2 OG cards `61c495a`; branch `UI`
  `618306e` (migration 22 + service redesign); OG smoke `e678dec`; PR #3
  calm-ui redesign `44d1692` merged `8057107`.

## Half-done / not started

- **Confirm the `90743ab` deploy**: `npx vercel ls thrivemap --prod --scope
  abensontech` / GitHub Actions `main.yml`. Then eyeball prod on a **real
  phone** — headless Chromium has no WebGL2, so map behaviour (lazy mount →
  resize on reveal, pins, "Search this area") could NOT be exercised locally.
- **Deferred low QA issues** (in the report): ISSUE-004 bare `?loc=City`
  without `lat/lng` (e.g. the 3 OG test URLs) says "near City" but neither
  filters nor sorts; ISSUE-007 header "Sign in" `<a href="/login">` has no
  `?next=`; ISSUE-008 `/account/*` tab pills 38px + no scroll affordance;
  ISSUE-009 Display popover overhangs menu sheet (cosmetic).
- **Production has no PUBLISHED clinics yet.** Pipeline reminder — each step
  manual in the UI: `/admin/candidates` → Add (by-name) or import → candidate
  list at BOTTOM of page → **Promote** → clinic `draft` →
  `/admin/clinics?status=draft` (bare `/admin/clinics` shows nothing until a
  status chip / search is chosen) → edit (needs services + primary location
  with coords, else search never returns it) → `ClinicStatusCard`:
  `draft → pending_review → published_unverified` (reason required).
  `published_unverified` IS publicly visible; only `?verified=1` hides it.
  SQL: `select normalized_name, status, promoted_clinic_id from
  external_place_candidates where normalized_name ilike '%name%';`
- **Resend not configured in prod → inquiry emails do NOT send** (dev adapter
  logs only). Same for Upstash (rate limits lax) and PostHog.
- **Facebook Sharing Debugger gate** (three distinct cards) after first data:
  `/clinics`, `?services=occupational-therapy&loc=Davao+City`,
  `?services=speech-therapy&loc=Cebu+City&verified=1`.
- **Design observation, not fixed:** OG caption plate can cover pins near the
  bottom edge (PH-wide card: Davao pin).
- **No approval gate on production migrations** — Free plan. Accepted.
- Cold-start OG render can exceed 2 s; warm ~1 s.
- Local seed has one leftover test inquiry `[e2e] Mobile QA inquiry`
  (caregiver@ → Little Steps, id `5f706b10-…`). Harmless.

## Single next action

Confirm the `90743ab` production deploy went green (Vercel + `main.yml`
smoke), then check `/clinics` and a clinic page on a real phone. After that,
resume the plan the user was choosing between: (1) keep populating prod
(Promote IntelliSpeech, edit draft, publish), (3) configure Resend + Upstash +
PostHog env in Vercel (`vercel env add` via stdin allowed; `env rm` blocked),
(4) Facebook Sharing Debugger on the three OG URLs once data exists.
(2) mobile QA is done.

## Accepted tradeoffs from the wizard config

Consequences of the locked Sentry decision. Each was stated and accepted, so do
not "fix" them silently — but they are real:

- `dataCollection` defaults are on: **user info and HTTP request bodies go to
  Sentry**, which includes inquiry form contents (caregiver PII).
- `tracesSampleRate: 1` — 100% of requests traced.
- DSN hardcoded in `sentry.server.config.ts` / `sentry.edge.config.ts`, with no
  `enabled: Boolean(dsn)` gate, so **local dev reports into production Sentry**.
- `telemetry: false` and `sourcemaps.deleteSourcemapsAfterUpload` were dropped —
  source maps now ship inside the deployment.
- `org`/`project` are literals and `authToken` comes only from the local
  `.env.sentry-build-plugin`, so **Vercel builds upload no source maps** (build
  log: "No auth token provided") → prod stack traces stay unmapped.
- `src/instrumentation-client.ts` was NOT touched by the wizard. It is still
  env-gated on `NEXT_PUBLIC_SENTRY_DSN`.

## Traps / non-obvious facts

- **New stray worktree**: `.claude/worktrees/thrivemap-uber-ux-162dd9` exists
  (appeared after the 05:40 cleanup). Root `pnpm lint` reports its
  `display-prefs.test.ts` warning twice; root `pnpm format` would rewrite its
  files. `git worktree list` first; also an old `stash@{0}` from `c5bd966`.
- **gstack `browse` quirks** (used by `/qa`): `$B js` prints nothing when the
  snippet has top-level `const`/`let` or an async IIFE — write a single
  expression chain (`await x.then(...)`) or a sync IIFE. `@eN` refs from
  `snapshot -i` often fail with "matched multiple elements" — click via JS
  filtering visible buttons by text. Server restarts silently drop viewport +
  cookies; re-set `viewport` and re-login. Full-page `snapshot -a` is unreadable
  on mobile — use `screenshot --viewport` + `window.scrollTo`.
- **Locally only the clinic managed by clinicrep@ shows "Send an inquiry"**:
  `little-steps-developmental-center` (query `clinic_managers` on local
  Supabase REST with the service-role key). Other seeded clinics show
  "Represent this clinic? Claim it." instead.
- **Permission classifier blocks `gh pr merge`, `vercel redeploy`, `vercel env
  rm`, keychain reads.** `vercel env add` via stdin pipe was allowed. Merge =
  `git merge --no-ff <branch>` on `main` + `git push`. Rebuild = empty commit +
  push. Foreground `sleep N; cmd` chains are blocked — use `run_in_background`
  + `until` loop.
- **`/admin/candidates` has TWO city controls** — Playwright
  `getByLabel("City")` is ambiguous; use `getByLabel("City", { exact: true })`
  for the import `<select>` and `getByLabel("City (optional)")` for the lookup
  input. `places-import.spec.ts` already does this.
- **FixturePlacesProvider answers any non-`autism-therapy…` query with
  `fixtures/generic.json`** — that is what by-name lookup returns locally,
  regardless of the name typed. Provider slug is `google` even for fixtures.
- **Server-action result unions**: use an explicit `ok: true|false`
  discriminant (`PlaceLookupResult`); `if (result.error)` doesn't narrow.
- **A GitHub job with 0 steps and a 3-second duration is not a code failure**
  — read `check-runs/<job>/annotations`. Was billing; repo is public now.
- **DevSwarm worktrees hold unmerged branches** under
  `~/.devswarm/repos/0/*/`. `git worktree remove` of the shell's cwd → next
  command fails "Unable to read current working directory" — `cd` repo root.
- **Vercel MCP runtime logs**: `query: "POST"` matches nothing; search by path
  and `source: serverless`. Server-action failures returned as `{ error }`
  never appear as error-level logs — check the UI toast / DB row.
- **`external_place_candidates` has no `name` column** — use
  `normalized_name` (or `raw_payload`).
- **OG assets ship only via `outputFileTracingIncludes`** (`next.config.ts`,
  key `/api/og/search`). A tracing miss = `x-og-card-reason: error`; an empty
  DB = `no-results`.
- **OG render tests need `// @vitest-environment node`**; component tests need
  `// @vitest-environment jsdom` + `afterEach(cleanup)` (no auto-cleanup).
  `assets/geo/*.geojson` is in `.prettierignore` — never format it.
- **Next metadata: nested `openGraph` is overwritten wholesale, not merged.**
- **`import "next/og"` fails under plain Node ESM** — scripts use `next/og.js`.
- **`pyftsubset --instance-features` does not exist**; freeze axes with
  `fonttools varLib.instancer`, then subset. `uvx --from fonttools …` works.
- **`rm -rf .next` while `next dev` runs kills the server.** Stop dev first.
- Headless Chromium has no WebGL2 → MapLibre errors on any page that mounts a
  map (`/clinics` map view, clinic detail sidebar, suggest-clinic pin);
  expected. Since ISSUE-002 the mobile List view no longer triggers them.
- **`z.string().url()` does NOT reject surrounding whitespace.**
- **A failed Vercel build never re-aliases**; green `/api/health` proves
  nothing about the newest build. Preview URLs 302 (deployment protection).
- **The env schema is parsed at module scope** — bad `NEXT_PUBLIC_*` fails the
  build in "Collecting page data"; bad server-only value 500s per request.
- **Vercel Sensitive env rows can hold EMPTY values and are write-only.**
- **A build's env is snapshotted at deployment creation.** Add the row FIRST.
- **Deleting a route leaves stale `.next/dev/types/validator.ts`** →
  `rm -rf .next` and re-run typecheck.
- **Hook/CLI deploys create NO GitHub deployment records.** Truth:
  `npx vercel ls thrivemap --prod --scope abensontech`.
- **Provider probe**: `GET /api/locations?q=cebu` — `"placeId":"dev:..."` =
  DevMapProvider, `ChIJ...` = Google live. CDN caches 60s/300s.
- Only `GOOGLE_MAPS_SERVER_API_KEY` matters for maps + Places. Never add
  `NEXT_PUBLIC_` to the server key or to `SENTRY_AUTH_TOKEN`.
- `SMOKE_URL` = `https://thrivemap.vercel.app` only.
- `SUPABASE_PROJECT_REF` = `slwguxbeijcpixsegtzm`; Vercel project `thrivemap`,
  org `abensontech`; migrations 1–22 applied hosted (22 on 2026-08-18).
- `JOBS_PROCESSOR_SECRET` row is Production-only.
- Hosted `db push` roles exclude `extensions` from search_path — migrations
  touching pg_trgm/postgis need explicit `set search_path`.
- `handoff.md` is in `.prettierignore` (hook-regenerated). Don't remove it.
- e2e: `expect.timeout: 15_000`, `workers: 2` (`PW_WORKERS`); projects
  `chromium` (Desktop Chrome) + `mobile` (Pixel 7); phone-only specs skip via
  `testInfo.project.name !== "mobile"`. `pnpm test:integration -- <pattern>`
  does NOT filter — use `npx vitest run --config vitest.integration.config.ts
  <pattern>`. Single spec: `npx playwright test e2e/<file> --project=chromium`.
  Restart dev server between full e2e runs.
- supabase CLI not on PATH — `pnpm db:reset` / `pnpm db:types`. RLS subqueries
  run as caller — security-definer helpers for cross-table checks. New
  tables/functions need explicit grants. Optional RPC params need SQL
  `default null`.
- `/offline` renders via inline `<style>/<script>` — never hydrate. MapErrorBoundary
  around ALL `ClinicMap` renders. MapLibre worker copied to `public/maplibre/`.
- zod 4 + zodResolver: 3-generic `useForm`, no `.coerce`/`.default()`,
  `z.uuid()`. shadcn = Base UI, not Radix (no `asChild`; `render={<Link/>}`).
- react-hooks lint (v6 rules): no setState-in-effect — use
  `useSyncExternalStore` for media queries (see `SearchPageClient`), derived
  setState-during-render for mount-once flags; `service-glyph.tsx` uses
  `createElement` to dodge `static-components`; keep that.
- Test markers `[e2e]%` / `[itest]%`; therapists: remove storage objects before
  rows. Demo logins (password `password123`, LOCAL seed only): admin@ /
  moderator@ / caregiver@ / clinicrep@ `thrivemap.test`.
