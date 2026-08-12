# Handoff — ThriveMap (dir: ausomeapp)

## What we are trying to do

Build **ThriveMap** (product name everywhere; directory stays `ausomeapp`): a
Philippines-first, autism-focused clinic directory. Phase 1 (clinic discovery
MVP) complete. Phase 2 (`docs/phase-2-plan.md`) complete: Places import,
therapist profiles, inquiries, ratings, PWA. Multilingual **dropped entirely**
(decision 2026-08-10). Job-runner upgrade conditional-only — skip unless the pg
queue outgrows itself.

**The app is live in production.** Current session = post-launch ops cleanup.

**Locked decisions (do not relitigate):**

- Local dev uses local Supabase + `[DEV ADAPTER]` fallbacks (maps, rate limit,
  email, analytics, Sentry/PostHog, Places fixture provider). Real providers
  env-gated, documented in `.env.example` / `docs/operations/deployment.md`.
- Background jobs = pg queue (`jobs` table + cron + `/api/internal/jobs/process`).
  Entrypoints: POST + `x-jobs-secret` (external schedulers) and Vercel Cron GET +
  `Authorization: Bearer $CRON_SECRET` (Vercel Cron can't POST/custom headers).
- Single Next.js app, domain modules under `src/modules/`. No monorepo.
- Design: "Warm Horizon" — Fraunces + Nunito Sans, warm cream, deep teal, coral.
- Ratings: structured only, NO free text anywhere (RA 10175 anti-defamation,
  enforced by schema). Spec `docs/superpowers/specs/2026-08-08-clinic-ratings-design.md`.
- PWA: manifest + offline shell + offline favorites snapshot ONLY; hand-rolled
  `public/sw.js`. Spec `docs/superpowers/specs/2026-08-08-pwa-design.md`.
- Map tiles = OpenFreeMap vector tiles (keyless). Never raw
  `tile.openstreetmap.org` in production.
- **Deploys are owned by Vercel git integration** (decision 2026-08-12).
  `main.yml` deploy job no longer fires `DEPLOY_HOOK_URL`; it waits for the
  Vercel deployment via the GitHub deployments API, then smoke tests. The
  double-deploy-per-push problem is fixed and verified.

## Finished and verified

`main` = `db36a8a`, pushed. Full `Main` pipeline green on it: validate ✅
migrate ✅ deploy ✅ (deploy = wait-for-Vercel + smoke, first live success of
the new path). Commits this session:

- `89e153b` ci: single deploy path + scheduled jobs drain — removed
  DEPLOY_HOOK_URL trigger; deploy job polls GitHub deployments API for the
  `vercel[bot]` deployment of `$GITHUB_SHA`, waits for `success`, then curls
  `$SMOKE_URL/api/health`. New `.github/workflows/jobs-drain.yml`: every 10 min
  + `workflow_dispatch`, POSTs `$SMOKE_URL/api/internal/jobs/process` with
  `x-jobs-secret` — supplements the Hobby once-daily Vercel cron (vercel.json
  stays `0 0 * * *` as backup).
- `4e350e2` docs: `.prettierignore` now ignores `handoff.md` (hook-generated,
  broke `prettier --check` on every PR-checks run of main); deployment.md
  Google-key row corrected (API-restricted Places New + Geocoding, app
  restriction deliberately None — Vercel egress IPs dynamic) + warning about
  empty Sensitive env rows.
- `db36a8a` ci: deploy job needs `permissions: deployments: read` — default
  GITHUB_TOKEN has no deployments scope, wait step 403'd without it.

Also verified this session:

- **`SUPABASE_DB_PASSWORD` rotated** (was exposed in a chat transcript).
  User reset it; secret updated; migrate job green since. Exposure item CLOSED.
- **Google Maps key LIVE in production.** Root cause of it never activating:
  the Vercel env row existed since 2026-08-10 but held an EMPTY value —
  Sensitive vars can't be read back, so it looked "set" forever. Fixed by
  `vercel env rm` + re-add (value piped via `pbpaste`, never in transcript) +
  redeploy. Verified: `/api/locations?q=cebu+city` returns real Google
  `ChIJ...` placeIds (dev provider returns `dev:` prefixes); placeId geocode
  works; health green.
- All 16 Vercel env vars were bulk-created 2026-08-10 as type Sensitive; the
  optional-provider rows (Upstash/Resend/PostHog/Sentry, NEXT_PUBLIC_POSTHOG_*)
  are suspected empty too (PostHog absent from the built bundle).

## Half-done / not started

- **`JOBS_PROCESSOR_SECRET` rotation FAILING on the user's side — 4 attempts,
  zero effect server-side.** Goal: same fresh value in BOTH
  `gh secret set JOBS_PROCESSOR_SECRET -R acaacx/thrivemap` AND Vercel env
  (Production, Sensitive), because the prod value is unreadable and the new
  jobs-drain workflow needs the pair to match. After Vercel side: redeploy
  (env vars only apply to new builds). Verify with `gh secret list` +
  `npx vercel env ls --scope abensontech --project thrivemap` — the Vercel row
  must show a fresh created-time, not "2d ago". Diagnosis in flight: user was
  asked to run `gh auth status` and a throwaway
  `gh secret set JOBS_PROCESSOR_SECRET -R acaacx/thrivemap --body test-echo-check`
  to see the actual error (suspect wrong gh/vercel account in their terminal).
  **Until this lands, `jobs-drain.yml` fails every 10 min** — red runs in
  Actions are expected noise, not a code bug. After it lands, run
  `gh workflow run jobs-drain.yml` and confirm green, then health `jobs: ok`.
- **PR checks on `db36a8a` was still in_progress at session end** — expected
  green (prettier gate fixed). Confirm: `gh run list --workflow "PR checks" -L 1`.
- **Optional providers still dev adapters**: Upstash Redis, Resend, PostHog,
  Sentry. Activation needs user-created accounts/keys. Their existing Vercel
  rows are probably empty Sensitive rows — rm + re-add each (recovery steps now
  documented in `docs/operations/deployment.md`), then redeploy.
- **No approval gate on production migrations** — GitHub required reviewers need
  a paid plan on private repos; `acaacx/thrivemap` is Free. Accepted knowingly
  or upgrade. Not an oversight.
- `DEPLOY_HOOK_URL` GitHub secret is now unused — optional cleanup:
  `gh secret delete DEPLOY_HOOK_URL`.

## Single next action

Get the `JOBS_PROCESSOR_SECRET` rotation to actually land (see above — verify
server-side after every attempt; user's local runs have failed silently four
times). Then dispatch jobs-drain and confirm green. Then confirm PR checks
green on `db36a8a`. Then ask the user: activate optional providers, or new
feature work.

## Traps / non-obvious facts

- **Vercel Sensitive env rows can hold EMPTY values and are write-only** — an
  existing row proves nothing. rm + re-add via clipboard pipe. This exact trap
  kept Google Maps dead through three fresh builds.
- **Hook/CLI deploys create NO GitHub deployment records** — only
  git-integration builds appear (creator `vercel[bot]`, env `Production`).
  Lowercase `production` rows with creator=acaacx are GitHub Actions
  environment records, not builds. Truth: `npx vercel ls thrivemap --prod
  --scope abensontech`.
- **Provider probe**: `GET /api/locations?q=cebu` — `"placeId":"dev:..."` =
  DevMapProvider, `ChIJ...` = Google live. CDN caches 60s/300s — use fresh
  query strings when probing.
- **`gh secret set` needs repo context or `-R acaacx/thrivemap`**; the linked
  Supabase CLI reads the DB password from the OS keychain, so green local
  `migration list --linked` proves nothing about the CI secret.
- Only `GOOGLE_MAPS_SERVER_API_KEY` matters for maps;
  `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY` is vestigial (tiles are
  OpenFreeMap). Never add `NEXT_PUBLIC_` to the server key.
- **Vercel env changes need a new build**; `vercel redeploy <ready-url> --scope
  abensontech` is the fastest way and re-aliases `thrivemap.vercel.app`.
- `SMOKE_URL` = `https://thrivemap.vercel.app` only — per-deployment URLs are
  frozen builds; `thrivemap-abensontech.vercel.app` 302s.
- `SUPABASE_PROJECT_REF` = `slwguxbeijcpixsegtzm`; Vercel project `thrivemap`,
  org `abensontech`; migrations 1–21 applied hosted.
- GitHub environment names case-insensitive: `environment: production` matches
  Vercel's `Production`. Not a bug.
- Hosted `db push` roles exclude `extensions` from search_path — migrations
  touching pg_trgm/postgis need explicit `set search_path`; green locally
  proves nothing.
- `handoff.md` is in `.prettierignore` (hook-regenerated; one-time `--write`
  never sticks). Don't remove the ignore entry.
- e2e: `expect.timeout: 15_000`, `workers: 2` (`PW_WORKERS`) — do not revert.
  `pnpm test:integration -- <pattern>` does NOT filter — use
  `npx vitest run --config vitest.integration.config.ts <pattern>`.
  Restart dev server between full e2e runs (in-memory rate limiter). Port 3000
  squatter: set `PLAYWRIGHT_BASE_URL`. chromium-skip via
  `testInfo.project.name`, not `browserName`.
- supabase CLI not on PATH — `pnpm db:reset` / `pnpm db:types`. RLS subqueries
  run as caller — security-definer helpers for cross-table checks. New
  tables/functions need explicit grants. Optional RPC params need SQL
  `default null`.
- `/offline` renders via inline `<style>/<script>` — never convert to hydrated
  React. MapErrorBoundary around ALL `ClinicMap` renders. MapLibre worker
  copied to `public/maplibre/` by postinstall — "non-JavaScript MIME type"
  console error means that copy is missing.
- zod 4 + zodResolver: 3-generic `useForm`, no `.coerce`/`.default()`,
  `z.uuid()`. shadcn = Base UI, not Radix (no `asChild`; `render={<Link/>}`).
- Test markers `[e2e]%` / `[itest]%`; therapists: remove storage objects before
  rows. Demo logins (password `password123`): admin@ / moderator@ / caregiver@ /
  clinicrep@ `thrivemap.test`.
- Jobs processor local:
  `curl -X POST -H "x-jobs-secret: $SECRET" http://localhost:<port>/api/internal/jobs/process`.
