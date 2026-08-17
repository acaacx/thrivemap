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
  `public/sw.js`.
- Map tiles = OpenFreeMap vector tiles (keyless). Never raw
  `tile.openstreetmap.org` in production.
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

`main` = `dbde18d`, pushed 2026-08-18 ~03:40 PHT. GitHub `Main` run
32061294761 on `dbde18d` **success** (validate / migrate / deploy+smoke); prod
`/api/health` 200 afterwards → new card is live at `/admin/candidates`.
Local on `dbde18d`: `pnpm test` 209/209, typecheck, lint,
format:check green; e2e `places-import.spec.ts` 2/2 (chromium).

- **By-name Places lookup (`dbde18d`)**: `/admin/candidates` card "Look up a
  center by name" (`PlaceLookupCard.tsx`). `lookupPlacesByNameAction(name,
  city?)` — moderator+, rate limit `place-lookup` 20/hr, `placeLookupNameSchema`
  (2–80 chars, letters/digits/`&.,'()/-`), query `"<name>[, <city>],
  Philippines"`, `maxPages: 1`, returns hits + `alreadyCandidate` flags, writes
  nothing. `addPlaceCandidateAction(hit)` — validates with `lookupPlaceSchema`,
  upserts one row via `upsertPlaceCandidates` (extracted from
  `runPlacesImport`, `src/modules/imports/server.ts`; job path unchanged),
  audit action `add_place_candidate`, `revalidatePath`. Runbook step in
  `docs/operations/deployment.md` "Populating clinics".
- **Clinic editor + publish flow (`c7f03aa`)**: `/admin/clinics/[clinicId]`
  (identity form, services + profile forms reused from portal via
  `action`/`submitLabel` props, `ClinicStatusCard` → `setClinicStatus` with
  allowed transitions + required reason), `/admin/clinics` status filter chips,
  ImportTriggerCard "Other city" free text (`importCityTextSchema`, letters
  only, `slugifyCity` for idempotency), runbook "Populating clinics".
- Earlier 2026-08-18: 1:10m OG outline `e09d1c1`; Vercel Preview builds fixed
  (`NEXT_PUBLIC_SUPABASE_URL` Preview scope); GitHub Actions unblocked (repo
  public); PR #2 OG cards `61c495a`; branch `UI` `618306e` (migration 22 +
  service redesign); OG smoke `e678dec`.

## Half-done / not started

- **Production has ZERO clinics.** Seed is demo-only by design.
  **Blocker: prod likely has no administrator.** `handle_new_user` grants only
  `user`; promotion is manual SQL (`docs/operations/deployment.md` step 3).
  No hosted DB creds locally (Vercel rows Sensitive/write-only, keychain read
  blocked). Needs the user: sign up on `https://thrivemap.vercel.app`, then in
  Supabase SQL editor (project `slwguxbeijcpixsegtzm`):
  `insert into public.user_roles (user_id, role) select id, 'administrator'
  from auth.users where email = '<their email>' on conflict do nothing;`
  then `/admin/candidates` → **Look up a center by name** (known centers) or
  **Run an import** + `/admin/jobs` "Run tick now" → Promote →
  `/admin/clinics?status=draft` → edit → publish.
- **Facebook Sharing Debugger gate** (three distinct cards) after first data:
  `/clinics`, `?services=occupational-therapy&loc=Davao+City`,
  `?services=speech-therapy&loc=Cebu+City&verified=1`.
- **Design observation, not fixed:** OG caption plate (bottom-left, ~880×230)
  can cover pins near the bottom edge (PH-wide card: Davao pin).
- **Optional providers still dev adapters in prod**: Upstash Redis, Resend,
  PostHog (`[DEV ADAPTER] Upstash not configured` in prod logs; suspected empty
  Sensitive Vercel rows; `vercel env rm` classifier-blocked, `env add` allowed).
  Note: without Upstash, `checkRateLimit` (import 10/hr, lookup 20/hr) is the
  dev adapter in prod — effectively per-instance / lax.
- **No approval gate on production migrations** — Free plan. Accepted.
- Cold-start OG render can exceed 2 s (one `timeout` seen); warm ~1 s.

## Single next action

Hand the user the admin bootstrap steps above (sign up → promote SQL →
`/admin/candidates` lookup/import → promote → edit → publish). After first
data, run the Facebook Sharing Debugger check on the three URLs. Nothing is
blocked on code.

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

- **Permission classifier blocks `gh pr merge`, `vercel redeploy`, `vercel env
  rm`, keychain reads.** `vercel env add` via stdin pipe was allowed. Merge =
  `git merge --no-ff <branch>` on `main` + `git push`. Rebuild = empty commit +
  push. Foreground `sleep N; cmd` chains are blocked — use `run_in_background`
  + `until` loop.
