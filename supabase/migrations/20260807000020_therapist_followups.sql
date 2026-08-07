-- ThriveMap: therapist-profiles review follow-ups.
--
-- 1. Scope the search refresh trigger to the columns that feed the search
--    document. Photo changes and reorders previously rebuilt the tsvector
--    for no reason.
-- 2. Tie photo_path to the clinic's own therapists/ storage prefix at the
--    database layer (the action layer already enforces this; the bucket is
--    public, so this is hardening against drift, not a security fix).

drop trigger clinic_therapists_search_refresh on public.clinic_therapists;
create trigger clinic_therapists_search_refresh
  after insert or delete or update of full_name, profession, specialties
  on public.clinic_therapists
  for each row execute function public.trg_refresh_clinic_search();

alter table public.clinic_therapists
  add constraint clinic_therapists_photo_path_prefix check (
    photo_path is null
    or photo_path like clinic_id::text || '/therapists/%'
  );
