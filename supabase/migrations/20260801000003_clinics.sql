-- ThriveMap: clinic directory core tables

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_description text,
  description text,
  icon text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  aliases text[] not null default '{}',
  description text,
  status public.listing_status not null default 'draft',
  source_type public.source_type not null default 'manual',
  -- Primary contact surface (extra methods live in clinic_contact_methods)
  phone text,
  email text,
  website text,
  logo_url text,
  cover_image_url text,
  is_featured boolean not null default false,
  offers_online_services boolean not null default false,
  offers_in_person_services boolean not null default true,
  wheelchair_accessible boolean,
  accessibility_notes text,
  is_demo boolean not null default false,
  google_place_id text unique,
  claimed_by uuid references auth.users (id) on delete set null,
  last_verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index clinics_status_idx on public.clinics (status);
create index clinics_name_trgm_idx on public.clinics using gin (name gin_trgm_ops);
create index clinics_featured_idx on public.clinics (is_featured) where is_featured;

create trigger clinics_updated_at
  before update on public.clinics
  for each row execute function public.set_updated_at();

-- Statuses visible to the anonymous public.
create or replace function public.is_publicly_visible(p_status public.listing_status)
returns boolean
language sql
immutable
as $$
  select p_status in ('published_unverified', 'published_verified', 'temporarily_closed');
$$;

create table public.clinic_locations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  is_primary boolean not null default true,
  address_line1 text not null,
  address_line2 text,
  barangay text,
  city text not null,
  city_slug text not null,
  province text not null,
  province_slug text not null,
  postal_code text,
  country_code text not null default 'PH',
  landmark text,
  location extensions.geography(point, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clinic_locations_clinic_idx on public.clinic_locations (clinic_id);
create index clinic_locations_geo_idx on public.clinic_locations using gist (location);
create index clinic_locations_city_idx on public.clinic_locations (province_slug, city_slug);
create index clinic_locations_address_trgm_idx
  on public.clinic_locations using gin (address_line1 gin_trgm_ops);
-- One primary location per clinic.
create unique index clinic_locations_primary_idx
  on public.clinic_locations (clinic_id) where is_primary;

create trigger clinic_locations_updated_at
  before update on public.clinic_locations
  for each row execute function public.set_updated_at();

create table public.clinic_contact_methods (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  kind text not null check (kind in ('phone', 'mobile', 'email', 'fax', 'viber', 'whatsapp', 'other')),
  value text not null,
  label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index clinic_contact_methods_clinic_idx on public.clinic_contact_methods (clinic_id);

create table public.clinic_hours (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (clinic_id, day_of_week),
  check (is_closed or (opens_at is not null and closes_at is not null))
);

create index clinic_hours_clinic_idx on public.clinic_hours (clinic_id);

create table public.clinic_images (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  kind text not null default 'gallery' check (kind in ('gallery', 'logo', 'cover')),
  sort_order int not null default 0,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index clinic_images_clinic_idx on public.clinic_images (clinic_id);

create table public.clinic_social_links (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'other')),
  url text not null,
  created_at timestamptz not null default now(),
  unique (clinic_id, platform, url)
);

create index clinic_social_links_clinic_idx on public.clinic_social_links (clinic_id);

create table public.clinic_languages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  language text not null,
  created_at timestamptz not null default now(),
  unique (clinic_id, language)
);

create index clinic_languages_clinic_idx on public.clinic_languages (clinic_id);

create table public.clinic_age_groups (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  age_group public.age_group not null,
  created_at timestamptz not null default now(),
  unique (clinic_id, age_group)
);

create index clinic_age_groups_clinic_idx on public.clinic_age_groups (clinic_id);

create table public.clinic_services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  delivery public.service_delivery[] not null default '{in_person}',
  notes text,
  created_at timestamptz not null default now(),
  unique (clinic_id, service_id)
);

create index clinic_services_clinic_idx on public.clinic_services (clinic_id);
create index clinic_services_service_idx on public.clinic_services (service_id);

-- Philippine location reference used by the dev geocoder, location landing
-- pages, and autocomplete when Google is not configured.
create table public.ph_locations (
  id uuid primary key default gen_random_uuid(),
  province text not null,
  province_slug text not null,
  city text,
  city_slug text,
  barangay text,
  kind text not null check (kind in ('province', 'city', 'municipality', 'barangay')),
  centroid extensions.geography(point, 4326) not null,
  search_name text not null,
  created_at timestamptz not null default now()
);

create index ph_locations_search_trgm_idx on public.ph_locations using gin (search_name gin_trgm_ops);
create index ph_locations_slug_idx on public.ph_locations (province_slug, city_slug);
