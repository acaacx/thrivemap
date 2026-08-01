# Deployment

Target: Vercel (app) + Supabase hosted (database/auth/storage). All deploy
automation is written but **inert until secrets are configured** — the app
never requires them to build.

## One-time setup

1. **Supabase project**: create, then set a strong database password. Link
   locally (`supabase link --project-ref …`) and `supabase db push` to apply
   migrations. Do **not** run the local seed in production.
2. **Vercel project**: connect the repo; set env vars from `.env.example`:
   - `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `JOBS_PROCESSOR_SECRET` (generate: `openssl rand -hex 24`)
   - Optional providers as they come online: Google Maps keys, Upstash,
     Resend + `EMAIL_FROM`, PostHog, `SENTRY_DSN`.
3. **Jobs tick**: create a Vercel cron hitting
   `POST /api/internal/jobs/process` every minute with header
   `x-jobs-secret: $JOBS_PROCESSOR_SECRET`.
4. **GitHub Actions** (`.github/workflows/main.yml`): set repository
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
