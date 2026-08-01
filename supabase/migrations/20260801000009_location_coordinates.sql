-- Expose clinic coordinates as generated columns so PostgREST selects can
-- return plain lat/lng without RPC round-trips. The geography column remains
-- the source of truth for spatial queries.

alter table public.clinic_locations
  add column latitude double precision
    generated always as (extensions.st_y(location::extensions.geometry)) stored,
  add column longitude double precision
    generated always as (extensions.st_x(location::extensions.geometry)) stored;
