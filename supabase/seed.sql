-- ThriveMap seed data — ALL CLINICS ARE FICTIONAL demo records for local
-- development. Names, addresses, and contact details are invented and must
-- not be mistaken for real providers (every row sets is_demo = true and
-- websites/emails use the reserved example.com / .test domains).

-- ---------------------------------------------------------------------------
-- Demo users (local only; password for all: "password123")
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at, aud, role,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'admin@thrivemap.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Admin"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'moderator@thrivemap.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Moderator"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'caregiver@thrivemap.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Caregiver"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'clinicrep@thrivemap.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Clinic Rep"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email like '%@thrivemap.test'
on conflict do nothing;

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-000000000001', 'administrator'),
  ('00000000-0000-0000-0000-000000000002', 'moderator'),
  ('00000000-0000-0000-0000-000000000004', 'clinic_representative')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Service taxonomy
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- PH location reference (subset for dev geocoding + landing pages)
-- ---------------------------------------------------------------------------
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
  ('Cavite', 'cavite', null, null, 'province', extensions.st_setsrid(extensions.st_makepoint(120.9, 14.3), 4326)::extensions.geography, 'Cavite');

-- ---------------------------------------------------------------------------
-- Fictional clinics
-- ---------------------------------------------------------------------------
do $seed$
declare
  spec record;
  v_clinic_id uuid;
  v_service_count int;
  v_i int;
