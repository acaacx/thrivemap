# Handoff — ThriveMap (dir: ausomeapp)

## What we are trying to do

Build **ThriveMap** (product name everywhere; directory stays `ausomeapp`): a Philippines-first, autism-focused clinic directory. Phase 1 (clinic discovery MVP) complete. Phase 2 (`docs/phase-2-plan.md`) in progress: feature 1 (**Google Places import**) and feature 3 (**Inquiries**) are both finished and merged.

**Locked decisions (do not relitigate):**

- No external credentials — everything runs on local Supabase + `[DEV ADAPTER]`-marked fallbacks (maps, rate limit, email, analytics, Sentry/PostHog, Places fixture provider). Real providers env-gated; documented in `.env.example`.
- Background jobs = pg-based queue (`jobs` table + pg_cron + processor route `/api/internal/jobs/process`, protected by `x-jobs-secret` header — NOT `Authorization: Bearer`).
- Single Next.js app, domain modules under `src/modules/` (now includes `imports` and `inquiries`). No monorepo.
- Design: "Warm Horizon" — Fraunces + Nunito Sans, warm cream bg, deep teal primary, coral accent. Theme in `src/app/globals.css`.
- Inquiries scope (user-chosen in brainstorm): inquiry + requested date only — NO calendar/slots/reminders; signed-in caregivers only; claimed clinics only (≥1 active manager); full back-and-forth thread; status lifecycle open → replied → confirmed/declined/closed (confirmed requires date, declined/closed terminal); moderators get NO blanket thread access — only via a report on the thread (`get_reported_inquiry_thread`), participation now DB-enforced (`can_report_inquiry` in the tightened `clinic_reports` insert policy).
- All inquiry writes go through security-definer RPCs (`create_inquiry`, `reply_inquiry`, `set_inquiry_status`) — no insert/update RLS policies or grants on `inquiries`/`inquiry_messages`.

## Finished and verified

Working tree clean; `main` at `6218423`, pushed to https://github.com/acaacx/thrivemap (private).

- **Phase 1 MVP** + **Places import** (see git history; specs/plans in `docs/superpowers/`).
- **Inquiries** (this session, commits `0e83be1`…`6218423`, merged + pushed 2026-08-07; spec `docs/superpowers/specs/2026-08-06-inquiries-design.md`, plan `docs/superpowers/plans/2026-08-06-inquiries.md`, executed via subagent-driven development with per-task reviews + final opus whole-branch review + fix wave):
  - Migration 18 (`20260806000018_inquiries.sql`): `inquiry_status` enum, `inquiries` + `inquiry_messages`, `clinic_reports.inquiry_id`, RPCs (create/reply/set_status/get_reported_thread, `is_active_clinic_manager`, `can_report_inquiry`), RLS participants-only, hardened grants, tightened `clinic_reports` insert policy (participant + clinic-match for inquiry reports; anon non-inquiry reports unchanged).
  - `src/modules/inquiries/`: schemas (zod, trimmed, `canTransition` mirrors SQL), queries (`shapeThread`, `listMyInquiries` caregiver-scoped + activity-sorted, `listClinicInquiries` open-first, `clinicAcceptsInquiries` — admin client + `cachedClinicData`), actions (rate limits: create 5/day, reply 30/hr, report 5/day; notify enqueue after success), notify builders, components (InquiryCta, InquiryThreadView, InquiryStatusControls, ReportInquiryDialog).
  - `inquiry_notification` job + 3 HTML-escaped email templates (≤120-char excerpts); recipients: created→managers, message→other side, status→caregiver; honors `email_notifications`.
  - UI: clinic-page CTA (client-side auth via new `/api/inquiries/session`, keeps page cacheable), `/account/inquiries` + thread (ownership-guarded), `/clinic-portal/[clinicId]/inquiries` inbox + confirm/decline/close, admin reports queue shows reported conversations.
  - e2e `e2e/inquiries.spec.ts` (chromium-only serial, `[e2e]` subject markers, DB-polls jobs scoped by `payload->>inquiry_id`). Docs: `jobs.md` inquiry_notification section, `phase-2-plan.md` feature 3 marked shipped.
  - **Ride-along fixes** (`cde6a65`): `clinicAcceptsInquiries` was RLS-blind (every clinic looked unclaimed to caregivers) — admin client now; `SiteHeader` account menu crashed (Base UI `Menu.GroupLabel` needs `Menu.Group` ancestor).

**Test state (verified on merged main = `6218423`, 2026-08-07):** 88 unit / 56 integration / 51 e2e passed + 9 by-design skips; typecheck, lint, prod build clean.

Demo logins (local, password `password123`): admin@ / moderator@ / caregiver@ / clinicrep@ `thrivemap.test`.

## Half-done / not started

