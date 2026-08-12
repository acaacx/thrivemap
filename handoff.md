# Handoff — ThriveMap (dir: ausomeapp)

## What we are trying to do

Build **ThriveMap** (product name everywhere; directory stays `ausomeapp`): a
Philippines-first, autism-focused clinic directory. Phase 1 (clinic discovery
MVP) and Phase 2 (`docs/phase-2-plan.md` — Places import, therapist profiles,
inquiries, ratings, PWA) are complete. Multilingual **dropped entirely**
(decision 2026-08-10). Job-runner upgrade conditional-only.

**The app is live in production.** Current session = post-launch ops: Sentry
activation.

**Locked decisions (do not relitigate):**

- Local dev uses local Supabase + `[DEV ADAPTER]` fallbacks (maps, rate limit,
  email, analytics, PostHog, Places fixture provider). Real providers env-gated,
  documented in `.env.example` / `docs/operations/deployment.md`.
- Background jobs = pg queue (`jobs` table + cron + `/api/internal/jobs/process`).
  Entrypoints: POST + `x-jobs-secret` (external schedulers) and Vercel Cron GET +
  `Authorization: Bearer $CRON_SECRET`.
- Single Next.js app, domain modules under `src/modules/`. No monorepo.
- Design: "Warm Horizon" — Fraunces + Nunito Sans, warm cream, deep teal, coral.
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
  user decision made with the tradeoffs stated). This deliberately overrides the
  earlier `sendDefaultPii: false` stance. See "Accepted tradeoffs" below —
  reverting is a three-file `git checkout`, not a redesign.

## Finished and verified

`main` = `c498239`, pushed. `Main` green on it (validate ✅ migrate ✅
deploy+smoke ✅), `PR checks` green, `Jobs drain` green. Commits this session:

- `b4a25c0` chore: empty commit to rebuild after the DSN rows were added.
  **This build FAILED** — see the env trap below.
- `6daea81` fix(env): `providerFlags` read `process.env` directly, bypassing the
  schema sanitising, so a row holding only whitespace reported a provider as
  configured and silently disabled its dev adapter. Added trim in
  `withoutEmpty()` + a shared `isSet()`. New `src/lib/env.test.ts` (3 cases,
  node environment — `serverEnv()` refuses to run when `window` exists).
- `c498239` chore: applied the Sentry wizard output; removed the generated
  `/sentry-example-page` and `/api/sentry-example-api` after using them locally.

**Sentry is live in production and verified three ways:**

1. DSN accepts events — synthetic envelope POSTed to the ingest endpoint
   returned `http=200`, event `1880f88d583e44b1a35442e18a36865f` (search Sentry
   for logger `thrivemap-verification`).
2. Server path — the example route threw locally, `onRequestError` wrote its
   structured log, `captureRequestError` ran with no transport error.
3. Prod bundle contains both `o4511897577586688.ingest.us.sentry.io` and the
   `/monitoring` tunnel route. Baseline before the deploy was zero matches.

`/api/health` → `{"app":"ok","db":"ok","jobs":"ok"}` after the deploy.

Sentry coordinates: org `abenson-tech`, project `thrivemap`, DSN
`https://f19fc8d483e1fda31821255de50ef1b2@o4511897577586688.ingest.us.sentry.io/4511897613172736`
(a DSN is ingest-only and ships in the browser bundle — not a secret;
`SENTRY_AUTH_TOKEN` is).

## Accepted tradeoffs from the wizard config

Consequences of the locked decision above. Each was stated and accepted, so do
not "fix" them silently — but they are real:

- `dataCollection` defaults are on: **user info and HTTP request bodies go to
  Sentry**, which includes inquiry form contents (caregiver PII).
- `tracesSampleRate: 1` — 100% of requests traced.
- DSN hardcoded in `sentry.server.config.ts` / `sentry.edge.config.ts`, with no
  `enabled: Boolean(dsn)` gate, so **local dev reports into production Sentry**.
- `telemetry: false` and `sourcemaps.deleteSourcemapsAfterUpload` were dropped —
  source maps now ship inside the deployment.
- `org`/`project` are literals and `authToken` comes only from the local
  `.env.sentry-build-plugin`, so **CI uploads no source maps** → prod stack
  traces stay unmapped.
- `src/instrumentation-client.ts` was NOT touched by the wizard. It is still
  env-gated on `NEXT_PUBLIC_SENTRY_DSN`, which is why that Vercel row still
  matters and still gates the build.

## Half-done / not started

- **Source maps in CI**: add `SENTRY_AUTH_TOKEN` as a Vercel env var (it exists
  only in the gitignored local `.env.sentry-build-plugin`). Until then the
  build logs warn "No auth token provided. Will not upload source maps."
