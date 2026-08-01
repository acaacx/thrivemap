# Data model

Migrations in `supabase/migrations/` are the source of truth. Highlights only
— read the SQL for exact shapes.

## Core entities

- **clinics** — the listing. Lifecycle `status` (draft → published_unverified
  → published_verified → suspended/archived) is enforced by
  `modules/clinics/lifecycle.ts` plus DB constraints. `last_verified_at`,
  `flagged_stale_at`, soft-delete `deleted_at`.
- **clinic_locations** — one or more addresses per clinic;
  `geography(Point,4326)` with GiST index; generated `latitude`/`longitude`
  columns for cheap reads.
- **clinic_services / services** — the 8-service therapy taxonomy, with
  per-clinic delivery (in_person/online/both) and notes.
- **clinic_hours / clinic_images / clinic_contact_methods /
  clinic_social_links / clinic_languages / clinic_age_groups** — profile
  satellites.
- **clinic_search_documents** — weighted tsvector (A name/aliases, B
  city/province, C services, D description) + normalized-name trigram index.
  Kept fresh by triggers on clinic mutations; a nightly job rebuild is the
  safety net.
- **ph_locations** — provinces/cities with centroids; powers dev geocoding,
  autocomplete, and location landing pages.

## Contribution & moderation

- **clinic_submissions** — public suggestions; approving one creates a
  published_unverified clinic.
- **clinic_change_requests** — corrections to existing listings; approved
  changes are applied field-by-field from the stored diff.
- **clinic_reports** — problem reports (anonymous allowed).
- **clinic_claims + clinic_claim_documents** — ownership claims; documents
  live in the private `claim-documents` bucket
  (`<user_id>/<claim_id>/...`), readable only via short-lived signed URLs,
  every access audited.
- **clinic_managers** — grants from approved claims; `manages_clinic()` is
  the RLS helper.
- **duplicate_match_candidates** — scored pairs from the duplicate scan;
  merges are manual (`merge_clinics` RPC) and fully audited.
- **admin_actions / audit_logs** — append-only moderation trail; audit
  triggers cover moderation-sensitive tables.

## Users

- **profiles** (bootstrap trigger on signup), **user_roles**
  (caregiver / clinic_representative / moderator / administrator /
  super_administrator), **user_preferences** (email opt-out),
  **favorites** (owner-only).

## Infrastructure

- **jobs** — the queue: `job_type`, `payload` jsonb, unique
  `idempotency_key`, status pending/processing/completed/dead, attempts,
  `run_at`, lock columns. See [jobs.md](jobs.md).
- **external_place_candidates / clinic_source_records** — staging for the
  (stubbed) Google Places import.

## Conventions

- UUID PKs, `created_at`/`updated_at` triggers everywhere.
- Extensions live in the `extensions` schema — SQL must write
  `extensions.geography(...)`, `extensions.st_dwithin(...)`, etc.
- New tables get **no grants** by default; migration
  `20260801000008_grants.sql` adds explicit anon/authenticated grants — any
  new table needs its own.
