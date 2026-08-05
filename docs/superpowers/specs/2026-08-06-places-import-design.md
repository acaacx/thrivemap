# Google Places import — design

Date: 2026-08-06. Status: approved for planning.

Phase 2 feature 1 from `docs/phase-2-plan.md`: replace the `candidate_import`
job stub with a real import pipeline feeding `external_place_candidates`,
with human review before anything reaches the public directory.

## Decisions (settled during brainstorming)

- **Fixtures-first**: no real Google key during development. The importer is
  built and verified end-to-end against a `[DEV ADAPTER]` fixture provider;
  the live Google path activates when `GOOGLE_MAPS_SERVER_API_KEY` is set,
  matching the maps/email adapter convention.
- **Places API (New), Text Search** (`places:searchText`). Legacy Nearby
  Search is closed to new keys; typed nearby search maps poorly to autism
  therapy niches. Queries are templated, not free-text.
- **Admin-triggered only.** No cron sweep in this build. An admin enqueues an
  import from the candidates workspace; quota spend stays human-paced.
- **Promotion creates a draft clinic** (normal lifecycle, admin publishes
  later after enrichment) plus a `clinic_source_records` row. When a
  candidate matches an existing clinic, the admin can instead **attach** the
  candidate to that clinic (source record only, no new clinic).

## Architecture

New module `src/modules/imports/`:

| File | Responsibility |
| --- | --- |
| `types.ts` | `PlacesProvider` interface (`searchText(query, opts) → NormalizedPlace[]`), `NormalizedPlace` (externalId, name, address, lat, lng, phone?, website?, rawPayload) |
| `providers/google.ts` | Places API (New) `places:searchText` POST; field mask `places.id,places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.websiteUri,nextPageToken`; pagination via `nextPageToken`, hard cap 3 pages (~60 results); zod-parses responses |
| `providers/fixtures.ts` | `[DEV ADAPTER]` — deterministic synthetic PH places from `fixtures/places/*.json` keyed by query slug; unknown query → small generic set; logs the standard `[DEV ADAPTER]` line |
| `index.ts` | Factory: `GOOGLE_MAPS_SERVER_API_KEY` present → Google provider, else fixtures |
| `server.ts` | `runPlacesImport(payload)` — the job handler body |

`runCandidateImport` in `src/modules/jobs/handlers.ts` delegates to
`runPlacesImport`; the stub and its key-present throw are removed.

### Query templating

Payload: `{ query, citySlug, requestedBy }`. `query` is built server-side
from a fixed service-term list (autism therapy, occupational therapy, speech
therapy, developmental pediatrician, ABA therapy) as
`"{service} in {city}, Philippines"`. City comes from `ph_locations`. No
free-text queries (quota + hygiene).

## Data flow

1. Admin action (behind `requireModerator`, rate-limited) enqueues
   `candidate_import`.
2. Job processor calls `runPlacesImport`: provider search → normalize →
   upsert into `external_place_candidates` on `(provider, external_id)`.
   Existing rows refresh `raw_payload` and normalized fields but **keep
   `status`, `reviewed_by`, `reviewed_at`** — discarded candidates never
   resurrect.
3. Job log records counts: fetched / new / updated / skipped-unparseable.

## Dedupe + promotion (migration `20260806000017_candidate_matching.sql`)

- `match_candidate_clinics(p_candidate_id uuid, p_distance_m float8 default 500, p_name_similarity float8 default 0.45)`
  → `(clinic_id, clinic_name, clinic_slug, name_similarity, distance_m, same_place_id)`.
  Candidate-vs-clinic: trigram name similarity, PostGIS distance,
  `clinics.google_place_id = candidate.external_id` exact match. Modeled on
  `find_duplicate_candidates` (which is clinic-vs-clinic and cannot be
  reused directly). `security definer` + internal role check + explicit
  grants (migration-8 convention).
- `promote_candidate(p_candidate_id, p_admin_id)` — one transaction: insert
  draft clinic (name, address, `extensions.st_setsrid` point,
  `google_place_id`, nearest city via existing helper), insert
  `clinic_source_records` (source_type import, raw_payload), candidate →
  `status='promoted'`, `promoted_clinic_id`, review fields. Returns clinic
  id. If the `external_id` already exists on a clinic's `google_place_id`,
  raises; the action surfaces "already linked".
- `attach_candidate(p_candidate_id, p_clinic_id, p_admin_id)` — source
  record on the existing clinic; candidate → `status='promoted'` with
  `promoted_clinic_id` = existing clinic. **No new enum value** — the
  promote/attach distinction lives in `admin_actions`
  (`promote_candidate` vs `attach_candidate`).

Matches are computed live at page render (RPC per open candidate — tens at
most), never stored; no staleness.

## Admin UI (`/admin/candidates`)

- Import trigger card: searchable city select (`ph_locations`), service-term
  select, submit enqueues the job. Recent `candidate_import` job statuses
  shown (reuse the dead-letter view's jobs query pattern).
- Candidate cards: matches block (clinic link, similarity %, distance,
  same-place-id badge) + actions **Promote** / **Attach** (per listed
  match) / **Discard** (existing). All actions logged to `admin_actions`,
  success feedback via sonner toast (per `5681eb1` — inline success races
  `router.refresh()`).

## Error handling & cost control

- Provider fetch failure throws → existing job retry/backoff → dead-letter
  view. Upsert is idempotent, so partial-then-retry is safe.
- Unparseable place: skip + count in job log; never fails the whole job.
- Fixture provider never throws.
- 3-page cap per job; `RateLimiter` on the trigger action (10/hour/admin);
  minimal field mask keeps requests in the Text Search base tier.

## Security

- Server key stays server-side (`env.ts` already splits browser/server
  keys). Trigger behind `requireModerator`. RLS on
  `external_place_candidates` already admin-only. Google-sourced strings
  only rendered through React escaping; raw_payload never rendered as HTML.

## Testing

- **Unit**: normalizer edge cases; fixture determinism; query template
  builder; Google provider request construction (URL, headers, field mask,
  pagination) against mocked `fetch`.
- **Integration** (local Supabase): upsert preserves status/review fields;
  `match_candidate_clinics` with seeded near-duplicate;
  `promote_candidate` creates clinic + source record + status, raises on
  place_id conflict; attach flow.
- **e2e** (chromium-only per stage-3 convention; idempotent — cleans its
  candidates first): trigger import → process job via test tick → candidate
  appears → promote → draft clinic visible in admin listings.
- Live Google path ships untested against the real API (no key by rule);
  request construction is unit-covered.

## Docs

`docs/architecture` jobs page, `.env.example` Places note,
`docs/operations/deployment.md` key setup paragraph.

## Out of scope

Cron sweeps, automatic promotion, Place Details enrichment calls, photo
import, non-Google providers (interface allows them later).