Nothing half-done. Remaining Phase 2 candidates: therapist profiles, reviews, i18n, PWA (`docs/phase-2-plan.md`). Deployment dry-run (`docs/operations/deployment.md`) still pending. Live Google imports still need a real `GOOGLE_MAPS_SERVER_API_KEY` (user's call).

**Follow-ups from inquiry reviews (all non-blocking, triaged by final review):**
- Tests: caregiver-ownership guard (`listMyInquiries` filter + account thread notFound) has no dedicated test; `can_report_inquiry` clinic-mismatch path untested; declined-terminal path untested.
- Migration 18 comment (~line 296) misstates the original bug as sql-function inlining — real hazard was a raw subquery in an RLS policy; comment-only, fix opportunistically.
- Consolidate report-type labels (3 copies: account/reports page, ReportForm, inquiries report-labels) and filter conversation-report options to the sensible subset.
- Queries/actions swallow supabase errors (no console.error) — one sweep across the module.
- `SiteHeader` calls `getCurrentUser()` → defeats ISR site-wide (pre-existing, ALL pages incl. clinic profiles despite `revalidate = 300`). Real perf item; fix = client-side auth state in header.
- Cosmetics: raw ISO dates in thread views, `friendlyRpcError` gaps, aria-current on filter pills, h3→h2 in admin panel, dead `viewer` prop, `inquiryReply` copy addressed to wrong side for managers, `data-model.md` missing inquiries tables.

## Single next action

Nothing queued — ask the user. Options: next Phase 2 feature (therapist profiles or reviews), deployment dry-run, or the follow-up batch above.

## Traps / non-obvious facts

- **Port 3000 squatter** ("Verified VA Jobs" app) appears intermittently; was FREE this session. Playwright config: no `PLAYWRIGHT_BASE_URL` → it self-starts `pnpm dev` on 3000 (`reuseExistingServer`) — fine when port free/ours; if squatted, run dev on another port + `PLAYWRIGHT_BASE_URL`.
- **In-memory rate limiter accumulates** on a long-lived dev server — restart between full e2e runs if sign-ins time out.
- **Jobs processor**: `curl -X POST -H "x-jobs-secret: $SECRET" http://localhost:<port>/api/internal/jobs/process` (secret in `.env.local`). POST checks `x-jobs-secret`; GET is the Vercel-cron Bearer path.
- **Supabase RPC codegen**: scalar args without SQL `default` come out required + non-nullable in `database.types.ts` — give optional RPC params `default null` or you'll need `as unknown as string` casts at call sites.
- **RLS policy subqueries run as the caller** — a raw subquery in a policy against another RLS'd table evaluates that table's policies under the original caller (this, not inlining, broke the first `clinic_reports` policy attempt). Wrap cross-table checks in security-definer plpgsql functions.
- **`is_active_clinic_manager` pattern**: clinic_managers RLS is own-rows-only — any "does this clinic have managers?" check for other users needs the admin client or a security-definer helper (bit `clinicAcceptsInquiries`).
- **e2e/integration data markers**: inquiries tests clean own rows by subject prefix — `[e2e]%` (e2e) and `[itest]%` (integration); delete `clinic_reports` by `inquiry_id` before `inquiries`.
- **e2e chromium-skip**: use `testInfo.project.name !== "chromium"` NOT `browserName` — the mobile project (Pixel 7) is also chromium and would double-run shared-account mutations.
- **shadcn = Base UI, not Radix.** No `asChild`; `render={<Link …/>}`; `CardTitle` plain div; `DropdownMenuLabel` REQUIRES `DropdownMenuGroup` ancestor or crashes.
- **Supabase hardened defaults**: new functions need explicit revoke/grant (migrations 8/17/18 precedent). Tables get select via default privileges; write grants only if intended.
- **`.env*` gitignored except `.env.example`** (`!.env.example` exception).
- **Vitest integration config** stubs `server-only` and parses `.env.local` itself (`vite` not importable).
- **`external_place_candidates.raw_payload` NOT NULL**; fetch-mock Responses are single-read (use `mockImplementation`); don't assert jobs-table UI badges — DB-poll with service client.
- **Extensions in `extensions` schema**; **float8 doesn't round-trip PostgREST** (round in SQL); re-running migration 15 by hand fails (drop signature or `pnpm db:reset`); zod forms: no `.coerce`/`.default()` (zodResolver types); claim uploads path `<user_id>/<claim_id>/...`; seeded auth users need empty-string token columns + `auth.identities` row.
- **Pre-existing `git stash`** (`stash@{0}` on `c5bd966`) — not ours, untouched.
- **pnpm 11**: build-script approvals in `pnpm-workspace.yaml` `allowBuilds:`.
- **Browser-pane flakiness**: `read_page` can return "(empty page)"; verify flows via Playwright.
- **Subagent API drops**: two implementer agents died mid-task on network errors this session — they often committed before dying; check `git log`/`git status` before re-dispatching, resume via SendMessage.
