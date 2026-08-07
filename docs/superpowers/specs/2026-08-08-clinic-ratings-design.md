# Clinic Ratings — Design

**Date:** 2026-08-08
**Status:** Approved
**Phase 2 feature 4** (named "Reviews / community signal" in the phase plan; shipped as
structured ratings — see Policy).

## Purpose

Give caregivers a way to share experience signal about clinics, and give other
caregivers a way to read it, without exposing ThriveMap or reviewers to
defamation risk under Philippine libel law (RA 10175 cyberlibel).

## Policy decisions (locked)

These were decided explicitly and are not implementation details:

1. **Structured ratings only. No free text anywhere.** A star score on a fixed
   dimension states no factual claim, so the defamation surface is zero. This is
   the anti-defamation policy: it is enforced by the schema, not by moderation.
2. **Signed-in users only ("caregivers"), one rating per clinic per user,
   editable and deletable by its author.** "Caregiver" is the product framing
   (as in inquiries), not a database role. Managers of a clinic cannot rate
   their own clinic.
3. **Four rating dimensions**, each required, integer 1–5:
   - Communication & responsiveness (`communication`)
   - Sensory-friendliness of the space (`sensory_friendliness`)
   - Neurodiversity-affirming approach (`affirming_approach`)
   - Scheduling & waiting time (`scheduling`)
4. **No preset tags in v1.** Tags can land later as an additive migration.
5. **Aggregates display on the clinic page only, and only once a clinic has at
   least 3 non-voided ratings.** Below the threshold the section says ratings
   exist but averages are hidden. No search-ranking impact in v1.
6. **Moderation = admin void + audit.** No per-rating public reporting (there
   is no text to report). Admins can void/unvoid suspicious ratings; voids are
   reversible and audited. Clinics dispute via the existing report/contact
   channel.

Public-facing copy states the policy plainly: ratings are structured-only, one
per caregiver, no written reviews. Add one paragraph to the terms page.

## Architecture

Direct writes under RLS (favorites/therapists precedent). Ratings are
single-row, user-owned upserts with no cross-table invariants, so the
inquiries-style RPC layer is unnecessary.

Aggregates live in a trigger-maintained stats table (search-document-refresh
precedent) rather than per-request `avg()` queries or a security-definer read
function. This keeps individual ratings private, joins cheaply into the clinic
page query, and gives a future "highest rated" sort a free path.

## Data model (migration 21)

### `clinic_ratings`

| column                 | type        | notes                                    |
| ---------------------- | ----------- | ---------------------------------------- |
| `id`                   | uuid pk     | `gen_random_uuid()`                      |
| `clinic_id`            | uuid        | → `clinics`, `on delete cascade`         |
| `user_id`              | uuid        | → `auth.users`, `on delete cascade`      |
| `communication`        | smallint    | `not null check (between 1 and 5)`       |
| `sensory_friendliness` | smallint    | same                                     |
| `affirming_approach`   | smallint    | same                                     |
| `scheduling`           | smallint    | same                                     |
| `voided_at`            | timestamptz | null = live                              |
| `voided_by`            | uuid        | admin who voided; null when live         |
| `created_at`           | timestamptz | default now()                            |
| `updated_at`           | timestamptz | `set_updated_at` trigger                 |

`unique (clinic_id, user_id)`. Index on `clinic_id`.

### `clinic_rating_stats`

| column                                     | type          |
| ------------------------------------------ | ------------- |
| `clinic_id`                                | uuid pk → clinics |
| `rating_count`                             | integer       |
| `avg_communication` … `avg_scheduling`     | numeric(3,2)  |
| `updated_at`                               | timestamptz   |

Recomputed by an `after insert or update or delete` trigger on
`clinic_ratings` (statement-level per-row recompute of the affected clinic is
fine at this scale). **Voided rows are excluded from both count and averages.**
A clinic with zero live ratings gets its stats row deleted; the read path
treats a missing stats row as "no ratings".

### RLS and grants

Supabase hardened defaults: explicit grants required (migrations 8/17/18/19
precedent).

`clinic_ratings`:

- **insert / update / delete (own row):** `user_id = auth.uid()`, clinic
  readable (`clinic_readable_or_managed` or equivalent published check), and
  the user is **not** an active manager of that clinic. The manager check is a
  plain subquery on `clinic_managers` — RLS subqueries run as the caller, and
  callers can see their own manager rows, which is exactly the self-check
  needed. Updates additionally require `voided_at is null` (a voided rating is
  frozen from its author's perspective).
- **select:** own rows, plus administrators (admin panel reads all rows for a
  clinic). No public read of individual ratings — privacy: a rating must not
  be attributable to a user by other users.
- **Voiding** (`voided_at` / `voided_by`) happens through the admin server
  action using the admin (service-role) client, never through user RLS. The
  existing `write_audit_log` trigger is attached to `clinic_ratings` so every
  write — including voids — lands in `audit_logs`.

`clinic_rating_stats`: publicly readable (anon + authenticated) for published
clinics; writes only via the trigger (no direct grants).

## Module: `src/modules/ratings/`

- `schemas.ts` — zod: 4 dimensions, `z.number().int().min(1).max(5)`, plus
  clinic id `z.uuid()` (zod 4 form — not `z.string().uuid()`).
- `actions.ts` —
  - `upsertRating` (create or replace own rating; rate limit key
    `"rating-edit"`, 20/hr, `checkRateLimit` shared helper)
  - `deleteRating` (own row)
  - Both revalidate the clinic page path.
- `admin-actions.ts` (or fold into `src/modules/admin/`, follow existing admin
  action placement) — `voidRating`, `unvoidRating`: admin client, role-checked,
  audited.
- `queries.ts` — fetch stats row + current user's own rating for a clinic.
- `components/` — `RatingSummary` (server), `RatingForm` (client),
  `AdminRatingsPanel`.

Forms follow the zod-4 + react-hook-form conventions already documented (no
`.coerce`, no `.default()` with zodResolver).

## UI

**Clinic page — "Caregiver ratings" section** (below care team):

- `rating_count >= 3`: per-dimension average bars + overall count.
- `0 < rating_count < 3`: "This clinic has ratings, but not enough yet to show
  averages." (count not shown — small-n privacy).
- `rating_count = 0`: "No ratings yet."
- Signed-in non-manager: their own rating form (4 star rows), prefilled when a
  rating exists, with delete. Success feedback on save (portal precedent from
  therapist follow-ups — do not discard success state).
- Signed-out: sign-in prompt link.
- Managers of this clinic / voided authors: form hidden (managers see the
  summary like everyone else).
- One short line of policy copy: "Ratings are structured scores from signed-in
  caregivers. ThriveMap does not host written reviews."

**Admin — ratings panel** on the existing admin clinic detail view: table of
ratings (user email, 4 values, created/updated, voided state), void/unvoid
buttons, per-day submission counts for brigade spotting.

**Terms page:** one paragraph documenting the ratings policy.

## Search

Untouched in v1. No tsvector change, no sort. The stats table is the future
hook for a "highest rated" sort.

## Error handling

- Rate limited → the shared rate-limit error message pattern.
- Voided rating author sees their frozen scores in the form, disabled, with
  "This rating was removed by moderators." (No appeal flow in v1.)
- Stats trigger failures surface as write failures (transactional) — no
  eventual-consistency window.

## Testing

- **Unit:** schema bounds (0, 6, non-int rejected; all four required).
- **Integration (RLS):** owner can insert/update/delete own; second rating for
  same clinic conflicts; manager of the clinic blocked from rating it; other
  users cannot select someone's rating; admin can; voided row frozen for
  author; stats trigger math (insert/update/delete/void paths); voided
  excluded; stats publicly readable.
- **e2e (chromium):** caregiver rates a seeded clinic → sees success + own
  scores; edits → change persists; aggregate hidden below threshold; visible
  once seed puts a clinic at 3 ratings. Test markers `[e2e]%` cleanup
  convention; delete own rating rows up front.
- **Seeds:** give one demo clinic ≥3 ratings (aggregate visible) and one
  clinic 1 rating (below-threshold state); none for the rep-managed clinic
  (e2e needs a clean slate there — therapist-seed precedent).

## Out of scope (explicit)

Free-text reviews (policy, not backlog), preset tags, verified-visit gating,
search ranking by rating, per-rating public reporting, appeal flow,
clinic-rep responses to ratings.
