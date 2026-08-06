-- ThriveMap: clinic care team (therapist profiles).
-- Per-clinic rows owned by the clinic (no shared therapist identity).
-- Spec: docs/superpowers/specs/2026-08-07-therapist-profiles-design.md

create table public.clinic_therapists (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  full_name text not null
    check (char_length(btrim(full_name)) between 2 and 120),
  credentials text
    check (credentials is null or char_length(credentials) <= 80),
  profession text not null
    check (char_length(btrim(profession)) between 1 and 80),
  specialties text[] not null default '{}'
    check (coalesce(array_length(specialties, 1), 0) <= 10),
  bio text
    check (bio is null or char_length(bio) <= 1000),
  photo_path text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clinic_therapists_clinic_idx
  on public.clinic_therapists (clinic_id, display_order);

create trigger clinic_therapists_updated_at
  before update on public.clinic_therapists
  for each row execute function public.set_updated_at();

-- RLS: same shape as the other clinic satellite tables (migration 6).
alter table public.clinic_therapists enable row level security;
create policy "clinic_therapists: read" on public.clinic_therapists
  for select using (public.clinic_readable_or_managed(clinic_id));
create policy "clinic_therapists: manage" on public.clinic_therapists
  for all using (public.clinic_managed_or_admin(clinic_id))
  with check (public.clinic_managed_or_admin(clinic_id));

-- Grants: hardened defaults mean new tables get nothing implicit
-- (migration 8 precedent). RLS remains the row-level gate.
grant select on public.clinic_therapists to anon, authenticated;
grant insert, update, delete on public.clinic_therapists to authenticated;
grant all on public.clinic_therapists to service_role;

-- Search: therapist names join weight B (with locations); professions and
-- specialties join weight C (with services). Full function body replaced —
-- weights are now: A = name + aliases, B = locations + therapist names,
-- C = services + therapist professions/specialties, D = description.
create or replace function public.refresh_clinic_search_document(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clinic public.clinics%rowtype;
  v_location_text text;
  v_service_text text;
  v_therapist_names text;
  v_therapist_focus text;
  v_vector tsvector;
begin
  select * into v_clinic from public.clinics where id = p_clinic_id;
  if not found then
    delete from public.clinic_search_documents where clinic_id = p_clinic_id;
    return;
  end if;

  select string_agg(concat_ws(' ', barangay, city, province, postal_code), ' ')
    into v_location_text
  from public.clinic_locations
  where clinic_id = p_clinic_id;

  select string_agg(s.name, ' ')
    into v_service_text
  from public.clinic_services cs
  join public.services s on s.id = cs.service_id
  where cs.clinic_id = p_clinic_id;

  select string_agg(full_name, ' ')
    into v_therapist_names
  from public.clinic_therapists
  where clinic_id = p_clinic_id;

  select string_agg(concat_ws(' ', profession, array_to_string(specialties, ' ')), ' ')
    into v_therapist_focus
  from public.clinic_therapists
  where clinic_id = p_clinic_id;

  v_vector :=
    setweight(to_tsvector('simple', coalesce(v_clinic.name, '') || ' ' || array_to_string(v_clinic.aliases, ' ')), 'A') ||
    setweight(to_tsvector('simple', concat_ws(' ', coalesce(v_location_text, ''), coalesce(v_therapist_names, ''))), 'B') ||
    setweight(to_tsvector('simple', concat_ws(' ', coalesce(v_service_text, ''), coalesce(v_therapist_focus, ''))), 'C') ||
    setweight(to_tsvector('english', coalesce(v_clinic.description, '')), 'D');

  insert into public.clinic_search_documents (clinic_id, search_vector, name_normalized, refreshed_at)
  values (p_clinic_id, v_vector, lower(v_clinic.name), now())
  on conflict (clinic_id) do update
    set search_vector = excluded.search_vector,
        name_normalized = excluded.name_normalized,
        refreshed_at = excluded.refreshed_at;
end;
$$;

create trigger clinic_therapists_search_refresh
  after insert or update or delete on public.clinic_therapists
  for each row execute function public.trg_refresh_clinic_search();
