-- Hosted db push runs under a login role whose search_path excludes the
-- extensions schema; set it so pg_trgm/postgis references resolve.

set search_path to public, extensions;

-- Keyset pagination for every sort mode.
--
-- Before this, only `nearest` and `relevance` carried a cursor; the other
-- three sorts were limit-only, so "load more" silently stopped after the
-- first page. The relevance cursor was also wrong on rank ties: it compared
-- (rank, id) < (cursor_rank, cursor_id), which skips tied rows whose id is
-- greater than the cursor's.
--
-- The function now emits the sort key it ordered by (`sort_value` for the
-- numeric sorts, `sort_text` for alphabetical) so callers never recompute it,
-- and the keyset predicate is written per sort direction.
--
-- Return type changes, so the old function must be dropped first.
drop function if exists public.search_clinics(
  double precision, double precision, double precision,
  double precision, double precision, double precision, double precision,
  text, text[], public.age_group[],
  boolean, boolean, boolean, boolean, boolean,
  text, double precision, uuid, int
);

create function public.search_clinics(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km double precision default 10,
  p_north double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_west double precision default null,
  p_query text default null,
  p_service_slugs text[] default null,
  p_age_groups public.age_group[] default null,
  p_verified_only boolean default false,
  p_online_services boolean default null,
  p_in_person_services boolean default null,
  p_open_now boolean default false,
  p_accessible_only boolean default false,
  p_sort text default 'nearest',
  p_cursor_value double precision default null,
  p_cursor_text text default null,
  p_cursor_id uuid default null,
  p_limit int default 20
)
returns table (
  clinic_id uuid,
  slug text,
  name text,
  status public.listing_status,
  description text,
  logo_url text,
  phone text,
  website text,
  offers_online_services boolean,
  offers_in_person_services boolean,
  wheelchair_accessible boolean,
  last_verified_at timestamptz,
  address_line1 text,
  barangay text,
  city text,
  province text,
  latitude double precision,
  longitude double precision,
  distance_km double precision,
  is_open_now boolean,
  service_names text[],
  service_slugs text[],
  rank real,
  sort_value double precision,
  sort_text text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with origin as (
    select case
      when p_lat is not null and p_lng is not null
        then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    end as pt
  ),
  base as (
    select
      c.id as clinic_id,
      c.slug,
      c.name,
      c.status,
      c.description,
      c.logo_url,
      c.phone,
      c.website,
      c.offers_online_services,
      c.offers_in_person_services,
      c.wheelchair_accessible,
      c.last_verified_at,
      l.address_line1,
      l.barangay,
      l.city,
      l.province,
      st_y(l.location::geometry) as latitude,
      st_x(l.location::geometry) as longitude,
      case when o.pt is not null
        then st_distance(l.location, o.pt) / 1000.0
      end as distance_km,
      case when p_query is not null and length(trim(p_query)) > 0
        then greatest(
          ts_rank(d.search_vector, websearch_to_tsquery('simple', p_query)),
          similarity(d.name_normalized, lower(p_query))
        )
        else 0
      end::real as rank
    from public.clinics c
    join public.clinic_locations l on l.clinic_id = c.id and l.is_primary
    left join public.clinic_search_documents d on d.clinic_id = c.id
    cross join origin o
    where c.deleted_at is null
      and public.is_publicly_visible(c.status)
      and (not p_verified_only or c.status = 'published_verified')
      and (p_online_services is null or c.offers_online_services = p_online_services)
      and (p_in_person_services is null or c.offers_in_person_services = p_in_person_services)
      and (not p_accessible_only or c.wheelchair_accessible is true)
      -- spatial: bounding box takes priority when supplied, else radius
      and (
        case
          when p_north is not null and p_south is not null
               and p_east is not null and p_west is not null
            then st_intersects(
              l.location,
              st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography
            )
          when o.pt is not null
            then st_dwithin(l.location, o.pt, p_radius_km * 1000)
          else true
        end
      )
      and (
        p_query is null or length(trim(p_query)) = 0
        or d.search_vector @@ websearch_to_tsquery('simple', p_query)
        or similarity(d.name_normalized, lower(p_query)) > 0.2
      )
      and (
        p_service_slugs is null
        or exists (
          select 1
          from public.clinic_services cs
          join public.services s on s.id = cs.service_id
          where cs.clinic_id = c.id and s.slug = any (p_service_slugs)
        )
      )
      and (
        p_age_groups is null
        or exists (
          select 1 from public.clinic_age_groups ag
          where ag.clinic_id = c.id and ag.age_group = any (p_age_groups)
        )
      )
      and (not p_open_now or public.is_clinic_open_at(c.id))
  ),
  enriched as (
    select
      b.*,
      public.is_clinic_open_at(b.clinic_id) as is_open_now,
      coalesce(
        (select array_agg(s.name order by s.sort_order)
         from public.clinic_services cs
         join public.services s on s.id = cs.service_id
         where cs.clinic_id = b.clinic_id),
        '{}'
      ) as service_names,
      coalesce(
        (select array_agg(s.slug order by s.sort_order)
         from public.clinic_services cs
         join public.services s on s.id = cs.service_id
         where cs.clinic_id = b.clinic_id),
        '{}'
      ) as service_slugs
    from base b
  ),
  keyed as (
    select
      e.*,
      -- Keys are rounded so the value the client receives round-trips back
      -- exactly: float8 is rendered with 15 significant digits, which is one
      -- short of what a double needs, and an off-by-one-ulp cursor re-emits
      -- the boundary row on the next page.
      case p_sort
        -- Rows with no origin point sort last; the sentinel keeps the key
        -- non-null so the cursor comparison stays total.
        when 'nearest' then round(coalesce(e.distance_km, 1e12)::numeric, 6)
        when 'relevance' then round(e.rank::numeric, 6)
        when 'verified_first'
          then (e.status = 'published_verified')::int::numeric
        when 'recently_verified'
          then round(coalesce(extract(epoch from e.last_verified_at), -1), 3)
      end::double precision as sort_value,
      case when p_sort = 'alphabetical' then e.name end as sort_text
    from enriched e
  )
  select
    k.clinic_id, k.slug, k.name, k.status, k.description, k.logo_url,
    k.phone, k.website, k.offers_online_services, k.offers_in_person_services,
    k.wheelchair_accessible, k.last_verified_at,
    k.address_line1, k.barangay, k.city, k.province,
    k.latitude, k.longitude, k.distance_km, k.is_open_now,
    k.service_names, k.service_slugs, k.rank,
    k.sort_value, k.sort_text
  from keyed k
  where
    p_cursor_id is null
    or case p_sort
      -- ascending sorts: plain row-wise comparison
      when 'alphabetical' then
        (k.sort_text, k.clinic_id) > (p_cursor_text, p_cursor_id)
      when 'nearest' then
        (k.sort_value, k.clinic_id) > (p_cursor_value, p_cursor_id)
      -- descending key, ascending id tie-break: cannot be a row comparison
      else
        k.sort_value < p_cursor_value
        or (k.sort_value = p_cursor_value and k.clinic_id > p_cursor_id)
    end
  order by
    case when p_sort = 'alphabetical' then k.sort_text end asc,
    case when p_sort = 'nearest' then k.sort_value end asc,
    case
      when p_sort in ('relevance', 'verified_first', 'recently_verified')
        then k.sort_value
    end desc,
    k.clinic_id asc
  limit least(coalesce(p_limit, 20), 50);
$$;
