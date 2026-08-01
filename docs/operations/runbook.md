# Runbook

## Health

`GET /api/health` → `{ status, checks: { app, db, jobs, redis? } }`.
`degraded` = dead jobs exist or >25 pending jobs overdue; `down` (HTTP 503)
= a dependency is unreachable. Point uptime monitoring here.

## Common incidents

### Dead jobs accumulating

1. Admin → Jobs: read `last_error` on the dead rows.
2. Transient cause (provider outage, timeout): fix/wait, then **Retry** —
   attempts reset, handler idempotency makes re-runs safe.
3. Code cause: fix the handler, deploy, retry.
4. Email jobs dead + Resend down: emails queue by design; retry after
   recovery — idempotency keys prevent duplicates.

### Queue not draining (pending grows, nothing processes)

- Production: verify the platform cron is hitting
  `/api/internal/jobs/process` with the right `x-jobs-secret` (401s in
  logs = wrong secret; 503 = secret unset).
- Stuck `processing` rows: `requeue_stuck_jobs()` runs via pg_cron every
  5 min; if pg_cron itself is off, check `select * from cron.job;`.

### Search results stale or wrong

- Nightly `search_document_refresh` job repairs drift; run it immediately
  via SQL: `insert into jobs (job_type) values ('search_document_refresh');`
  then tick the processor.
- One clinic: `select refresh_clinic_search_document('<clinic_id>');`

### Cache serving stale listings

Any clinic mutation through the app bumps the cache namespace
automatically. To force it manually: restart the app (in-memory store) or
`INCR ns:clinics:version` in Redis (Upstash). Direct SQL edits to clinics
bypass the app hook — follow them with one of the above.

### Listing emergency (harmful/fraudulent content)

Admin → find clinic → set status `suspended` (reason required, audited).
Suspension removes it from all public queries immediately (RLS filters by
status); cache lapses on the same action.

### Rate limiter blocking legitimate traffic

In-memory limiter resets on deploy/restart. Upstash: delete `rl:*` keys for
the affected scope. Limits are per-scope constants in the calling actions.

### Database restore

Supabase hosted: PITR/daily backups from the dashboard. After restore,
re-run `supabase db push` if migrations were ahead, and expect the jobs
table to replay recent idempotent work harmlessly.

## Routine maintenance

- Review Admin → Jobs weekly (dead letter should be empty).
- Stale-listing flags (yellow banner on the Jobs page) — triage monthly:
  contact clinics or suspend abandoned listings.
- Dependency updates: `pnpm audit` runs in CI; renovate/dependabot optional.
