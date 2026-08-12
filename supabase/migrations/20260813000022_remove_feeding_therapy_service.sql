-- ThriveMap: retire the "Feeding Therapy" service from the taxonomy.
--
-- Hard delete. clinic_services.service_id cascades
-- (20260801000003_clinics.sql), so every clinic association for this service
-- disappears with the row — accepted, and NOT recoverable by re-inserting the
-- service later. Nothing in the app references the slug: the footer links only
-- speech-therapy/occupational-therapy, IMPORT_SERVICE_TERMS
-- (src/modules/imports/query.ts) never listed it, and every surface loads the
-- taxonomy dynamically through getServices()/getServiceBySlug().
--
-- 20260802000016_reference_data.sql is left untouched on purpose: applied
-- migrations are immutable, and a fresh `supabase db reset` replays 16 (seeds
-- the row) then this migration (removes it), converging on the same
-- 7-service taxonomy as a migrated environment.

set search_path to public;

-- Recorded in the CI migrate job's log so the blast radius is auditable
-- after the fact (the rows themselves are gone by the next statement).
do $$
declare
  affected int;
begin
  select count(*) into affected
  from public.clinic_services cs
  join public.services s on s.id = cs.service_id
  where s.slug = 'feeding-therapy';
  raise notice 'feeding-therapy: dropping % clinic association(s)', affected;
end $$;

delete from public.services where slug = 'feeding-therapy';

-- Brand guardrail (see the "Warm Horizon" note in src/app/globals.css: "no
-- puzzle-piece motifs"). The homepage now renders services.icon as a real
-- icon, and 'puzzle' would put the autism puzzle piece on a card.
update public.services
set icon = 'blocks'
where slug = 'behavioral-therapy' and icon = 'puzzle';
