-- ThriveMap: set-based duplicate scan.
-- The first implementation looped clinics client-side (one RPC per clinic,
-- one upsert per pair) which grows O(n²) in REST roundtrips. This does the
-- whole scan in a single statement. Scoring mirrors the old handler:
-- name similarity plus boosts for same phone/domain/place_id/proximity.

create or replace function public.scan_duplicate_candidates(
  p_clinic_id uuid default null,
  p_distance_m double precision default 500,
  p_name_similarity double precision default 0.45
)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inserted int;
begin
  with published as (
    select c.id, c.name, c.phone, c.website, c.google_place_id, l.location
    from public.clinics c
    join public.clinic_locations l on l.clinic_id = c.id and l.is_primary
    where c.deleted_at is null
      and c.status in ('published_unverified', 'published_verified', 'temporarily_closed')
  ),
  pairs as (
    select
      least(a.id, b.id) as clinic_a_id,
      greatest(a.id, b.id) as clinic_b_id,
      similarity(lower(a.name), lower(b.name))::real as name_similarity,
      st_distance(a.location, b.location) as distance_m,
      (a.phone is not null and a.phone = b.phone) as same_phone,
      (a.website is not null and b.website is not null
        and lower(regexp_replace(a.website, '^https?://(www\.)?([^/]+).*$', '\2'))
          = lower(regexp_replace(b.website, '^https?://(www\.)?([^/]+).*$', '\2'))
      ) as same_website_domain,
      (a.google_place_id is not null and a.google_place_id = b.google_place_id) as same_place_id
    from published a
    join published b on a.id < b.id
    where (p_clinic_id is null or a.id = p_clinic_id or b.id = p_clinic_id)
      and (
        similarity(lower(a.name), lower(b.name)) >= p_name_similarity
        or st_dwithin(a.location, b.location, p_distance_m)
        or (a.phone is not null and a.phone = b.phone)
        or (a.google_place_id is not null and a.google_place_id = b.google_place_id)
      )
  ),
  inserted as (
    insert into public.duplicate_match_candidates
      (clinic_a_id, clinic_b_id, similarity_score, matching_fields)
    select
      clinic_a_id,
      clinic_b_id,
      least(
        name_similarity
          + (case when same_phone then 0.3 else 0 end)
          + (case when same_website_domain then 0.2 else 0 end)
          + (case when same_place_id then 0.25 else 0 end)
          + (case when distance_m < 100 then 0.2 else 0 end),
        0.9999
      )::numeric(5, 4),
      jsonb_build_object(
        'name_similarity', name_similarity,
        'distance_m', distance_m,
        'same_phone', same_phone,
        'same_website_domain', same_website_domain,
        'same_place_id', same_place_id
      )
    from pairs
    on conflict (clinic_a_id, clinic_b_id) do nothing
    returning 1
  )
  select count(*)::int into v_inserted from inserted;
  return v_inserted;
end;
$$;

revoke execute on function public.scan_duplicate_candidates(uuid, double precision, double precision) from public, anon, authenticated;
grant execute on function public.scan_duplicate_candidates(uuid, double precision, double precision) to service_role;