begin
  for spec in
    select * from (values
      -- name, slug, city, city_slug, province, province_slug, lat, lng, status, online, accessible, featured
      ('Little Steps Developmental Center (Fictional)', 'little-steps-developmental-center', 'Quezon City', 'quezon-city', 'Metro Manila', 'metro-manila', 14.6721, 121.0399, 'published_verified', true, true, true),
      ('Bright Path Therapy Hub (Fictional)', 'bright-path-therapy-hub', 'Quezon City', 'quezon-city', 'Metro Manila', 'metro-manila', 14.6512, 121.0491, 'published_verified', false, true, true),
      ('Sunrise Kids Therapy Center (Fictional)', 'sunrise-kids-therapy-center', 'Quezon City', 'quezon-city', 'Metro Manila', 'metro-manila', 14.6935, 121.0362, 'published_unverified', false, false, false),
      ('Hearts & Hands Pediatric Therapy (Fictional)', 'hearts-and-hands-pediatric-therapy', 'Quezon City', 'quezon-city', 'Metro Manila', 'metro-manila', 14.6288, 121.0561, 'published_unverified', true, null, false),
      ('Kaleidoscope Child Development Clinic (Fictional)', 'kaleidoscope-child-development-clinic', 'Makati', 'makati', 'Metro Manila', 'metro-manila', 14.5566, 121.0212, 'published_verified', true, true, true),
      ('Stepping Stones Therapy Suites (Fictional)', 'stepping-stones-therapy-suites', 'Makati', 'makati', 'Metro Manila', 'metro-manila', 14.5493, 121.0281, 'published_unverified', false, true, false),
      ('Bloom Developmental Services (Fictional)', 'bloom-developmental-services', 'Makati', 'makati', 'Metro Manila', 'metro-manila', 14.5619, 121.0334, 'published_verified', true, false, false),
      ('Manila Bay Child Development Center (Fictional)', 'manila-bay-child-development-center', 'Manila', 'manila', 'Metro Manila', 'metro-manila', 14.5832, 120.9793, 'published_verified', false, true, false),
      ('Luntian Therapy Collective (Fictional)', 'luntian-therapy-collective', 'Manila', 'manila', 'Metro Manila', 'metro-manila', 14.6091, 120.9927, 'published_unverified', true, null, false),
      ('Harbor View Pediatric Services (Fictional)', 'harbor-view-pediatric-services', 'Manila', 'manila', 'Metro Manila', 'metro-manila', 14.5904, 120.9761, 'temporarily_closed', false, false, false),
      ('Rainbow Bridge Therapy Center (Fictional)', 'rainbow-bridge-therapy-center', 'Pasig', 'pasig', 'Metro Manila', 'metro-manila', 14.5738, 121.0812, 'published_verified', true, true, true),
      ('Ortigas Child Development Institute (Fictional)', 'ortigas-child-development-institute', 'Pasig', 'pasig', 'Metro Manila', 'metro-manila', 14.5866, 121.0631, 'published_unverified', false, true, false),
      ('BGC Kids Thrive Center (Fictional)', 'bgc-kids-thrive-center', 'Taguig', 'taguig', 'Metro Manila', 'metro-manila', 14.5509, 121.0503, 'published_verified', true, true, true),
      ('Fort Bonifacio Therapy Group (Fictional)', 'fort-bonifacio-therapy-group', 'Taguig', 'taguig', 'Metro Manila', 'metro-manila', 14.5271, 121.0498, 'published_unverified', false, null, false),
      ('Riverbanks Developmental Clinic (Fictional)', 'riverbanks-developmental-clinic', 'Marikina', 'marikina', 'Metro Manila', 'metro-manila', 14.6483, 121.1002, 'published_verified', false, true, false),
      ('Shoe City Kids Therapy (Fictional)', 'shoe-city-kids-therapy', 'Marikina', 'marikina', 'Metro Manila', 'metro-manila', 14.6552, 121.1087, 'published_unverified', true, false, false),
      ('Hillside Growth Center (Fictional)', 'hillside-growth-center', 'Antipolo', 'antipolo', 'Rizal', 'rizal', 14.5871, 121.1744, 'published_verified', false, true, false),
      ('Pinatubo Street Therapy House (Fictional)', 'pinatubo-street-therapy-house', 'Antipolo', 'antipolo', 'Rizal', 'rizal', 14.6009, 121.1808, 'published_unverified', false, null, false),
      ('Cebu Children First Center (Fictional)', 'cebu-children-first-center', 'Cebu City', 'cebu-city', 'Cebu', 'cebu', 10.3181, 123.8912, 'published_verified', true, true, true),
      ('Mango Avenue Therapy Clinic (Fictional)', 'mango-avenue-therapy-clinic', 'Cebu City', 'cebu-city', 'Cebu', 'cebu', 10.3099, 123.8931, 'published_unverified', false, false, false),
      ('Queen City Kids Development Hub (Fictional)', 'queen-city-kids-development-hub', 'Cebu City', 'cebu-city', 'Cebu', 'cebu', 10.3243, 123.9022, 'published_unverified', true, true, false),
      ('Davao Gulf Child Development Center (Fictional)', 'davao-gulf-child-development-center', 'Davao City', 'davao-city', 'Davao del Sur', 'davao-del-sur', 7.1934, 125.4611, 'published_verified', false, true, false),
      ('Durian Grove Therapy Center (Fictional)', 'durian-grove-therapy-center', 'Davao City', 'davao-city', 'Davao del Sur', 'davao-del-sur', 7.1821, 125.4498, 'published_unverified', true, null, false),
      ('Samal View Pediatric Therapy (Fictional)', 'samal-view-pediatric-therapy', 'Davao City', 'davao-city', 'Davao del Sur', 'davao-del-sur', 7.2011, 125.4703, 'published_unverified', false, false, false),
      ('Bacoor Bayside Development Clinic (Fictional)', 'bacoor-bayside-development-clinic', 'Bacoor', 'bacoor', 'Cavite', 'cavite', 14.4612, 120.9401, 'published_verified', true, true, false),
      ('Molino Kids Growth Center (Fictional)', 'molino-kids-growth-center', 'Bacoor', 'bacoor', 'Cavite', 'cavite', 14.4238, 120.9772, 'published_unverified', false, true, false),
      ('Aguinaldo Highway Therapy Hub (Fictional)', 'aguinaldo-highway-therapy-hub', 'Bacoor', 'bacoor', 'Cavite', 'cavite', 14.4523, 120.9455, 'pending_review', false, null, false),
      ('North Star Development Services (Fictional)', 'north-star-development-services', 'Quezon City', 'quezon-city', 'Metro Manila', 'metro-manila', 14.7002, 121.0533, 'published_unverified', true, true, false),
      ('Makati Central Kids Clinic (Fictional)', 'makati-central-kids-clinic', 'Makati', 'makati', 'Metro Manila', 'metro-manila', 14.5588, 121.0166, 'suspended', false, false, false),
      ('Pasig Green Meadows Therapy (Fictional)', 'pasig-green-meadows-therapy', 'Pasig', 'pasig', 'Metro Manila', 'metro-manila', 14.5691, 121.0922, 'published_unverified', true, false, false)
    ) as t(name, slug, city, city_slug, province, province_slug, lat, lng, status, online, accessible, featured)
  loop
    insert into public.clinics (
      slug, name, description, status, source_type, phone, email, website,
      offers_online_services, offers_in_person_services, wheelchair_accessible,
      is_featured, is_demo, last_verified_at, accessibility_notes
    ) values (
      spec.slug,
      spec.name,
      'FICTIONAL DEMO LISTING. ' || split_part(spec.name, ' (', 1) ||
        ' is an invented clinic used for ThriveMap development. It offers family-centered, ' ||
        'neurodiversity-affirming developmental services for children and young people in ' || spec.city || '.',
      spec.status::public.listing_status,
      'manual',
      '+63 2 8' || lpad((100 + (abs(hashtext(spec.slug)) % 899))::text, 3, '0') || ' ' || lpad((abs(hashtext(spec.slug || 'p')) % 9999)::text, 4, '0'),
      'hello@' || replace(spec.slug, '-', '') || '.example.com',
      'https://' || replace(spec.slug, '-', '') || '.example.com',
      spec.online,
      true,
      spec.accessible,
      spec.featured,
      true,
      case when spec.status = 'published_verified' then now() - (abs(hashtext(spec.slug)) % 90) * interval '1 day' end,
      case when spec.accessible then 'Ground-floor access, accessible restroom, and step-free entrance.' end
    )
    returning id into v_clinic_id;

    insert into public.clinic_locations (
      clinic_id, is_primary, address_line1, barangay, city, city_slug,
      province, province_slug, postal_code, location
    ) values (
      v_clinic_id,
      true,
      (100 + abs(hashtext(spec.slug)) % 899)::text || ' Demo Building, Sample Street',
      'Barangay ' || (1 + abs(hashtext(spec.slug || 'b')) % 100)::text,
      spec.city,
      spec.city_slug,
      spec.province,
      spec.province_slug,
      lpad((1000 + abs(hashtext(spec.slug || 'z')) % 8999)::text, 4, '0'),
      extensions.st_setsrid(extensions.st_makepoint(spec.lng, spec.lat), 4326)::extensions.geography
    );

    -- 2-5 services, deterministic per clinic
    v_service_count := 2 + abs(hashtext(spec.slug || 's')) % 4;
    insert into public.clinic_services (clinic_id, service_id, delivery)
    select v_clinic_id, s.id,
      case when spec.online then array['in_person','online']::public.service_delivery[]
           else array['in_person']::public.service_delivery[] end
    from (
      select id, row_number() over (order by md5(slug || spec.slug)) as rn
      from public.services
    ) s
    where s.rn <= v_service_count;

    -- age groups: 2-4, deterministic per clinic
    insert into public.clinic_age_groups (clinic_id, age_group)
    select v_clinic_id, t.ag
    from (
      select ag, row_number() over (order by md5(ag::text || spec.slug)) as rn
      from unnest(enum_range(null::public.age_group)) as ag
    ) t
    where t.rn <= 2 + abs(hashtext(spec.slug || 'a')) % 3
    on conflict do nothing;

    -- weekday hours; some clinics also Saturday
    for v_i in 1..5 loop
      insert into public.clinic_hours (clinic_id, day_of_week, opens_at, closes_at, is_closed)
      values (v_clinic_id, v_i, time '08:00' + (abs(hashtext(spec.slug)) % 3) * interval '30 minutes', time '17:00' + (abs(hashtext(spec.slug)) % 3) * interval '30 minutes', false);
    end loop;
    if abs(hashtext(spec.slug || 'sat')) % 2 = 0 then
      insert into public.clinic_hours (clinic_id, day_of_week, opens_at, closes_at, is_closed)
      values (v_clinic_id, 6, time '09:00', time '13:00', false);
    end if;

    insert into public.clinic_languages (clinic_id, language)
    values (v_clinic_id, 'English'), (v_clinic_id, 'Filipino');

    insert into public.clinic_social_links (clinic_id, platform, url)
    values (v_clinic_id, 'facebook', 'https://facebook.example.com/' || spec.slug);

    if spec.status = 'published_verified' then
      insert into public.clinic_verification_records (clinic_id, method, notes, verified_by)
      values (v_clinic_id, 'manual_review', 'Seed data: verified fictional demo listing.', '00000000-0000-0000-0000-000000000001');
    end if;
  end loop;
