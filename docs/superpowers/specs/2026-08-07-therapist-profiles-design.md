# Therapist profiles — design

Date: 2026-08-07
Status: approved

## Summary

Clinic managers list their care team on the clinic profile. Each therapist is
a row owned by one clinic — no shared therapist identity, no standalone
therapist pages, no therapist accounts. Entries publish immediately (same
trust model as every other clinic-portal edit on a claimed clinic); the
existing reports/moderation machinery handles abuse. Therapist names,
professions, and specialties feed the clinic search document so searching
"occupational therapist" or a therapist's name surfaces their clinic.

## Decisions (locked during brainstorm)

- **Management**: clinic managers only, via the clinic portal. No therapist
  self-service, no admin curation step.
- **Display**: a "Care team" section on the clinic profile page only. No
  `/therapists/[slug]` routes.
- **Moderation**: live immediately; report-based. No approval queue, no PRC
  license verification. No new report type — clinic-level reports suffice.
- **Data model**: approach A — single per-clinic `clinic_therapists`
  satellite table (like `clinic_hours`/`clinic_services`). Same person at
  two clinics is two rows. Promote to a shared entity later only if
  self-service or standalone pages arrive.
- **Search**: therapist names weight B; professions + specialties weight C
  in the existing clinic search vector. No new filter facets.

## Data model (migration 19, `20260807000019_clinic_therapists.sql`)

```sql
create table public.clinic_therapists (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  full_name text not null,        -- 2–120 chars, trimmed (zod + check)
  credentials text,               -- post-nominals, e.g. "OTRP"; ≤80
  profession text not null,       -- e.g. "Occupational Therapist"; ≤80
  specialties text[] not null default '{}',  -- free-form chips; each ≤60, max 10
  bio text,                       -- ≤1000
  photo_path text,                -- storage path in public clinic-images bucket
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.clinic_therapists (clinic_id, display_order);
```

- No lifecycle/status column. Removal = delete.
- `updated_at` maintained by the existing touch-trigger pattern.
- Photos live in the existing **public `clinic-images` bucket** under
  `<clinic_id>/therapists/<uuid>.<ext>`; the existing
  `manages_clinic((storage.foldername(name))[1])` insert policy already
  covers that prefix. No new bucket, no new storage policies.

### RLS + grants

Same shape as `clinic_services`:

- `read`: public select.
- `manage`: `manages_clinic(clinic_id)` or admin, for insert/update/delete.
- Supabase hardened defaults: explicit `grant select` to anon/authenticated
  and `grant insert, update, delete` to authenticated (RLS gates access).
  Follow migration 8/17/18 precedent.

Direct table writes under RLS — **no security-definer RPCs**. (Inquiries
needed RPCs because callers had no table rights; managers legitimately own
these rows.)

### Search integration

- `refresh_clinic_search_document` gains two inputs:
  - therapist `full_name`s → weight **B** (with location text)
  - `profession` + `specialties` → weight **C** (with services)
- New trigger `clinic_therapists_search_refresh` on insert/update/delete,
  `for each row execute function public.trg_refresh_clinic_search()` —
  identical to the `clinic_services` trigger.
- No backfill needed (table starts empty; docs refresh as rows appear).

## Module: `src/modules/therapists/`

- `schemas.ts` — zod: `therapistInputSchema` (full_name 2–120 trimmed,
  credentials ≤80 optional, profession 1–80, specialties array ≤10 × ≤60
  trimmed non-empty, bio ≤1000 optional), reorder schema (id + direction).
  No `.coerce`/`.default()` (zodResolver constraint).
- `queries.ts` — `listClinicTherapists(clinicId)` ordered by
  `display_order, created_at`; used by both the public clinic page (anon
  client, cached with the page) and the portal (user client).
- `actions.ts` — server actions: create, update, delete, reorder (swap
  `display_order` with neighbor), setPhoto/removePhoto. Auth = active
  manager of the clinic (same guard as other portal actions). Rate limit:
  60 writes/hr per user (reuse in-memory limiter). `console.error` on
  supabase errors (per the logging sweep convention). Revalidate the
  clinic page path after writes.
- `components/` — `TherapistCard` (public), `TherapistList` +
  `TherapistForm` + `TherapistPhotoUpload` (portal).

## UI

### Public — clinic profile page

"Care team" section below services: avatar (photo or initials fallback),
name + credentials, profession, specialty chips, bio (line-clamped with
expand if long). Server-rendered from page data — ISR-cacheable, no client
auth. Section hidden when the clinic has no therapists. Warm Horizon theme;
follow existing clinic-page section components.

### Portal — `/clinic-portal/[clinicId]/team`

List with add/edit/delete and up/down reorder buttons (no drag-and-drop).
Photo upload follows the portal images page pattern (client upload to
storage, then action records `photo_path`). Add "Team" to the portal nav.

## Testing

- **Unit**: schema validation (lengths, trimming, specialties cap, reorder
  schema).
- **Integration** (`[itest]` markers, service-client cleanup):
  - manager can insert/update/delete own clinic's rows; non-manager and
    anon blocked; admin allowed.
  - search: adding a therapist refreshes the clinic search document;
    querying profession/specialty/name matches the clinic; deletion
    removes the terms.
- **e2e** (`[e2e]` markers, chromium-only serial where shared accounts
  mutate): portal add → edit → reorder → delete flow; clinic page renders
  the care team section; photo upload happy path.

## Out of scope

Shared therapist entity, standalone therapist pages, therapist accounts /
self-service, PRC license verification, specialty filter facets, i18n,
per-therapist reports.
