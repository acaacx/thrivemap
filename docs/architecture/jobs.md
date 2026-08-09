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

| Type                         | What it does                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `send_email`                 | Delivers a templated email (`{user_id                                                                                  | to, template, params}`) or a moderator broadcast (`{moderators: true, subject, body}`). Resolves addresses at send time and honors `user_preferences.email_notifications`. |
| `submission_process`         | Acknowledges the submitter and notifies moderators of a new suggestion.                                                |
| `duplicate_scan`             | `scan_duplicate_candidates` RPC → scored pairs into `duplicate_match_candidates`. Merges stay manual.                  |
| `verification_reminder_scan` | Verified clinics stale >180 days → reminder email per active manager, max once per clinic/manager/month.               |
| `stale_listing_scan`         | Published listings untouched >365 days → sets `clinics.flagged_stale_at` (cleared automatically on next update).       |
| `search_document_refresh`    | One clinic or full rebuild of search documents.                                                                        |
| `candidate_import`           | Places Text Search import (payload `{query, termSlug, citySlug, requestedBy}`); see below.                             |
| `inquiry_notification`       | Emails clinic managers/caregivers on inquiry activity (payload `{inquiry_id, kind, message_id?, status?}`); see below. |

All handlers are idempotent: enqueue-side idempotency keys plus
upsert/update-shaped writes mean a retried job cannot double-send or
double-write.

### `candidate_import`

Admin-triggered from `/admin/candidates` with payload
`{ query, termSlug, citySlug, requestedBy }`. The query is always the fixed
template `"{service term} in {city}, Philippines"` — no free text. Provider
selection happens in `src/modules/imports`: with `GOOGLE_MAPS_SERVER_API_KEY`
set it calls Places API (New) Text Search (paginated, hard cap 3 pages);
without it a `[DEV ADAPTER]` fixture provider serves deterministic JSON so the
whole flow works offline. Results upsert into `external_place_candidates` on
`(provider, external_id)`: data columns (name, address, coordinates,
raw_payload) refresh on re-import, while `status`/`reviewed_by`/`reviewed_at`
are untouched — a discarded candidate never resurrects. Failures retry with
backoff and land in the `/admin/jobs` dead-letter view.

### `inquiry_notification`

Enqueued by `src/modules/inquiries/notify.ts` on inquiry creation, new
messages, and status changes. Payload:
`{ inquiry_id, kind: "created" | "message" | "status", message_id?, status? }`.
Idempotency keys stop duplicate sends on retry:

- `created` → `inquiry-notify:created:{inquiryId}`
- `message` → `inquiry-notify:message:{messageId}`
- `status` → `inquiry-notify:status:{inquiryId}:{status}:{statusChangedAt}`

Recipients depend on `kind`:

- `created` — every active clinic manager (`clinic_managers` rows with
  `revoked_at is null`) for the clinic.
- `message` — the side that didn't send the message (caregiver sent →
  notify managers; manager/staff sent → notify the caregiver).
- `status` — the caregiver.

Each send resolves the recipient's address and honors
`user_preferences.email_notifications` via `emailForUser` (opted-out users
are skipped, not queued for retry). Message-based emails carry only a
≤120-character excerpt of the message body (truncated with `…`), never the
full text. The handler is defined as `runInquiryNotification` in
`src/modules/jobs/handlers.ts`.

## Dead letter

`/admin/jobs` lists dead jobs with their last error and a Retry button
(resets attempts, requeues). The admin dashboard counts dead jobs;
`/api/health` degrades when dead jobs exist or >25 pending jobs are overdue.
