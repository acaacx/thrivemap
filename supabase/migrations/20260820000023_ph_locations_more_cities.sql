-- Hosted db push runs under a login role whose search_path excludes the
-- extensions schema; set it so pg_trgm/postgis references resolve.

set search_path to public, extensions;

-- ThriveMap: expand public.ph_locations coverage beyond Phase 1 launch scope.
--
-- Clinics promoted from Places candidates get their city/province from
-- public.nearest_ph_city(lat, lng), which just picks the nearest seeded row.
-- With only ~10 cities seeded, clinics far from all of them get assigned to
-- whatever seeded city happens to be nearest — e.g. a Dumaguete City clinic
-- landing on "Cebu City, Cebu". Filling out the major provincial capitals and
-- highly urbanized cities shrinks that error radius everywhere. Admins can
-- still correct a bad assignment by hand (see the clinic identity form).
--
-- Idempotent via the same (province_slug, city_slug) unique index the
-- previous reference-data migration created; on conflict do nothing.

insert into public.ph_locations (province, province_slug, city, city_slug, kind, centroid, search_name) values
  ('Negros Oriental', 'negros-oriental', 'Dumaguete City', 'dumaguete-city', 'city', extensions.st_setsrid(extensions.st_makepoint(123.3054, 9.3068), 4326)::extensions.geography, 'Dumaguete City, Negros Oriental'),
  ('Batangas', 'batangas', 'Lipa City', 'lipa-city', 'city', extensions.st_setsrid(extensions.st_makepoint(121.1624, 13.9411), 4326)::extensions.geography, 'Lipa City, Batangas'),
  ('Batangas', 'batangas', 'Batangas City', 'batangas-city', 'city', extensions.st_setsrid(extensions.st_makepoint(121.0583, 13.7565), 4326)::extensions.geography, 'Batangas City, Batangas'),
  ('Negros Occidental', 'negros-occidental', 'Bacolod', 'bacolod', 'city', extensions.st_setsrid(extensions.st_makepoint(122.9509, 10.6765), 4326)::extensions.geography, 'Bacolod, Negros Occidental'),
  ('Iloilo', 'iloilo', 'Iloilo City', 'iloilo-city', 'city', extensions.st_setsrid(extensions.st_makepoint(122.5621, 10.7202), 4326)::extensions.geography, 'Iloilo City, Iloilo'),
  ('Misamis Oriental', 'misamis-oriental', 'Cagayan de Oro', 'cagayan-de-oro', 'city', extensions.st_setsrid(extensions.st_makepoint(124.6319, 8.4542), 4326)::extensions.geography, 'Cagayan de Oro, Misamis Oriental'),
  ('Zamboanga del Sur', 'zamboanga-del-sur', 'Zamboanga City', 'zamboanga-city', 'city', extensions.st_setsrid(extensions.st_makepoint(122.0790, 6.9214), 4326)::extensions.geography, 'Zamboanga City, Zamboanga del Sur'),
  ('South Cotabato', 'south-cotabato', 'General Santos', 'general-santos', 'city', extensions.st_setsrid(extensions.st_makepoint(125.1716, 6.1164), 4326)::extensions.geography, 'General Santos, South Cotabato'),
  ('Benguet', 'benguet', 'Baguio', 'baguio', 'city', extensions.st_setsrid(extensions.st_makepoint(120.5960, 16.4023), 4326)::extensions.geography, 'Baguio, Benguet'),
  ('Camarines Sur', 'camarines-sur', 'Naga City', 'naga-city', 'city', extensions.st_setsrid(extensions.st_makepoint(123.1948, 13.6218), 4326)::extensions.geography, 'Naga City, Camarines Sur'),
  ('Albay', 'albay', 'Legazpi', 'legazpi', 'city', extensions.st_setsrid(extensions.st_makepoint(123.7438, 13.1391), 4326)::extensions.geography, 'Legazpi, Albay'),
  ('Leyte', 'leyte', 'Tacloban', 'tacloban', 'city', extensions.st_setsrid(extensions.st_makepoint(125.0026, 11.2543), 4326)::extensions.geography, 'Tacloban, Leyte'),
  ('Palawan', 'palawan', 'Puerto Princesa', 'puerto-princesa', 'city', extensions.st_setsrid(extensions.st_makepoint(118.7353, 9.7392), 4326)::extensions.geography, 'Puerto Princesa, Palawan'),
  ('Pangasinan', 'pangasinan', 'Dagupan', 'dagupan', 'city', extensions.st_setsrid(extensions.st_makepoint(120.3333, 16.0433), 4326)::extensions.geography, 'Dagupan, Pangasinan'),
  ('Tarlac', 'tarlac', 'Tarlac City', 'tarlac-city', 'city', extensions.st_setsrid(extensions.st_makepoint(120.5979, 15.4802), 4326)::extensions.geography, 'Tarlac City, Tarlac'),
  ('Zambales', 'zambales', 'Olongapo', 'olongapo', 'city', extensions.st_setsrid(extensions.st_makepoint(120.2842, 14.8386), 4326)::extensions.geography, 'Olongapo, Zambales'),
  ('Quezon', 'quezon', 'Lucena', 'lucena', 'city', extensions.st_setsrid(extensions.st_makepoint(121.6170, 13.9373), 4326)::extensions.geography, 'Lucena, Quezon'),
  ('Laguna', 'laguna', 'Santa Rosa', 'santa-rosa', 'city', extensions.st_setsrid(extensions.st_makepoint(121.1114, 14.3123), 4326)::extensions.geography, 'Santa Rosa, Laguna'),
  ('Laguna', 'laguna', 'Calamba', 'calamba', 'city', extensions.st_setsrid(extensions.st_makepoint(121.1653, 14.2117), 4326)::extensions.geography, 'Calamba, Laguna'),
  ('Laguna', 'laguna', 'San Pedro', 'san-pedro', 'city', extensions.st_setsrid(extensions.st_makepoint(121.0583, 14.3583), 4326)::extensions.geography, 'San Pedro, Laguna'),
  ('Laguna', 'laguna', 'Biñan', 'binan', 'city', extensions.st_setsrid(extensions.st_makepoint(121.0806, 14.3422), 4326)::extensions.geography, 'Biñan, Laguna'),
  ('Pampanga', 'pampanga', 'San Fernando', 'san-fernando', 'city', extensions.st_setsrid(extensions.st_makepoint(120.6898, 15.0286), 4326)::extensions.geography, 'San Fernando, Pampanga'),
  ('Pampanga', 'pampanga', 'Angeles City', 'angeles-city', 'city', extensions.st_setsrid(extensions.st_makepoint(120.5887, 15.1450), 4326)::extensions.geography, 'Angeles City, Pampanga'),
  ('Nueva Ecija', 'nueva-ecija', 'Cabanatuan', 'cabanatuan', 'city', extensions.st_setsrid(extensions.st_makepoint(120.9734, 15.4865), 4326)::extensions.geography, 'Cabanatuan, Nueva Ecija'),
  ('Cagayan', 'cagayan', 'Tuguegarao', 'tuguegarao', 'city', extensions.st_setsrid(extensions.st_makepoint(121.7270, 17.6132), 4326)::extensions.geography, 'Tuguegarao, Cagayan'),
  ('Agusan del Norte', 'agusan-del-norte', 'Butuan', 'butuan', 'city', extensions.st_setsrid(extensions.st_makepoint(125.5406, 8.9475), 4326)::extensions.geography, 'Butuan, Agusan del Norte'),
  ('Lanao del Norte', 'lanao-del-norte', 'Iligan', 'iligan', 'city', extensions.st_setsrid(extensions.st_makepoint(124.2452, 8.2280), 4326)::extensions.geography, 'Iligan, Lanao del Norte'),
  ('Maguindanao del Norte', 'maguindanao-del-norte', 'Cotabato City', 'cotabato-city', 'city', extensions.st_setsrid(extensions.st_makepoint(124.2310, 7.2047), 4326)::extensions.geography, 'Cotabato City, Maguindanao del Norte'),
  ('Bohol', 'bohol', 'Tagbilaran', 'tagbilaran', 'city', extensions.st_setsrid(extensions.st_makepoint(123.8556, 9.6475), 4326)::extensions.geography, 'Tagbilaran, Bohol'),
  ('Capiz', 'capiz', 'Roxas City', 'roxas-city', 'city', extensions.st_setsrid(extensions.st_makepoint(122.7511, 11.5853), 4326)::extensions.geography, 'Roxas City, Capiz'),
  ('Leyte', 'leyte', 'Ormoc', 'ormoc', 'city', extensions.st_setsrid(extensions.st_makepoint(124.6075, 11.0064), 4326)::extensions.geography, 'Ormoc, Leyte'),
  ('Zamboanga del Norte', 'zamboanga-del-norte', 'Dipolog', 'dipolog', 'city', extensions.st_setsrid(extensions.st_makepoint(123.3413, 8.5880), 4326)::extensions.geography, 'Dipolog, Zamboanga del Norte'),
  ('South Cotabato', 'south-cotabato', 'Koronadal', 'koronadal', 'city', extensions.st_setsrid(extensions.st_makepoint(124.8469, 6.5031), 4326)::extensions.geography, 'Koronadal, South Cotabato'),
  ('Bulacan', 'bulacan', 'Malolos', 'malolos', 'city', extensions.st_setsrid(extensions.st_makepoint(120.8114, 14.8433), 4326)::extensions.geography, 'Malolos, Bulacan'),
  ('Bulacan', 'bulacan', 'Meycauayan', 'meycauayan', 'city', extensions.st_setsrid(extensions.st_makepoint(120.9608, 14.7369), 4326)::extensions.geography, 'Meycauayan, Bulacan'),
  ('Cavite', 'cavite', 'Imus', 'imus', 'city', extensions.st_setsrid(extensions.st_makepoint(120.9367, 14.4297), 4326)::extensions.geography, 'Imus, Cavite'),
  ('Cavite', 'cavite', 'Dasmariñas', 'dasmarinas', 'city', extensions.st_setsrid(extensions.st_makepoint(120.9367, 14.3294), 4326)::extensions.geography, 'Dasmariñas, Cavite'),
  -- Antipolo, Rizal is already seeded by 20260802000016_reference_data.sql — skipped here.
  ('Rizal', 'rizal', 'Cainta', 'cainta', 'city', extensions.st_setsrid(extensions.st_makepoint(121.1222, 14.5786), 4326)::extensions.geography, 'Cainta, Rizal')
