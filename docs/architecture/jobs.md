# Background jobs

Postgres-backed queue. No external vendor; the `JobQueue` surface is small
enough that Trigger.dev/Inngest could replace it later without touching
handlers.

## Pieces

- **`jobs` table** — payload jsonb, unique `idempotency_key` (same key twice
  = one job), status pending/processing/completed/dead, attempts,
  `run_at`, lock columns.
- **`enqueueJob(type, payload, {idempotencyKey, runAt})`**
  (`modules/jobs/queue.ts`) — upsert that never throws into the calling
  action.
- **`claim_due_jobs(worker, batch)`** — `FOR UPDATE SKIP LOCKED` claim;
  `requeue_stuck_jobs()` unlocks crashed workers (pg_cron, every 5 min).
- **Processor** — `processDueJobs()` (`modules/jobs/processor.ts`) runs
  claimed jobs through `JOB_HANDLERS`; failures retry with exponential
  backoff (2^attempts minutes) until `max_attempts`, then `dead`.
  Exposed via:
  - `POST /api/internal/jobs/process` — protected by the `x-jobs-secret`
    header (`JOBS_PROCESSOR_SECRET`), for external schedulers and manual
    ticks. `GET` on the same path accepts Vercel Cron's
    `Authorization: Bearer $CRON_SECRET` (see `vercel.json`); set
    `CRON_SECRET` to the same value as `JOBS_PROCESSOR_SECRET`.
  - **Admin → Jobs → "Run tick now"** — manual tick for local dev.
- **pg_cron enqueues** (migration 14) — daily verification-reminder scan,
  weekly stale-listing scan, nightly search-document refresh; each insert is
  idempotent per day/week.

## Handlers (`modules/jobs/handlers.ts`)

| Type                         | What it does                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `send_email`                 | Delivers a templated email (`{user_id                                                                            | to, template, params}`) or a moderator broadcast (`{moderators: true, subject, body}`). Resolves addresses at send time and honors `user_preferences.email_notifications`. |
| `submission_process`         | Acknowledges the submitter and notifies moderators of a new suggestion.                                          |
| `duplicate_scan`             | `scan_duplicate_candidates` RPC → scored pairs into `duplicate_match_candidates`. Merges stay manual.            |
| `verification_reminder_scan` | Verified clinics stale >180 days → reminder email per active manager, max once per clinic/manager/month.         |
| `stale_listing_scan`         | Published listings untouched >365 days → sets `clinics.flagged_stale_at` (cleared automatically on next update). |
| `search_document_refresh`    | One clinic or full rebuild of search documents.                                                                  |
| `candidate_import`           | [DEV ADAPTER] stub — logs and completes without a Google key.                                                    |

All handlers are idempotent: enqueue-side idempotency keys plus
upsert/update-shaped writes mean a retried job cannot double-send or
double-write.

## Dead letter

`/admin/jobs` lists dead jobs with their last error and a Retry button
(resets attempts, requeues). The admin dashboard counts dead jobs;
`/api/health` degrades when dead jobs exist or >25 pending jobs are overdue.
