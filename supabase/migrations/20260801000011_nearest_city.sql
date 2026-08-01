-- ThriveMap: nearest-city lookup for submission approval.
-- A moderator-approved submission carries only a free-text address plus an
-- optional map pin; clinic_locations needs structured city/province, so we
-- resolve them from the nearest seeded PH city/municipality centroid.

create or replace function public.nearest_ph_city(
  p_lat double precision,
  p_lng double precision
)
returns table (
  city text,
  city_slug text,
  province text,
  province_slug text,
  distance_m double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    l.city,
    l.city_slug,
    l.province,
    l.province_slug,
    st_distance(
      l.centroid,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    )
  from public.ph_locations l
  where l.kind in ('city', 'municipality')
  order by l.centroid <-> st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  limit 1;
$$;
