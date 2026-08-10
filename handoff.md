# Handoff — ThriveMap (dir: ausomeapp)

## What we are trying to do

Build **ThriveMap** (product name everywhere; directory stays `ausomeapp`): a
Philippines-first, autism-focused clinic directory. Phase 1 (clinic discovery
MVP) complete. Phase 2 (`docs/phase-2-plan.md`) complete: 1 Places import,
2 Therapist profiles, 3 Inquiries, 4 Ratings, 6 PWA. Feature 5 (Multilingual)
**dropped entirely** (decision 2026-08-10; was previously deferred to v2.0 —
notes kept in phase-2-plan in case it returns). Feature 7 (job runner upgrade)
conditional-only — skip unless the pg queue outgrows itself.

**The app is live in production.** First production deploy 2026-08-09.

**Locked decisions (do not relitigate):**

- Local dev uses local Supabase + `[DEV ADAPTER]` fallbacks (maps, rate limit,
  email, analytics, Sentry/PostHog, Places fixture provider). Real providers
  are env-gated and documented in `.env.example` /
  `docs/operations/deployment.md`.
- Background jobs = pg queue (`jobs` table + cron + `/api/internal/jobs/process`).
  Two entrypoints: POST + `x-jobs-secret` header (external schedulers) and
  Vercel Cron's GET + `Authorization: Bearer $CRON_SECRET`. Vercel Cron cannot
  send POST or custom headers — that is why both exist.
- Single Next.js app, domain modules under `src/modules/`. No monorepo.
- Design: "Warm Horizon" — Fraunces + Nunito Sans, warm cream, deep teal,
  coral. Theme in `src/app/globals.css`.
- Inquiries: inquiry + requested date only; signed-in caregivers; claimed
  clinics; RPCs only for writes; moderators see threads only via reports.
- Therapist profiles: per-clinic `clinic_therapists` satellite; direct writes
  under RLS; search weights B (names) / C (professions/specialties).
- Ratings (spec `docs/superpowers/specs/2026-08-08-clinic-ratings-design.md`):
  **structured only, NO free text anywhere** (anti-defamation policy enforced
  by schema, not moderation — RA 10175 cyberlibel). Four required 1–5
  dimensions; one rating per clinic per user, author-editable; managers can't
  rate their own clinic; aggregates shown only at ≥3 non-voided ratings;
  moderation = admin void/unvoid (audited, reversible, no hard delete).
- PWA (spec `docs/superpowers/specs/2026-08-08-pwa-design.md`): manifest +
  offline shell + offline favorites snapshot ONLY. Hand-rolled `public/sw.js`
  (no Serwist/next-pwa); SW never caches authenticated responses; snapshot in
  `localStorage`, written when `/account/favorites` loads, cleared on sign-out;
  `/offline` renders the snapshot via inline `<style>/<script>`; no push, no
  background sync, no custom install prompt.
- Map tiles = **OpenFreeMap vector tiles** (keyless). Raw
  `tile.openstreetmap.org` raster violates the OSM tile usage policy for
  production apps — do not switch back.

## Finished and verified

`main` = `e26e0b7`, pushed to `origin/main`. Full `Main` pipeline green on that
commit — validate ✅, migrate ✅, deploy ✅ (`PR checks` ✅ too; pr.yml also
triggers on push to main, so `format:check` does gate main despite main.yml
omitting it).

The **GitHub Actions deploy pipeline is live as of 2026-08-10** — see the
dedicated section below.

Go-live wave (2026-08-09), after the phase-2 feature work:

