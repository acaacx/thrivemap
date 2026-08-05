# Handoff — ThriveMap (dir: ausomeapp)

## What we are trying to do

Build **ThriveMap** (product name everywhere; directory stays `ausomeapp`): a Philippines-first, autism-focused clinic directory. Phase 1 (clinic discovery MVP) is complete. We are now into Phase 2 (`docs/phase-2-plan.md`); Phase 2 feature 1 — **Google Places import** — is finished as of this session.

**Locked decisions (do not relitigate):**

- No external credentials — everything runs on local Supabase + `[DEV ADAPTER]`-marked fallbacks (maps, rate limit, email, analytics, Sentry/PostHog, and now the Places fixture provider). Real providers env-gated; setup documented in `.env.example` (now actually tracked in git — see traps).
- Background jobs = pg-based queue (`jobs` table + pg_cron + processor route at `/api/internal/jobs/process`, protected by the `x-jobs-secret` header — NOT `Authorization: Bearer`).
- Single Next.js app, domain modules under `src/modules/` (now includes `imports`). No monorepo.
- Design: "Warm Horizon" — Fraunces + Nunito Sans, warm cream bg, deep teal primary, coral accent. Theme in `src/app/globals.css`.
- Import queries are always the fixed template `"{service term} in {city}, Philippines"` — 5 approved terms in `src/modules/imports/query.ts`, no free text.
- Fixture provider's `name` is `"google"` on purpose (fixture rows share the `(provider, external_id)` space with future live rows; fixture ids are prefixed `fixture-` and cleaned by tests).

## Finished and verified

Working tree clean; `main` at `ea2f4d1`, pushed to https://github.com/acaacx/thrivemap (private).

- **Phase 1 MVP** (stages 1–4 + polish, commits `07732f0`…`d107c2f`): schema+PostGIS+RLS (migrations 1–16), public directory, auth, favorites, submissions, claims, clinic portal, admin console, job queue + handlers, email/cache/security hardening, CI, docs. See git history for detail.
- **Places import** (this session, commits `bb4a250`…`ea2f4d1`, plan `docs/superpowers/plans/2026-08-06-places-import.md`, spec in `docs/superpowers/specs/`):
  - Migration 17 (`20260806000017_candidate_matching.sql`): `match_candidate_clinics` (trigram + proximity + place-id, security definer, moderator-gated), `promote_candidate` (draft clinic + location via `nearest_ph_city` + source record + candidate marked), `attach_candidate` (source record on existing clinic, backfills free `google_place_id`). Explicit grants per hardened-defaults convention.
  - `src/modules/imports/`: `PlacesProvider` interface; `FixturePlacesProvider` (`[DEV ADAPTER]`, deterministic JSON fixtures mirroring Places API (New) shape); `GooglePlacesProvider` (Text Search POST, minimal field mask, `nextPageToken` pagination capped at `MAX_PAGES = 3`, injectable fetch); `normalizeGooglePlace` zod normalizer; `buildImportQuery` + `IMPORT_SERVICE_TERMS`; `getPlacesProvider()` factory keyed on `GOOGLE_MAPS_SERVER_API_KEY`.
  - `runPlacesImport` (`src/modules/imports/server.ts`) wired into the `candidate_import` job: upserts on `(provider, external_id)`, refreshes data columns, preserves `status`/`reviewed_by`/`reviewed_at` — discarded candidates never resurrect.
  - Admin: `triggerCandidateImportAction` (rate-limited 10/hr/admin, idempotency key `candidate-import:{term}:{city}:{day}`), `promoteCandidateAction`, `attachCandidateAction`; server queries `listCandidateMatches`/`listImportCities`/`listRecentImportJobs`; rebuilt `/admin/candidates` page + `ImportTriggerCard` (native `<select>`s on purpose — Playwright-friendly).
  - e2e `e2e/places-import.spec.ts` (chromium-only, idempotent, DB-polls for fixture rows after the tick instead of trusting UI badges); docs updated (`docs/architecture/jobs.md` candidate_import section, `dev-adapters.md` table row, `deployment.md` provider row, `.env.example` comment).
  - **Bonus fix** (`f5b12fb`): pre-submit duplicate check (`findLikelyDuplicates` in `src/modules/submissions/actions.ts`) now passes `p_sort: "relevance"` — the default `nearest` sort buried exact-name matches once no origin was set; the seeded reference data (migration 16) grew enough that the e2e duplicate-check test caught it.