- **Optional providers still dev adapters**: Upstash Redis, Resend, PostHog.
  Their Vercel rows are suspected empty Sensitive rows — `rm` + re-add each,
  then rebuild.
- **No approval gate on production migrations** — GitHub required reviewers need
  a paid plan on private repos; `acaacx/thrivemap` is Free. Accepted knowingly.
- `DEPLOY_HOOK_URL` GitHub secret is unused — optional
  `gh secret delete DEPLOY_HOOK_URL`.

## Single next action

Ask the user: add `SENTRY_AUTH_TOKEN` to Vercel so prod stack traces get source
maps, or move to the remaining optional providers (Upstash/Resend/PostHog), or
start new feature work.

## Traps / non-obvious facts

- **`z.string().url()` does NOT reject surrounding whitespace** — it delegates
  to the WHATWG URL parser, which strips it. A newline-padded DSN builds fine.
  The `b4a25c0` build died on `NEXT_PUBLIC_SENTRY_DSN` being malformed some
  other way (quoted, scheme-less, or key-only). Do not chase whitespace when
  you see `"Invalid URL"`.
- **A failed Vercel build never re-aliases**, so prod stays on the last good
  deployment and `/api/health` keeps returning ok. Green health proves nothing
  about the newest build.
- **The env schema is parsed at module scope**, so a bad `NEXT_PUBLIC_*` value
  fails the build during "Collecting page data", while a bad server-only value
  survives the build and throws per-request instead — that would 500 every route
  calling `serverEnv()`, `/api/health` included. Fix both DSN rows together.
- **Vercel Sensitive env rows can hold EMPTY or malformed values and are
  write-only** — an existing row proves nothing. `rm` + re-add.
- **The permission classifier blocks `vercel redeploy` and `vercel env rm/add`**
  in this setup. Ask the user to run them; the repo's own reliable rebuild path
  is an empty commit + push (Vercel git integration).
- **Deleting a route leaves stale `.next/dev/types/validator.ts` entries** and
  `pnpm typecheck` then fails on modules that no longer exist. `rm -rf .next`
  and re-run — it is not a real error.
- **Hook/CLI deploys create NO GitHub deployment records** — only
  git-integration builds appear (creator `vercel[bot]`). Truth:
  `npx vercel ls thrivemap --prod --scope abensontech`.
- **Provider probe**: `GET /api/locations?q=cebu` — `"placeId":"dev:..."` =
  DevMapProvider, `ChIJ...` = Google live. CDN caches 60s/300s — use fresh query
  strings when probing.
- Only `GOOGLE_MAPS_SERVER_API_KEY` matters for maps;
  `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY` is vestigial. Never add
  `NEXT_PUBLIC_` to the server key or to `SENTRY_AUTH_TOKEN`.
- `SMOKE_URL` = `https://thrivemap.vercel.app` only — per-deployment URLs are
  frozen builds; `thrivemap-abensontech.vercel.app` 302s.
- `SUPABASE_PROJECT_REF` = `slwguxbeijcpixsegtzm`; Vercel project `thrivemap`,
  org `abensontech`; migrations 1–21 applied hosted.
- `JOBS_PROCESSOR_SECRET` rotation (2026-08-12) dropped the Preview scope — the
  row is Production-only. Re-add Preview if preview deploys need to drain jobs.
- Hosted `db push` roles exclude `extensions` from search_path — migrations
  touching pg_trgm/postgis need explicit `set search_path`.
- `handoff.md` is in `.prettierignore` (hook-regenerated). Don't remove it.
- e2e: `expect.timeout: 15_000`, `workers: 2` (`PW_WORKERS`) — do not revert.
  `pnpm test:integration -- <pattern>` does NOT filter — use
  `npx vitest run --config vitest.integration.config.ts <pattern>`.
  Restart dev server between full e2e runs. Port 3000 squatter: set
  `PLAYWRIGHT_BASE_URL`. chromium-skip via `testInfo.project.name`.
- supabase CLI not on PATH — `pnpm db:reset` / `pnpm db:types`. RLS subqueries
  run as caller — security-definer helpers for cross-table checks. New
  tables/functions need explicit grants. Optional RPC params need SQL
  `default null`.
- `/offline` renders via inline `<style>/<script>` — never convert to hydrated
  React. MapErrorBoundary around ALL `ClinicMap` renders. MapLibre worker copied
  to `public/maplibre/` by postinstall.
- zod 4 + zodResolver: 3-generic `useForm`, no `.coerce`/`.default()`,
  `z.uuid()`. shadcn = Base UI, not Radix (no `asChild`; `render={<Link/>}`).
- Test markers `[e2e]%` / `[itest]%`; therapists: remove storage objects before
  rows. Demo logins (password `password123`): admin@ / moderator@ / caregiver@ /
  clinicrep@ `thrivemap.test`.
