# Phase 2 extension plan

What Phase 1 deliberately excludes, and how the current architecture
accommodates each extension without a rewrite. Order is a suggestion, not a
commitment.

## Candidate features

### 1. Real external imports (Google Places)

Already staged: `external_place_candidates`, `clinic_source_records`, the
admin candidates workspace, and the `candidate_import` job stub. Work:
implement the Places Nearby Search fetch in the handler, dedupe via
`find_duplicate_candidates`, and keep human review before anything
publishes.

### 2. Therapist profiles

New module + tables (`therapists`, `clinic_therapists`) hanging off
clinics; same lifecycle/verification pattern as listings. Search documents
gain a weighted field. No schema conflicts — clinics stay the aggregate
root.

### 3. Booking / inquiries

Highest-risk addition (write volume, notifications, no-shows). Start with
inquiry-only (message a clinic, no calendar): `inquiries` table, rate
limits, the existing email pipeline. Real scheduling would justify
extracting a service — the module boundary (`modules/booking`) and the job
queue interface are the seams.

### 4. Reviews / community signal

Moderation-heavy. Reuse the reports/moderation machinery, add
`clinic_reviews` with the same audited decision flow. Do not ship without
clear anti-defamation policy; consider structured ratings only (waiting
time, communication) instead of free text.

### 5. Multilingual (Filipino first)

`preferred_language` already exists on user_preferences. Next.js i18n
routing + translated static content first; translated clinic descriptions
are a data problem (per-language columns on a satellite table), search
needs a `filipino` text config.

### 6. Mobile/PWA

Manifest + offline shell for saved favorites. Deferred from Phase 1; no
architectural blocker.

### 7. Job runner upgrade

If handler volume outgrows the pg queue: implement the same handler map on
Trigger.dev/Inngest — `enqueueJob` call sites and idempotency keys carry
over; the `jobs` table becomes the fallback/dev implementation.

## Boundary reminders

Phase 1 stores no medical records, no child profiles, no payments. Each
Phase 2 feature that touches those crosses a compliance line (PH Data
Privacy Act sensitivity rises sharply) — re-run the threat model and data
classification before building.
