# Inquiries — design spec

Date: 2026-08-06
Status: approved (brainstorm complete)
Phase 2 feature 3 (`docs/phase-2-plan.md` — "Booking / inquiries", inquiry-first path)

## Purpose

Let signed-in caregivers message a claimed clinic through the platform —
including an optional preferred date — and let the clinic's verified
representatives reply and resolve the request from the portal, without
building calendars, slots, or reminders.

## Decisions (locked during brainstorm)

- **Scope**: inquiry + requested date. No slot management, no availability
  calendar, no reminders. The preferred date is caregiver intent; the clinic
  confirms manually.
- **Auth**: signed-in caregivers only. No anonymous inquiries.
- **Clinic side**: portal thread inbox + email notification. Only clinics
  with at least one active manager (`clinic_managers.revoked_at is null`)
  can receive inquiries; unclaimed clinics show a "claim this clinic to
  receive inquiries" hint instead of the form.
- **Thread shape**: full back-and-forth thread (`inquiries` +
  `inquiry_messages`), not one-shot.
- **Moderation**: report button + rate limits. No pre-screening. Admins do
  NOT have blanket read access to threads; a reported thread grants the
  admin reports queue read access to that one thread (disclosed on the
  report form).
- **Status lifecycle**: `open → replied → confirmed | declined | closed`,
  with `confirmed_date` set by the rep on confirm.
- **Architecture**: new domain module `src/modules/inquiries/` (the
  `modules/booking` seam named in the phase-2 plan). Email notifications go
  through the existing pg job queue + email pipeline. No Supabase Realtime.

## Schema (migration 18: `20260806000018_inquiries.sql`)

New enum:

```sql
create type public.inquiry_status as enum
  ('open', 'replied', 'confirmed', 'declined', 'closed');
```

```sql
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  caregiver_id uuid not null references auth.users (id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 200),
  preferred_date date,
  preferred_time_note text check (char_length(preferred_time_note) <= 200),
  status public.inquiry_status not null default 'open',
  confirmed_date date,
  status_changed_by uuid references auth.users (id) on delete set null,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- indexes: (clinic_id, status), (caregiver_id), (created_at desc)
-- set_updated_at trigger, same as sibling tables

create table public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_role text not null check (sender_role in ('caregiver', 'clinic')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
-- index (inquiry_id, created_at)
```

