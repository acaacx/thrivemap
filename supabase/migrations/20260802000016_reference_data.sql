-- Hosted db push runs under a login role whose search_path excludes the
-- extensions schema; set it so pg_trgm/postgis references resolve.

set search_path to public, extensions;

-- ThriveMap: reference data that every environment needs.
--
-- The service taxonomy and the PH location table are not demo data — search
-- facets, /services/[slug], /locations/[province] and nearest-city assignment
-- are all empty without them. They used to live in seed.sql, which production
-- deliberately never runs (see docs/operations/deployment.md), so a hosted
-- project came up with zero services and zero locations. Reference data ships
-- as a migration; seed.sql keeps only the fictional demo records.
--
-- Inserts are idempotent so this is safe on a database that was already
-- seeded locally.

-- (province_slug, city_slug) is the natural key. `nulls not distinct` matters:
-- province rows carry a null city_slug and must not duplicate. Replaces the
-- non-unique lookup index on the same columns, which this index also serves.
drop index if exists public.ph_locations_slug_idx;

create unique index if not exists ph_locations_slug_key
  on public.ph_locations (province_slug, city_slug) nulls not distinct;

insert into public.services (slug, name, short_description, icon, sort_order) values
  ('occupational-therapy', 'Occupational Therapy', 'Support for daily living skills, motor coordination, and sensory needs.', 'hand', 1),
  ('speech-therapy', 'Speech & Language Therapy', 'Support for communication, speech, language, and social communication.', 'message-circle', 2),
  ('physical-therapy', 'Physical Therapy', 'Support for movement, strength, and gross motor development.', 'activity', 3),
  ('behavioral-therapy', 'Behavioral Therapy', 'Positive behavior support and skill-building programs.', 'puzzle', 4),
  ('early-intervention', 'Early Intervention', 'Developmental support programs for infants and toddlers.', 'baby', 5),
  ('developmental-assessment', 'Developmental Assessment', 'Developmental screening and assessment services.', 'clipboard-list', 6),
  ('special-education-support', 'Special Education Support', 'Academic support, tutoring, and school-readiness programs.', 'book-open', 7),
  ('feeding-therapy', 'Feeding Therapy', 'Support for feeding, chewing, swallowing, and mealtime routines.', 'utensils', 8)
on conflict (slug) do nothing;

-- Coverage matches Phase 1 launch scope: Metro Manila plus the provinces the
-- directory opens with. Extend by adding rows here or via a later migration.
insert into public.ph_locations (province, province_slug, city, city_slug, kind, centroid, search_name) values
  ('Metro Manila', 'metro-manila', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(121.0, 14.6), 4326)::extensions.geography, 'Metro Manila'),
  ('Metro Manila', 'metro-manila', 'Quezon City', 'quezon-city', 'city', extensions.st_setsrid(extensions.st_makepoint(121.0437, 14.6760), 4326)::extensions.geography, 'Quezon City, Metro Manila'),
  ('Metro Manila', 'metro-manila', 'Makati', 'makati', 'city', extensions.st_setsrid(extensions.st_makepoint(121.0244, 14.5547), 4326)::extensions.geography, 'Makati, Metro Manila'),
  ('Metro Manila', 'metro-manila', 'Manila', 'manila', 'city', extensions.st_setsrid(extensions.st_makepoint(120.9842, 14.5995), 4326)::extensions.geography, 'Manila, Metro Manila'),
  ('Metro Manila', 'metro-manila', 'Pasig', 'pasig', 'city', extensions.st_setsrid(extensions.st_makepoint(121.0851, 14.5764), 4326)::extensions.geography, 'Pasig, Metro Manila'),
  ('Metro Manila', 'metro-manila', 'Taguig', 'taguig', 'city', extensions.st_setsrid(extensions.st_makepoint(121.0509, 14.5176), 4326)::extensions.geography, 'Taguig, Metro Manila'),
  ('Metro Manila', 'metro-manila', 'Marikina', 'marikina', 'city', extensions.st_setsrid(extensions.st_makepoint(121.1029, 14.6507), 4326)::extensions.geography, 'Marikina, Metro Manila'),
  ('Rizal', 'rizal', 'Antipolo', 'antipolo', 'city', extensions.st_setsrid(extensions.st_makepoint(121.1753, 14.5865), 4326)::extensions.geography, 'Antipolo, Rizal'),
  ('Cebu', 'cebu', 'Cebu City', 'cebu-city', 'city', extensions.st_setsrid(extensions.st_makepoint(123.8854, 10.3157), 4326)::extensions.geography, 'Cebu City, Cebu'),
  ('Davao del Sur', 'davao-del-sur', 'Davao City', 'davao-city', 'city', extensions.st_setsrid(extensions.st_makepoint(125.4553, 7.1907), 4326)::extensions.geography, 'Davao City, Davao del Sur'),
  ('Cavite', 'cavite', 'Bacoor', 'bacoor', 'city', extensions.st_setsrid(extensions.st_makepoint(120.9367, 14.4590), 4326)::extensions.geography, 'Bacoor, Cavite'),
  ('Rizal', 'rizal', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(121.19, 14.6), 4326)::extensions.geography, 'Rizal'),
  ('Cebu', 'cebu', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(123.9, 10.3), 4326)::extensions.geography, 'Cebu'),
  ('Davao del Sur', 'davao-del-sur', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(125.4, 6.9), 4326)::extensions.geography, 'Davao del Sur'),
  ('Cavite', 'cavite', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(120.9, 14.3), 4326)::extensions.geography, 'Cavite')
on conflict (province_slug, city_slug) do nothing;