end;
$seed$;

-- Demo clinic rep manages the first featured clinic
insert into public.clinic_managers (clinic_id, user_id, granted_by)
select c.id, '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'
from public.clinics c where c.slug = 'little-steps-developmental-center'
on conflict do nothing;

-- A favorite, a report, and a submission for the demo caregiver
insert into public.favorites (user_id, clinic_id)
select '00000000-0000-0000-0000-000000000003', id from public.clinics
where slug in ('little-steps-developmental-center', 'rainbow-bridge-therapy-center')
on conflict do nothing;

insert into public.clinic_reports (clinic_id, reported_by, report_type, details)
select id, '00000000-0000-0000-0000-000000000003', 'incorrect_hours', 'Seed data: demo report — Saturday hours look outdated.'
from public.clinics where slug = 'sunrise-kids-therapy-center';

insert into public.clinic_submissions (submitted_by, submitter_email, clinic_name, address, latitude, longitude, service_slugs, notes, consent_given)
values (
  '00000000-0000-0000-0000-000000000003',
  'caregiver@thrivemap.test',
  'Harbor Lights Therapy Rooms (Fictional)',
  '88 Demo Lane, Barangay 12, Manila, Metro Manila',
  14.5921, 120.9815,
  array['speech-therapy','occupational-therapy'],
  'Seed data: demo suggestion of a fictional clinic.',
  true
);

-- Refresh search documents for all seeded clinics
select public.refresh_clinic_search_document(id) from public.clinics;
