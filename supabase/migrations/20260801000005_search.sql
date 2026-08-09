-- Hosted db push runs under a login role whose search_path excludes the
-- extensions schema; set it so pg_trgm/postgis references resolve.

set search_path to public, extensions;

-- ThriveMap: search documents, geospatial + text search RPCs

create table public.clinic_search_documents (
  clinic_id uuid primary key references public.clinics (id) on delete cascade,
  search_vector tsvector not null,
  name_normalized text not null,
  refreshed_at timestamptz not null default now()
);

create index clinic_search_documents_vector_idx
  on public.clinic_search_documents using gin (search_vector);
create index clinic_search_documents_name_trgm_idx
  on public.clinic_search_documents using gin (name_normalized gin_trgm_ops);

-- Rebuild the weighted search document for one clinic.
-- Weights: A = name + aliases, B = city/province/barangay, C = services, D = description.
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

  v_vector :=
    setweight(to_tsvector('simple', coalesce(v_clinic.name, '') || ' ' || array_to_string(v_clinic.aliases, ' ')), 'A') ||
    setweight(to_tsvector('simple', coalesce(v_location_text, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(v_service_text, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(v_clinic.description, '')), 'D');

  insert into public.clinic_search_documents (clinic_id, search_vector, name_normalized, refreshed_at)
  values (p_clinic_id, v_vector, lower(v_clinic.name), now())
  on conflict (clinic_id) do update
    set search_vector = excluded.search_vector,
        name_normalized = excluded.name_normalized,
        refreshed_at = excluded.refreshed_at;
end;
$$;

create or replace function public.trg_refresh_clinic_search()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
begin
  if tg_table_name = 'clinics' then
    v_clinic_id := coalesce(new.id, old.id);
  else
    v_clinic_id := coalesce(new.clinic_id, old.clinic_id);
  end if;
  perform public.refresh_clinic_search_document(v_clinic_id);
  return coalesce(new, old);
end;
$$;

create trigger clinics_search_refresh
  after insert or update of name, aliases, description on public.clinics
  for each row execute function public.trg_refresh_clinic_search();

create trigger clinic_locations_search_refresh
  after insert or update or delete on public.clinic_locations
  for each row execute function public.trg_refresh_clinic_search();

create trigger clinic_services_search_refresh
  after insert or update or delete on public.clinic_services
  for each row execute function public.trg_refresh_clinic_search();

-- Is the clinic open at the given timestamp (Asia/Manila)?
create or replace function public.is_clinic_open_at(p_clinic_id uuid, p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_hours h
    where h.clinic_id = p_clinic_id
      and h.day_of_week = extract(dow from (p_at at time zone 'Asia/Manila'))::smallint
      and not h.is_closed
      and (p_at at time zone 'Asia/Manila')::time between h.opens_at and h.closes_at
  );
$$;

-- Primary search RPC. Accepts either a center-radius or a bounding box.
-- Cursor is keyset-based: pass the previous page's last (sort value, id).
create or replace function public.search_clinics(
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
  rank real
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
  )
  select
    e.clinic_id, e.slug, e.name, e.status, e.description, e.logo_url,
    e.phone, e.website, e.offers_online_services, e.offers_in_person_services,
    e.wheelchair_accessible, e.last_verified_at,
    e.address_line1, e.barangay, e.city, e.province,
    e.latitude, e.longitude, e.distance_km, e.is_open_now,
    e.service_names, e.service_slugs, e.rank
  from enriched e
  where
    -- keyset cursor per sort mode
    case p_sort
      when 'nearest' then
        p_cursor_value is null
        or (e.distance_km, e.clinic_id) > (p_cursor_value, p_cursor_id)
      when 'relevance' then
        p_cursor_value is null
        or (e.rank, e.clinic_id) < (p_cursor_value::real, p_cursor_id)
      when 'alphabetical' then true -- alphabetical uses name cursor below via offsetless filter
      else true
    end
  order by
    case when p_sort = 'nearest' then e.distance_km end asc nulls last,
    case when p_sort = 'relevance' then e.rank end desc,
    case when p_sort = 'verified_first' then (e.status = 'published_verified')::int end desc,
    case when p_sort = 'recently_verified' then e.last_verified_at end desc nulls last,
    case when p_sort = 'alphabetical' then e.name end asc,
    e.clinic_id asc
  limit least(coalesce(p_limit, 20), 50);
$$;

-- Lightweight marker query for the map viewport.
create or replace function public.get_map_clinics(
  p_north double precision,
  p_south double precision,
  p_east double precision,
  p_west double precision,
  p_service_slugs text[] default null,
  p_verified_only boolean default false,
  p_limit int default 400
)
returns table (
  clinic_id uuid,
  slug text,
  name text,
  status public.listing_status,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id,
    c.slug,
    c.name,
    c.status,
    st_y(l.location::geometry),
    st_x(l.location::geometry)
  from public.clinics c
  join public.clinic_locations l on l.clinic_id = c.id and l.is_primary
  where c.deleted_at is null
    and public.is_publicly_visible(c.status)
    and (not p_verified_only or c.status = 'published_verified')
    and st_intersects(
      l.location,
      st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography
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
  limit least(coalesce(p_limit, 400), 1000);
$$;

-- Duplicate detection: candidates similar to the given clinic.
create or replace function public.find_duplicate_candidates(
  p_clinic_id uuid,
  p_distance_m double precision default 500,
  p_name_similarity double precision default 0.45
)
returns table (
  other_clinic_id uuid,
  name_similarity real,
  distance_m double precision,
  same_phone boolean,
  same_website_domain boolean,
  same_place_id boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c2.id,
    similarity(lower(c1.name), lower(c2.name))::real,
    st_distance(l1.location, l2.location),
    c1.phone is not null and c1.phone = c2.phone,
    c1.website is not null
      and lower(regexp_replace(c1.website, '^https?://(www\.)?([^/]+).*$', '\2'))
        = lower(regexp_replace(c2.website, '^https?://(www\.)?([^/]+).*$', '\2')),
    c1.google_place_id is not null and c1.google_place_id = c2.google_place_id
  from public.clinics c1
  join public.clinic_locations l1 on l1.clinic_id = c1.id and l1.is_primary
  cross join public.clinics c2
  join public.clinic_locations l2 on l2.clinic_id = c2.id and l2.is_primary
  where c1.id = p_clinic_id
    and c2.id <> c1.id
    and c2.deleted_at is null
    and (
      similarity(lower(c1.name), lower(c2.name)) >= p_name_similarity
      or st_dwithin(l1.location, l2.location, p_distance_m)
      or (c1.phone is not null and c1.phone = c2.phone)
      or (c1.google_place_id is not null and c1.google_place_id = c2.google_place_id)
    );
$$;

-- Location autocomplete for the dev geocoder / PH location search.
create or replace function public.search_ph_locations(
  p_query text,
  p_limit int default 8
)
returns table (
  id uuid,
  label text,
  kind text,
  province_slug text,
  city_slug text,
  latitude double precision,
  longitude double precision,
  score real
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    p.id,
    p.search_name,
    p.kind,
    p.province_slug,
    p.city_slug,
    st_y(p.centroid::geometry),
    st_x(p.centroid::geometry),
    similarity(lower(p.search_name), lower(p_query))::real
  from public.ph_locations p
  where p.search_name % p_query
     or lower(p.search_name) like lower(p_query) || '%'
  order by similarity(lower(p.search_name), lower(p_query)) desc
  limit least(coalesce(p_limit, 8), 20);
$$;