**Test state (verified this session, 2026-08-06, all green):** typecheck clean; lint 0 errors 0 warnings; 71 unit, 40 integration, 48 e2e passed + 6 skipped by design (5 pre-existing chromium-only stage-3/favorites skips + places-import's mobile skip); prod build clean (no database needed).

Also verified live in the browser: queue import → toast → job tick → fixture candidates render with match scores and same-place-id badges; re-import kept a discarded candidate discarded.

Demo logins (local, password `password123`): admin@ / moderator@ / caregiver@ / clinicrep@ `thrivemap.test`.

## Half-done / not started

Nothing half-done. Remaining Phase 2 candidates (`docs/phase-2-plan.md`): therapist profiles, inquiries/booking, reviews, i18n, PWA. Live Google imports need a real `GOOGLE_MAPS_SERVER_API_KEY` (user's call — breaks the no-credentials rule; everything else about the pipeline is done and fixture-tested).

## Single next action

Nothing queued — ask the user. Live options: next Phase 2 feature from `docs/phase-2-plan.md`, or the deployment dry-run per `docs/operations/deployment.md`.

## Traps / non-obvious facts

- **Port 3000 squatter is real and ACTIVE** (node PID varies — a different app, "Verified VA Jobs"). Playwright's `reuseExistingServer` will happily test the wrong app on 3000. Run e2e as `PLAYWRIGHT_BASE_URL=http://localhost:<preview-port> pnpm test:e2e` against the preview dev server, or ensure 3000 is free.
- **In-memory rate limiter accumulates across e2e runs** on a long-lived dev server (sign-in/submit limits) — repeated full-suite runs start timing out on `waitForURL` after login. Restart the dev server (preview_stop/preview_start) between full e2e runs.
- **Jobs processor route auth**: header is `x-jobs-secret: <JOBS_PROCESSOR_SECRET>`, not a Bearer token. Local secret in `.env.local`. Useful for manually ticking the queue: `curl -X POST -H "x-jobs-secret: $SECRET" http://localhost:<port>/api/internal/jobs/process`.
- **`.env*` was gitignored including `.env.example`** — it silently never got committed until `ea2f4d1` added a `!.env.example` exception. Watch for other "documented but ignored" files.
- **Vitest integration config** (`vitest.integration.config.ts`) now stubs `server-only` (alias → `tests/integration/helpers/server-only-stub.ts`) and loads `.env.local` via a tiny KEY=VALUE parser (vite's `loadEnv` is NOT importable — `vite` isn't a direct dependency and `vitest/config` doesn't re-export it). Integration tests can now import real server modules.
- **`external_place_candidates.raw_payload` is NOT NULL** — every insert (tests included) must supply it.
- **A fetch-mock `Response` body can be read once** — `vi.fn().mockResolvedValue(jsonResponse(...))` breaks paginating code on the second call; use `mockImplementation` returning a fresh Response.
- **e2e waits**: don't assert on the jobs table's "completed" badge to detect job completion — other suites leave completed jobs in the table; poll the DB (`expect.poll` + service-role client) instead.
- **Pre-existing `git stash`** (`stash@{0}` on `c5bd966`) — not from these sessions, left untouched.
- **shadcn = Base UI, not Radix.** No `asChild`; `render={<Link …/>}`; `CardTitle` is a plain div.
- **Supabase hardened defaults**: new tables/functions get NO grants — add explicit grants (see migration 8 and the bottom of migration 17).
- **Extensions live in `extensions` schema** — `extensions.st_setsrid(...)` etc. in SQL.
- **pnpm 11**: build-script approvals in `pnpm-workspace.yaml` `allowBuilds:`.
- **e2e state leakage**: demo accounts shared; tests idempotent (clean own data first). Chromium-only for anything mutating shared accounts.
- **Browser-pane flakiness**: `read_page` sometimes returns "(empty page)" and the pane can hang on scroll — verify flows via Playwright, not the preview pane. Map doesn't init while pane hidden.
- **float8 doesn't round-trip through PostgREST** — round in SQL before keyset comparisons (migration 15's `sort_value`).
- Re-running migration 15 by hand fails ("function already exists") — drop the new signature explicitly or `pnpm db:reset`.
- Suggest-form zod schema must keep input==output types (no `.coerce`/`.default()`) or `zodResolver` type-errors.
- Claim uploads path must be `<user_id>/<claim_id>/...` (storage policy, migration 7).
- Seeded auth users need empty-string token columns AND an `auth.identities` row or password sign-in fails empty.
