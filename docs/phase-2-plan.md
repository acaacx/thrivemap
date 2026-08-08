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

Shipped 2026-08-07: per-clinic care team managed from the clinic portal
(no shared therapist identity or standalone pages yet). Spec:
[`docs/superpowers/specs/2026-08-07-therapist-profiles-design.md`](superpowers/specs/2026-08-07-therapist-profiles-design.md);
plan: [`docs/superpowers/plans/2026-08-07-therapist-profiles.md`](superpowers/plans/2026-08-07-therapist-profiles.md).

### 3. Booking / inquiries

Highest-risk addition (write volume, notifications, no-shows). Start with
inquiry-only (message a clinic, no calendar): `inquiries` table, rate
limits, the existing email pipeline. Real scheduling would justify
extracting a service — the module boundary (`modules/booking`) and the job
queue interface are the seams.

Shipped 2026-08-06: inquiry-only messaging with an optional requested date
(no calendar/scheduling yet). Spec:
[`docs/superpowers/specs/2026-08-06-inquiries-design.md`](superpowers/specs/2026-08-06-inquiries-design.md);
plan: [`docs/superpowers/plans/2026-08-06-inquiries.md`](superpowers/plans/2026-08-06-inquiries.md).

### 4. Reviews / community signal

Moderation-heavy. Reuse the reports/moderation machinery, add
`clinic_reviews` with the same audited decision flow. Do not ship without
clear anti-defamation policy; consider structured ratings only (waiting
time, communication) instead of free text.

Shipped 2026-08-08: structured ratings only, no free-text reviews. Four
1-5 dimensions (communication, sensory friendliness, affirming approach,
scheduling), one editable rating per clinic per user, moderator void/unvoid
(audited, no hard delete) instead of a reports flow. Spec:
[`docs/superpowers/specs/2026-08-08-clinic-ratings-design.md`](superpowers/specs/2026-08-08-clinic-ratings-design.md);
plan: [`docs/superpowers/plans/2026-08-08-clinic-ratings.md`](superpowers/plans/2026-08-08-clinic-ratings.md).

### 5. Multilingual (Filipino first)

Deferred to v2.0 (decision 2026-08-07) — out of Phase 2 scope. Notes for
when it returns: `preferred_language` already exists on user_preferences.
Next.js i18n routing + translated static content first; translated clinic
descriptions are a data problem (per-language columns on a satellite
table), search needs a `filipino` text config.

### 6. Mobile/PWA

Manifest + offline shell for saved favorites. Deferred from Phase 1; no
architectural blocker.

Shipped 2026-08-08: web app manifest + service worker (offline app-shell,
no runtime caching of dynamic content), `/offline` fallback page rendering
a snapshot of the caregiver's favorites (name, address, phone) written to
`localStorage` whenever `/account/favorites` loads. Cleared on sign-out so
a shared device doesn't leak the previous caregiver's saved clinics.

`/offline` renders that snapshot with an inline `<style>`/`<script>` in
the page itself rather than React — it's precached as HTML by the service
worker, but its JS chunks are not, so with no signal it never hydrates.
An inline script reading `localStorage` directly is the only path that
actually runs with zero network. The service worker also re-fetches
`/offline` on every `activate` so the precached shell doesn't go stale
(reference stale, no-longer-deployed chunk hashes) across deploys where
`sw.js` itself is unchanged. No push notifications, no background sync.

### 7. Job runner upgrade

If handler volume outgrows the pg queue: implement the same handler map on
Trigger.dev/Inngest — `enqueueJob` call sites and idempotency keys carry
over; the `jobs` table becomes the fallback/dev implementation.

## Boundary reminders

Phase 1 stores no medical records, no child profiles, no payments. Each
Phase 2 feature that touches those crosses a compliance line (PH Data
Privacy Act sensitivity rises sharply) — re-run the threat model and data
classification before building.