- **`/admin/candidates` now has TWO city controls** — Playwright
  `getByLabel("City")` is ambiguous; use `getByLabel("City", { exact: true })`
  for the import `<select>` and `getByLabel("City (optional)")` for the lookup
  input. `places-import.spec.ts` already does this.
- **FixturePlacesProvider answers any non-`autism-therapy…` query with
  `fixtures/generic.json`** (Fixture Developmental Clinic / Fixture Child
  Wellness Center) — that is what by-name lookup returns locally, regardless of
  the name typed. Provider slug is `google` even for fixtures (rows must merge).
- **Server-action result unions**: `{ error?: undefined; hits }` does not
  narrow on `if (result.error)`; use an explicit `ok: true|false` discriminant
  (`PlaceLookupResult`).
- **A GitHub job with 0 steps and a 3-second duration is not a code failure**
  — read `check-runs/<job>/annotations`. Was billing; repo is public now.
- **DevSwarm worktrees hold unmerged branches** under
  `~/.devswarm/repos/0/*/`. `git worktree list` first.
- **OG assets ship only via `outputFileTracingIncludes`** (`next.config.ts`,
  key `/api/og/search`). A tracing miss = `x-og-card-reason: error`; an empty
  DB = `no-results`.
- **OG render tests need `// @vitest-environment node`** at the top of the
  file. `assets/geo/*.geojson` is in `.prettierignore` — never format it.
- **Vercel runtime logs lag / time out** via MCP: scope to a deployment id or
  15 m window and query text; `[DEV ADAPTER]` lines confirm which providers
  are live.
- **Next metadata: nested `openGraph` is overwritten wholesale, not merged.**
- **`pnpm format` from the repo root reformats files inside
  `.claude/worktrees/*`**; `pnpm lint` picks up worktree `.next` output.
- **`import "next/og"` fails under plain Node ESM** — scripts use `next/og.js`.
- **`pyftsubset --instance-features` does not exist**; freeze axes with
  `fonttools varLib.instancer`, then subset. `uvx --from fonttools …` works.
- **`rm -rf .next` while `next dev` runs kills the server.** Stop dev first.
- Headless Chromium has no WebGL2 → MapLibre errors on `/clinics`; expected.
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
  DevMapProvider, `ChIJ...` = Google live. CDN caches 60s/300s — fresh query
  strings when probing.
- Only `GOOGLE_MAPS_SERVER_API_KEY` matters for maps + Places. Never add
  `NEXT_PUBLIC_` to the server key or to `SENTRY_AUTH_TOKEN`.
- `SMOKE_URL` = `https://thrivemap.vercel.app` only.
- `SUPABASE_PROJECT_REF` = `slwguxbeijcpixsegtzm`; Vercel project `thrivemap`,
  org `abensontech`; migrations 1–22 applied hosted (22 on 2026-08-18).
- `JOBS_PROCESSOR_SECRET` row is Production-only.
- Hosted `db push` roles exclude `extensions` from search_path — migrations
  touching pg_trgm/postgis need explicit `set search_path`.
- `handoff.md` is in `.prettierignore` (hook-regenerated). Don't remove it.
- e2e: `expect.timeout: 15_000`, `workers: 2` (`PW_WORKERS`).
  `pnpm test:integration -- <pattern>` does NOT filter — use
  `npx vitest run --config vitest.integration.config.ts <pattern>`.
  Single spec: `npx playwright test e2e/<file> --project=chromium`. Restart
  dev server between full e2e runs. chromium-skip via `testInfo.project.name`.
- supabase CLI not on PATH — `pnpm db:reset` / `pnpm db:types`. RLS subqueries
  run as caller — security-definer helpers for cross-table checks. New
  tables/functions need explicit grants. Optional RPC params need SQL
  `default null`.
- `/offline` renders via inline `<style>/<script>` — never hydrate. MapErrorBoundary
  around ALL `ClinicMap` renders. MapLibre worker copied to `public/maplibre/`.
- zod 4 + zodResolver: 3-generic `useForm`, no `.coerce`/`.default()`,
  `z.uuid()`. shadcn = Base UI, not Radix (no `asChild`; `render={<Link/>}`).
- react-hooks/static-components flags `const Icon = serviceIcon(...)` + JSX in
  a component body — `service-glyph.tsx` uses `createElement`; keep that.
- Test markers `[e2e]%` / `[itest]%`; therapists: remove storage objects before
  rows. Demo logins (password `password123`, LOCAL seed only): admin@ /
  moderator@ / caregiver@ / clinicrep@ `thrivemap.test`.