- `5c767c8` deployment dry-run record in `docs/operations/deployment.md`.
- `60e6bc6` maps error boundary around all `ClinicMap` renders (merged as #1).
- `07b72e9`, `ebc8eee` trigger initial production deploy.
- `dd10eb2` **cron schedule → daily** (`0 0 * * *` in `vercel.json`). Vercel
  Hobby rejects per-minute schedules at deploy time.
- `84267ba` **migrations set `search_path`** — hosted `db push` runs under a
  CLI login role whose search_path excludes the `extensions` schema, so
  unqualified `gin_trgm_ops`/`geography` refs failed at DDL time and the push
  died at migration 3 with migration history looking half-applied. Local roles
  include `extensions` on the path, which is why every local run was green.
- `e113e32` CI integration job writes `.env.local` — it started Supabase but
  never exported the keys, so suites importing server env failed every run.
- `9942949` cleared the `_drop` lint warning (repo now lint-clean).
- `813971a` prettier across 42 drifted files.
- `a5bb172` **maps → OpenFreeMap vector tiles**: liberty style; cluster counts
  must use Noto Sans Bold (the only stack that style's glyph endpoint hosts —
  Open Sans Semibold 404s); CSP allows `tiles.openfreemap.org` in
  img-src/connect-src. MapLibre's default worker URL resolves against
  `import.meta.url` and 404s inside `/_next/static/chunks` under Turbopack, so
  `postinstall` copies `maplibre-gl-worker.mjs` (+ shared chunk) into
  `public/maplibre/` and `ClinicMap` calls `setWorkerUrl` at it. Raster tiles
  masked this before — they decode on the main thread.
- `bd34d4d` multilingual dropped from the roadmap.

### Deploy pipeline activation (2026-08-10)

`.github/workflows/main.yml` is no longer inert. Repository variable
`DEPLOY_ENABLED=true`; all five secrets set: `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `DEPLOY_HOOK_URL`, `SMOKE_URL`.
Verified end-to-end by empty commit `e26e0b7`: `Remote database is up to date.`
then deploy hook + smoke test returning
`{"status":"ok","checks":{"app":"ok","db":"ok","jobs":"ok"}}`.

Values worth not re-deriving:

- `SUPABASE_PROJECT_REF` = `slwguxbeijcpixsegtzm` (also in the gitignored
  `supabase/.temp/project-ref`).
- `SMOKE_URL` = `https://thrivemap.vercel.app` — the stable production alias.
  Do NOT use the per-deployment URLs that show up in the GitHub deployments
  API (`thrivemap-<hash>-abensontech.vercel.app`); those are immutable and
  would smoke-test a frozen old build. `thrivemap-abensontech.vercel.app`
  302s — only the bare `thrivemap.vercel.app` returns 200.
- Vercel project `thrivemap`, org `abensontech`; Supabase migrations 1–21 all
  applied on the hosted project.

Also closed since the last handoff: remote branch `claude/goofy-kapitsa-86365d`
deleted from origin; the superseded handoff-draft stash dropped (the remaining
`stash@{0}` on `c5bd966` is pre-existing and NOT ours — leave it alone).

## Half-done / not started

- Nothing half-done in code. Working tree carries one uncommitted edit:
  `.gitignore` + `.devswarm-temp/` (DevSwarm workspace scratch dir).
- **Rotate `SUPABASE_DB_PASSWORD`.** During the 2026-08-10 activation the
  production DB password was pasted into an assistant chat transcript to
  unblock the failing job. The pipeline is proven now, so rotating is a
  two-minute job: reset it in Supabase → Project Settings → Database, then
  `gh secret set SUPABASE_DB_PASSWORD` and `gh run rerun <id> --failed`.
- **No approval gate on production migrations.** `docs/operations/deployment.md`
  step 6 says to protect the `production` environment with a required reviewer.
  GitHub refuses: required reviewers need a Pro/Team plan on a private repo and
  `acaacx/thrivemap` is private on Free. So every push to main runs
  `supabase db push` against production unattended. Either upgrade the plan or
  accept it knowingly — it is not an oversight.
- **Every push to main deploys twice.** Vercel's git integration builds on its
  own AND the `deploy` job fires `DEPLOY_HOOK_URL`. Confirmed on `e26e0b7`
  (Vercel 19:31:48, hook 19:37:07). To keep migrate without the redundant
  build, split the `if: vars.DEPLOY_ENABLED` condition so it gates `migrate`
  only, or drop the `deploy` job and let Vercel own deploys. Note the smoke
  test lives in the `deploy` job, so dropping it loses the post-deploy
  `/api/health` check.
- **Job queue drains once a day** (Hobby-plan cron limit). Tighten `vercel.json`
  after upgrading to Pro, or point an external scheduler at the POST endpoint.
  If `JOBS_PROCESSOR_SECRET` is unset in production the route 503s and the
  queue silently stops draining — `/api/health` reports the jobs check.
- **Live Google Places imports** still need a real `GOOGLE_MAPS_SERVER_API_KEY`
  (Places API (New) enabled). Without it the fixture provider serves the flow.
  User's call.
- Optional providers all still on dev adapters: Upstash Redis (shared rate
  limit/cache), Resend (email), PostHog, Sentry. See the provider activation
  checklist in `docs/operations/deployment.md`.

## Single next action

Rotate `SUPABASE_DB_PASSWORD` (see above — the current value was exposed in a
chat transcript). After that, ask the user which post-launch item to take: fix
the double deploy, fix the once-a-day job drain, turn on real Google Places
imports, activate the optional providers, or start new feature work. Phase 2 is
done and shipped; the deploy pipeline is live and verified.

## Traps / non-obvious facts

- **The linked Supabase CLI reads the DB password from the OS keychain, not
  `SUPABASE_DB_PASSWORD`.** So a green local `supabase migration list --linked`
  proves NOTHING about whether the CI secret is correct — that is exactly how
  the first pipeline run failed with `failed to connect to postgres … set the
  env var correctly: SUPABASE_DB_PASSWORD` while local checks passed. Note
  `supabase link` succeeding only validates the access token + project ref; the
  DB password is not exercised until `db push` connects.
- **GitHub environment names are case-insensitive**: main.yml says
  `environment: production` and matches the existing `Production` environment
  Vercel created. Not a bug, don't "fix" it.
- **Hosted vs local search_path**: local roles include the `extensions` schema,
  hosted CLI push roles do not. Any migration touching pg_trgm/postgis
  operators or types needs an explicit `set search_path` — green locally proves
  nothing about `db push`.
- **e2e timing**: `playwright.config.ts` `expect.timeout: 15_000`, local
  `workers: 2` (override via `PW_WORKERS`) — DO NOT revert; Turbopack lazy
  first-compile + 4-vCPU Docker Supabase exceeded the old 5s default under
  parallel workers. Standalone-spec green ≠ full-suite green for specs hitting
  brand-new routes.
- **In-memory rate limiter accumulates** on a long-lived dev server — restart
  between full e2e runs if sign-ins time out. e2e caregiver sessions are
  established without consuming login rate budget (pattern in
  `e2e/pwa.spec.ts`).
- **Port 3000 squatter** ("Verified VA Jobs") appears intermittently. With no
  `PLAYWRIGHT_BASE_URL`, Playwright self-starts `pnpm dev` on 3000
  (`reuseExistingServer`); if squatted, run dev on another port and set
  `PLAYWRIGHT_BASE_URL`.
- **`/offline` page**: renders via inline `<style>/<script>` +
  `dangerouslySetInnerHTML` — do NOT convert to React-hydrated components; its
  chunks aren't precached so hydration never happens offline. SW PRECACHE is
  just `["/offline"]` deliberately, and the SW re-fetches the shell on every
  `activate`.
- **MapErrorBoundary**: wrap ALL `ClinicMap` renders (dynamic import,
  `ssr:false`) — maplibre-gl throws during init without WebGL2 (headless
  browsers, some VMs) and crashes the whole page.
- **MapLibre worker under Turbopack**: see `a5bb172` above — if vector tiles
  stop parsing with a "non-JavaScript MIME type" console error, the
  `public/maplibre/` postinstall copy is missing.
- **zod 4 + @hookform/resolvers 5 + transforms**: a `.transform()` schema needs
  the 3-generic `useForm<z.input<S>, unknown, z.output<S>>`.
  `.optional().or(z.literal("").transform(...))` is DEAD CODE — use
  `.optional().transform(v => v === "" ? undefined : v)`. No `.coerce` /
  `.default()` with zodResolver. `z.uuid()` not `z.string().uuid()`.
- **`pnpm test:integration -- <pattern>` does NOT filter** (runs the full suite
  silently) — use
  `npx vitest run --config vitest.integration.config.ts <pattern>`.
- **supabase CLI not on PATH** — use `pnpm db:reset` / `pnpm db:types`.
- **RLS policy subqueries run as the caller** — wrap cross-table checks in
  security-definer functions.
- **`is_active_clinic_manager` pattern**: clinic_managers RLS is own-rows-only,
  so "does this clinic have managers?" for other users needs the admin client
  or a security-definer helper.
- **Supabase hardened defaults**: new tables/functions need explicit grants
  (migrations 8/17/18/19/21 precedent). `create or replace function` preserves
  the existing ACL.
- **shadcn = Base UI, not Radix.** No `asChild`; `render={<Link/>}`; `CardTitle`
  is a plain div; `DropdownMenuLabel` needs a `DropdownMenuGroup` ancestor.
- **e2e chromium-skip**: `testInfo.project.name !== "chromium"` NOT
  `browserName` (the mobile project is also chromium).
- **Test markers**: `[e2e]%` / `[itest]%` prefixes; clean your own rows up
  front; for therapists, remove storage objects (`photo_path`) BEFORE deleting
  rows.
- **Supabase RPC codegen**: optional RPC params need SQL `default null`.
- **e2e photo-upload selector contract**: file inputs `id="photo-<therapistId>"`,
  aria-labels `Move <name> up/down` / `Edit <name>` / `Remove <name>` — don't
  rename.
- **Misc**: extensions live in the `extensions` schema; float8 doesn't
  round-trip PostgREST; claim uploads go to `<user_id>/<claim_id>/...`; seeded
  auth users need empty-string token columns + an `auth.identities` row;
  fetch-mock Responses are single-read; `external_place_candidates.raw_payload`
  is NOT NULL.
- **Jobs processor (local)**:
  `curl -X POST -H "x-jobs-secret: $SECRET" http://localhost:<port>/api/internal/jobs/process`
  (secret in `.env.local`).
- Demo logins (password `password123`): admin@ / moderator@ / caregiver@ /
  clinicrep@ `thrivemap.test`.