Reports reuse: add nullable `inquiry_id uuid references public.inquiries
(id) on delete cascade` to `clinic_reports` (with index). A report on a
thread still sets `clinic_id` (the thread's clinic), so the existing admin
reports queue works unchanged; `inquiry_id` present ⇒ the report detail
view can load that thread via a security-definer query.

### RPCs (security definer, explicit grants — hardened-defaults convention)

- `create_inquiry(p_clinic_id, p_subject, p_preferred_date,
  p_preferred_time_note, p_body)` — verifies the clinic has an active
  manager, inserts the inquiry and its first message in one transaction,
  returns the inquiry id. Caller must be authenticated; caregiver_id =
  `auth.uid()`.
- `set_inquiry_status(p_inquiry_id, p_status, p_confirmed_date)` — active
  managers of the thread's clinic only. Valid transitions: from any
  non-terminal status to `replied | confirmed | declined | closed`;
  `confirmed` requires `p_confirmed_date`; `declined`/`closed` are
  terminal (no further messages, no further transitions except
  admin-side none). Stamps `status_changed_by/at`.
- `get_reported_inquiry_thread(p_report_id)` — moderator/admin only;
  returns the thread for a report that has `inquiry_id` set. This is the
  only admin read path into threads.

### RLS

- `inquiries`: caregiver select/insert own (insert happens via RPC, but
  policy still scoped); active clinic managers select rows for their
  clinics. Status updates only via RPC (no direct update policy for reps).
- `inquiry_messages`: select where the user can select the parent inquiry.
  Insert: sender must be the caregiver of the thread or an active manager
  of the thread's clinic, `sender_id = auth.uid()`, `sender_role` matching,
  and the parent thread's status is not `declined`/`closed`.
- Explicit `grant` statements for `authenticated` on both tables and all
  RPCs (see migration 8 / 17 precedent).
- Message insert by a clinic manager flips thread status `open → replied`
  (trigger or inside a `reply` path — implementation may fold this into an
  RPC if a trigger is awkward; behavior is what's specified).

## Server module `src/modules/inquiries/`

- `schemas.ts` — zod schemas; input and output types must stay identical
  (no `.coerce` / `.default()` — zodResolver trap).
- `actions.ts` — server actions returning the codebase's typed result
  objects:
  - `createInquiryAction` — rate limit **5 per day per user**;
    idempotent-enough (no idempotency key needed; dup sends are visible to
    the user).
  - `replyInquiryAction` — rate limit **30 per hour per user**.
  - `setInquiryStatusAction` — rep only, calls `set_inquiry_status`.
  - `reportInquiryAction` — inserts a `clinic_reports` row with
    `inquiry_id`; reuses the existing report rate limit.
- `queries.ts` —
  - `listMyInquiries(userId)` — caregiver dashboard list w/ status + last
    message preview.
  - `listClinicInquiries(clinicId, statusFilter)` — portal inbox,
    unanswered (`open`) first.
  - `getInquiryThread(inquiryId)` — head + ordered messages, access via
    RLS.
- `notify.ts` — payload builder for the notification job (unit-testable).

### Notifications

New job type `inquiry_notification` registered in `JOB_HANDLERS`
(`src/modules/jobs/handlers.ts`). Enqueued after: new inquiry (notify
clinic managers), new message (notify the other side), status change
(notify caregiver). Payload: `{ inquiry_id, kind: "created" | "message" |
"status", message_id?, status? }`. Idempotency keys:
`inquiry-notify:message:{message_id}` and
`inquiry-notify:status:{inquiry_id}:{status}:{status_changed_at}`.
Handler resolves recipient emails (caregiver account email; all active
managers' account emails), renders a template in
`src/modules/shared/email/templates.ts`, sends via `getEmailSender()`
(dev adapter logs — no external credentials, per project rule). Email
bodies contain a link to the thread, not the message content beyond a
short excerpt (≤120 chars) — keeps sensitive detail on-platform.

## UI (Warm Horizon theme, shadcn = Base UI — no `asChild`)

- **Clinic detail page**: "Send an inquiry" card. Claimed clinic → button
  opens dialog: subject, message, optional preferred date + free-text time
  note. Unclaimed → muted hint "This clinic hasn't been claimed yet —
  representatives can claim it to receive inquiries" linking the claims
  flow. Signed-out users see a sign-in prompt.
- **Caregiver** `/account/inquiries`: list with status chips
  (open/replied/confirmed/declined/closed), clinic name, last activity.
  `/account/inquiries/[id]`: thread view — status banner (incl. confirmed
  date when set), message bubbles (caregiver right/tinted, clinic left),
  reply box (hidden when terminal status), report action in overflow menu.
- **Portal** `/portal/[clinicSlug]/inquiries`: inbox with status filter
  tabs, `open` first. Thread view: same bubbles mirrored, reply box,
  status controls — Confirm (with date picker, defaults to
  `preferred_date`), Decline, Close — plus report action.
- Native `<select>`/inputs where Playwright interacts (import-trigger
  precedent).

## Error handling

- Actions return typed error results (existing pattern); client shows
  toasts. Rate-limit rejections show a friendly retry-later message.
- RPC failures (unclaimed clinic, closed thread, invalid transition)
  surface as field-level/toast errors, not crashes.
- Notification job failures retry via the queue's existing retry policy;
  email failure never blocks the write.

## Testing

- **Unit** (vitest): zod schemas; status-transition matrix
  (valid/invalid); notification payload builder + recipient resolution
  logic where extractable.
- **Integration** (vitest against local Supabase, real server modules —
  `server-only` stub in place): RLS matrix — caregiver cannot read
  others' threads; revoked manager loses access; non-manager cannot set
  status; closed/declined thread rejects new messages; `create_inquiry`
  rejects unclaimed clinics; report with `inquiry_id` grants
  `get_reported_inquiry_thread` to moderator and nobody else.
- **e2e** (Playwright, chromium-only, idempotent — cleans own data
  first; demo accounts caregiver@/clinicrep@ thrivemap.test):
  caregiver sends inquiry from a clinic page → rep sees it in portal
  inbox, replies, confirms with a date → caregiver sees confirmed status
  and reply. Poll the DB (`expect.poll` + service-role client) for the
  notification job's completion — never the jobs-table UI badge. Run
  against the preview dev server port (`PLAYWRIGHT_BASE_URL`), restart
  dev server before full-suite runs (rate limiter accumulation trap).

## Out of scope (explicitly)

- Slot/calendar management, availability, reminders, no-show handling.
- Anonymous inquiries; email-relay to unclaimed clinics.
- Realtime updates (Supabase Realtime) — page refresh + email is enough.
- Admin blanket thread access; any read path beyond reported threads.
- Child profiles or structured medical fields — free text only, per the
  phase-2 boundary reminder (PH Data Privacy Act).