on conflict (province_slug, city_slug) do nothing;

-- New provinces introduced above need their own province-level row, matching
-- the pattern in 20260802000016_reference_data.sql (Metro Manila, Rizal,
-- Cebu, Davao del Sur, Cavite already exist and are not repeated here).
insert into public.ph_locations (province, province_slug, city, city_slug, kind, centroid, search_name) values
  ('Negros Oriental', 'negros-oriental', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(123.3, 9.3), 4326)::extensions.geography, 'Negros Oriental'),
  ('Batangas', 'batangas', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(121.1, 13.8), 4326)::extensions.geography, 'Batangas'),
  ('Negros Occidental', 'negros-occidental', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(123.0, 10.7), 4326)::extensions.geography, 'Negros Occidental'),
  ('Iloilo', 'iloilo', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(122.6, 10.7), 4326)::extensions.geography, 'Iloilo'),
  ('Misamis Oriental', 'misamis-oriental', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(124.6, 8.5), 4326)::extensions.geography, 'Misamis Oriental'),
  ('Zamboanga del Sur', 'zamboanga-del-sur', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(122.1, 6.9), 4326)::extensions.geography, 'Zamboanga del Sur'),
  ('South Cotabato', 'south-cotabato', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(125.0, 6.3), 4326)::extensions.geography, 'South Cotabato'),
  ('Benguet', 'benguet', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(120.6, 16.4), 4326)::extensions.geography, 'Benguet'),
  ('Camarines Sur', 'camarines-sur', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(123.2, 13.6), 4326)::extensions.geography, 'Camarines Sur'),
  ('Albay', 'albay', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(123.7, 13.1), 4326)::extensions.geography, 'Albay'),
  ('Leyte', 'leyte', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(125.0, 11.2), 4326)::extensions.geography, 'Leyte'),
  ('Palawan', 'palawan', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(118.7, 9.7), 4326)::extensions.geography, 'Palawan'),
  ('Pangasinan', 'pangasinan', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(120.3, 16.0), 4326)::extensions.geography, 'Pangasinan'),
  ('Tarlac', 'tarlac', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(120.6, 15.5), 4326)::extensions.geography, 'Tarlac'),
  ('Zambales', 'zambales', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(120.3, 14.8), 4326)::extensions.geography, 'Zambales'),
  ('Quezon', 'quezon', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(121.6, 13.9), 4326)::extensions.geography, 'Quezon'),
  ('Laguna', 'laguna', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(121.2, 14.2), 4326)::extensions.geography, 'Laguna'),
  ('Pampanga', 'pampanga', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(120.7, 15.0), 4326)::extensions.geography, 'Pampanga'),
  ('Nueva Ecija', 'nueva-ecija', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(121.0, 15.5), 4326)::extensions.geography, 'Nueva Ecija'),
  ('Cagayan', 'cagayan', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(121.7, 17.6), 4326)::extensions.geography, 'Cagayan'),
  ('Agusan del Norte', 'agusan-del-norte', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(125.5, 8.9), 4326)::extensions.geography, 'Agusan del Norte'),
  ('Lanao del Norte', 'lanao-del-norte', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(124.2, 8.2), 4326)::extensions.geography, 'Lanao del Norte'),
  ('Maguindanao del Norte', 'maguindanao-del-norte', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(124.2, 7.2), 4326)::extensions.geography, 'Maguindanao del Norte'),
  ('Bohol', 'bohol', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(123.9, 9.6), 4326)::extensions.geography, 'Bohol'),
  ('Capiz', 'capiz', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(122.8, 11.6), 4326)::extensions.geography, 'Capiz'),
  ('Zamboanga del Norte', 'zamboanga-del-norte', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(123.3, 8.6), 4326)::extensions.geography, 'Zamboanga del Norte'),
  ('Bulacan', 'bulacan', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(120.8, 14.8), 4326)::extensions.geography, 'Bulacan')
on conflict (province_slug, city_slug) do nothing;
