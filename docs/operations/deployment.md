# Deployment

Target: Vercel (app) + Supabase hosted (database/auth/storage). All deploy
automation is written but **inert until secrets are configured** — the app
never requires them to build.

## One-time setup

1. **Supabase project**: create, then set a strong database password. Enable
   the `pg_cron` extension on the project (Database → Extensions) before the
   first push — migration 1 creates it, and a project that forbids it fails
   the whole push. Link locally (`supabase link --project-ref …`) and
   `supabase db push` to apply migrations.

   Do **not** run `supabase/seed.sql` in production — it is fictional demo
   clinics and demo logins only. Reference data the app genuinely needs
   (service taxonomy, `ph_locations`) ships in
   `20260802000016_reference_data.sql`, so `db push` alone is enough; without
   it, search facets, `/services/[slug]` and `/locations/*` come up empty.

2. **Auth settings**: `supabase/config.toml` is local-only — `db push` does
   not apply it, and `supabase config push` would overwrite the hosted project
   with local values (site URL `127.0.0.1`, email confirmations off, 6-char
   passwords). Set these in the dashboard instead: Site URL =
   `NEXT_PUBLIC_SITE_URL`, add it to Redirect URLs (magic links break
   otherwise), turn email confirmations **on**, raise the minimum password
   length, and configure SMTP — the built-in sender is rate-limited and not
   for production.

3. **Bootstrap the first administrator**: `handle_new_user` grants every new
   signup the `user` role, and nothing else grants `administrator`. Sign up
   through the app, then promote that account once by SQL — until you do,
   `/admin` is unreachable and no submission, claim, or report can be
   actioned:

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'administrator' from auth.users where email = 'you@example.com'
   on conflict do nothing;
   ```

4. **Vercel project**: connect the repo; set env vars from `.env.example`:
   - `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `JOBS_PROCESSOR_SECRET` (generate: `openssl rand -hex 24`)
   - Optional providers as they come online: Google Maps keys, Upstash,
     Resend + `EMAIL_FROM`, PostHog, `SENTRY_DSN`.

   A variable that is present but blank counts as unset, so leaving optional
   providers empty is safe. Half-configuring one is the quiet failure: set
   `UPSTASH_REDIS_REST_URL` without `UPSTASH_REDIS_REST_TOKEN` and both the
   cache and the rate limiter fall back to the in-memory adapter without
   erroring — per-instance state, so rate limits no longer hold across
   serverless instances. Check the boot logs for `[DEV ADAPTER]` lines.

5. **Jobs tick**: `vercel.json` already declares a per-minute cron on
   `/api/internal/jobs/process`. Vercel Cron can only send GET with
   `Authorization: Bearer $CRON_SECRET` (no POST, no custom headers), so set a
   `CRON_SECRET` env var to the same value as `JOBS_PROCESSOR_SECRET` — the
   platform attaches the header itself. Note: per-minute schedules need a Pro
   plan; Hobby rejects them at deploy time, so `vercel.json` ships a daily
   schedule (`0 0 * * *`) — tighten it after upgrading to Pro, or point an
   external scheduler at the POST endpoint for more frequent ticks. External schedulers can
   still use `POST` with `x-jobs-secret: $JOBS_PROCESSOR_SECRET`. Without the
   secret set the route refuses to run in production (503), so the queue
   silently stops draining — `/api/health` reports the jobs check.
6. **GitHub Actions** (`.github/workflows/main.yml`): set repository
   variable `DEPLOY_ENABLED=true` plus secrets `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `DEPLOY_HOOK_URL`,
   `SMOKE_URL`; protect the `production` environment with a required
   reviewer so migration pushes need manual approval.

## Provider activation checklist

| Provider      | Env                                                                                                                                           | Notes                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Google Maps   | `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY` (referrer-restricted, Maps JS only), `GOOGLE_MAPS_SERVER_API_KEY` (IP-restricted, Places/Geocoding) | Separate keys per environment                                                                              |
| Places import | `GOOGLE_MAPS_SERVER_API_KEY` with Places API (New) enabled                                                                                    | Imports stay admin-triggered; expect Text Search base-tier billing. Without a key, fixtures serve the flow |
| Upstash Redis | `UPSTASH_REDIS_REST_URL/TOKEN`                                                                                                                | Enables shared rate limiting + cache across instances                                                      |
| Resend        | `RESEND_API_KEY`, `EMAIL_FROM`                                                                                                                | Verify the sending domain first                                                                            |
| PostHog       | `NEXT_PUBLIC_POSTHOG_KEY/HOST`                                                                                                                | Event names are already instrumented                                                                       |
| Sentry        | `SENTRY_DSN`                                                                                                                                  | `instrumentation.ts` uses the store API; install `@sentry/nextjs` for tracing/source maps when needed      |

## Releases

Merge to `main` → PR checks re-run → (when enabled) migration job waits for
manual approval → deploy hook → smoke test against `/api/health`.

Rollback: redeploy the previous Vercel build. Migrations are forward-only —
write a new corrective migration rather than reverting; the state machine
and additive schema style keep old app versions compatible with newer
schemas within one release.

Additional manual checks against the prod build before/after a release:

- `curl -s https://<host>/manifest.webmanifest` returns 200 with
  `"name": "ThriveMap"`, three icons, and `"display": "standalone"`.
- The service worker registers (DevTools → Application → Service Workers)
  and an install prompt is offered (or "Add to Home Screen" works) on a
  prod build — `next dev` does not register the SW.

## Dry-run record

2026-08-08, local rehearsal of the first-deploy path on `main` `f6b2796`
(no hosted credentials — everything except the actual Vercel/Supabase
hosted steps):

- Fresh database from migrations only (`supabase db reset --no-seed`, the
  local equivalent of `db push`): all 21 migrations apply cleanly;
  reference data present (8 services, 15 `ph_locations`), zero clinics.
- `pnpm build` against that empty database: clean; `/services/[slug]`
  prerenders all 8 slugs from reference data.
- `next start` smoke: `/api/health` all-ok; `/`, `/clinics`,
  `/services/*`, `/locations/*`, `/offline` all 200 with sane empty
  states; admin dashboard renders all-zero queues.
- Manifest 200 (`ThriveMap`, `standalone`, 3 icons) + all icon URLs 200;
  service worker registers, activates, and controls the page on the prod
  build.
- Jobs route auth matrix: POST no/wrong `x-jobs-secret` → 401; correct →
  200; GET `Authorization: Bearer` (Vercel-cron path) → 200; with
  `JOBS_PROCESSOR_SECRET`/`CRON_SECRET` blank → 503 both paths, as
  documented.
- Admin bootstrap: fresh signup gets role `user` via `handle_new_user`;
  the promote-SQL above grants `administrator`; `/admin` then reachable.
- `[DEV ADAPTER]` boot lines appear for unconfigured Upstash
  (cache + rate limiter), confirming fallback detection.

Not rehearsed (needs real accounts): `supabase link`/`db push` against a
hosted project, dashboard auth settings, Vercel env/cron, GitHub Actions
`production` environment gating.

## Documented but not configured (deliberate)

Cloudflare (DNS/WAF/cache), Terraform, read replicas. See
[scaling-triggers.md](scaling-triggers.md) for when to revisit.
