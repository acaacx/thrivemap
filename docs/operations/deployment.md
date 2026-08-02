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

5. **Jobs tick**: create a Vercel cron hitting
   `POST /api/internal/jobs/process` every minute with header
   `x-jobs-secret: $JOBS_PROCESSOR_SECRET`. Without the secret set the route
   refuses to run in production (503), so the queue silently stops draining —
   `/api/health` reports the jobs check.
6. **GitHub Actions** (`.github/workflows/main.yml`): set repository
   variable `DEPLOY_ENABLED=true` plus secrets `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `DEPLOY_HOOK_URL`,
   `SMOKE_URL`; protect the `production` environment with a required
   reviewer so migration pushes need manual approval.

## Provider activation checklist

| Provider      | Env                                                                                                                                           | Notes                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Google Maps   | `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY` (referrer-restricted, Maps JS only), `GOOGLE_MAPS_SERVER_API_KEY` (IP-restricted, Places/Geocoding) | Separate keys per environment                                                                         |
| Upstash Redis | `UPSTASH_REDIS_REST_URL/TOKEN`                                                                                                                | Enables shared rate limiting + cache across instances                                                 |
| Resend        | `RESEND_API_KEY`, `EMAIL_FROM`                                                                                                                | Verify the sending domain first                                                                       |
| PostHog       | `NEXT_PUBLIC_POSTHOG_KEY/HOST`                                                                                                                | Event names are already instrumented                                                                  |
| Sentry        | `SENTRY_DSN`                                                                                                                                  | `instrumentation.ts` uses the store API; install `@sentry/nextjs` for tracing/source maps when needed |

## Releases

Merge to `main` → PR checks re-run → (when enabled) migration job waits for
manual approval → deploy hook → smoke test against `/api/health`.

Rollback: redeploy the previous Vercel build. Migrations are forward-only —
write a new corrective migration rather than reverting; the state machine
and additive schema style keep old app versions compatible with newer
schemas within one release.

## Documented but not configured (deliberate)

Cloudflare (DNS/WAF/cache), Terraform, PWA, read replicas. See
[scaling-triggers.md](scaling-triggers.md) for when to revisit.
