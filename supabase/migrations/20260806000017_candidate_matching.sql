-- ThriveMap: candidate-vs-clinic matching + promotion for Places imports.
-- match_candidate_clinics: fuzzy match one external candidate against live
-- clinics (trigram name, PostGIS proximity, exact google_place_id).
-- promote_candidate: candidate -> new draft clinic + source record.
-- attach_candidate: candidate -> source record on an existing clinic.
-- All three are security definer with internal moderator checks; callers are
-- the admin server actions.

create or replace function public.match_candidate_clinics(
  p_candidate_id uuid,
  p_distance_m double precision default 500,
  p_name_similarity double precision default 0.45
)
returns table (
  clinic_id uuid,
  clinic_name text,
  clinic_slug text,
  name_similarity real,
  distance_m double precision,
  same_place_id boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id,
    c.name,
    c.slug,
    similarity(c.name, coalesce(cand.normalized_name, '')) as name_similarity,
    case
      when cand.latitude is not null and cand.longitude is not null
        and l.location is not null
      then st_distance(
        l.location,
        st_setsrid(st_makepoint(cand.longitude, cand.latitude), 4326)::geography
      )
    end as distance_m,
    (c.google_place_id is not null
      and c.google_place_id = cand.external_id) as same_place_id
  from public.external_place_candidates cand
  join public.clinics c on c.deleted_at is null
  left join public.clinic_locations l
    on l.clinic_id = c.id and l.is_primary
  where cand.id = p_candidate_id
    and public.is_moderator_or_admin()
    and (
      (c.google_place_id is not null
        and c.google_place_id = cand.external_id)
      or similarity(c.name, coalesce(cand.normalized_name, ''))
        >= p_name_similarity
      or (
        cand.latitude is not null and cand.longitude is not null
        and l.location is not null
        and st_dwithin(
          l.location,
          st_setsrid(st_makepoint(cand.longitude, cand.latitude), 4326)::geography,
          p_distance_m
        )
        and similarity(c.name, coalesce(cand.normalized_name, '')) >= 0.2
      )
    )
  order by same_place_id desc, name_similarity desc
  limit 5;
$$;

create or replace function public.promote_candidate(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cand public.external_place_candidates;
  v_clinic_id uuid;
  v_slug text;
  v_city record;
begin
  if not public.is_moderator_or_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_cand
  from public.external_place_candidates
  where id = p_candidate_id
  for update;
  if not found then
    raise exception 'candidate not found';
  end if;
  if v_cand.status not in ('new', 'under_review') then
    raise exception 'candidate is not open for review';
  end if;
  if exists (
    select 1 from public.clinics
    where google_place_id = v_cand.external_id
  ) then
    raise exception 'already linked: a clinic has this place id';
  end if;

  v_slug := trim(both '-' from regexp_replace(
    lower(coalesce(v_cand.normalized_name, 'clinic')),
    '[^a-z0-9]+', '-', 'g'
  ));
  v_slug := left(coalesce(nullif(v_slug, ''), 'clinic'), 60);
  if exists (select 1 from public.clinics where slug = v_slug) then
    v_slug := left(v_slug, 51) || '-' || substr(v_cand.id::text, 1, 8);
  end if;

  insert into public.clinics (
    slug, name, status, source_type, google_place_id,
    phone, website, created_by, updated_by
  )
  values (
    v_slug,
    coalesce(v_cand.normalized_name, 'Unnamed place'),
    'draft',
    'external_import',
    v_cand.external_id,
    nullif(v_cand.raw_payload ->> 'internationalPhoneNumber', ''),
    nullif(v_cand.raw_payload ->> 'websiteUri', ''),
    auth.uid(),
    auth.uid()
  )
  returning id into v_clinic_id;

  if v_cand.latitude is not null and v_cand.longitude is not null then
    select * into v_city
    from public.nearest_ph_city(v_cand.latitude, v_cand.longitude);
    insert into public.clinic_locations (
      clinic_id, is_primary, address_line1,
      city, city_slug, province, province_slug, location
    )
    values (
      v_clinic_id,
      true,
      coalesce(v_cand.normalized_address, 'Address to be confirmed'),
      coalesce(v_city.city, 'Unknown'),
      coalesce(v_city.city_slug, 'unknown'),
      coalesce(v_city.province, 'Unknown'),
      coalesce(v_city.province_slug, 'unknown'),
      st_setsrid(
        st_makepoint(v_cand.longitude, v_cand.latitude), 4326
      )::geography
    );
  end if;

  insert into public.clinic_source_records (
    clinic_id, source_type, provider, external_id, raw_payload
  )
  values (
    v_clinic_id, 'external_import', v_cand.provider,
    v_cand.external_id, v_cand.raw_payload
  );

  update public.external_place_candidates
  set status = 'promoted',
      promoted_clinic_id = v_clinic_id,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_candidate_id;

  return v_clinic_id;
end;
$$;

create or replace function public.attach_candidate(
  p_candidate_id uuid,
  p_clinic_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cand public.external_place_candidates;
begin
  if not public.is_moderator_or_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_cand
  from public.external_place_candidates
  where id = p_candidate_id
  for update;
  if not found then
    raise exception 'candidate not found';
  end if;
  if v_cand.status not in ('new', 'under_review') then
    raise exception 'candidate is not open for review';
  end if;
  if not exists (
    select 1 from public.clinics
    where id = p_clinic_id and deleted_at is null
  ) then
    raise exception 'clinic not found';
  end if;

  insert into public.clinic_source_records (
    clinic_id, source_type, provider, external_id, raw_payload
  )
  values (
    p_clinic_id, 'external_import', v_cand.provider,
    v_cand.external_id, v_cand.raw_payload
  );

  -- Backfill the place id when the clinic has none and no other clinic
  -- claims it (google_place_id is unique).
  update public.clinics
  set google_place_id = v_cand.external_id,
      updated_by = auth.uid()
  where id = p_clinic_id
    and google_place_id is null
    and not exists (
      select 1 from public.clinics
      where google_place_id = v_cand.external_id
    );

  update public.external_place_candidates
  set status = 'promoted',
      promoted_clinic_id = p_clinic_id,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_candidate_id;
end;
$$;

-- Hardened defaults: lock execution to signed-in users; the functions
-- themselves gate on is_moderator_or_admin().
revoke execute on function public.match_candidate_clinics(uuid, double precision, double precision) from public, anon;
revoke execute on function public.promote_candidate(uuid) from public, anon;
revoke execute on function public.attach_candidate(uuid, uuid) from public, anon;
grant execute on function public.match_candidate_clinics(uuid, double precision, double precision) to authenticated, service_role;
grant execute on function public.promote_candidate(uuid) to authenticated, service_role;
grant execute on function public.attach_candidate(uuid, uuid) to authenticated, service_role;
