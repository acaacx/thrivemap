-- ThriveMap Stage 4: stale-listing flag, search refresh helper, periodic jobs

-- Stale-listing detection flag, set by the stale_listing_scan job and shown
-- on the admin dashboard. Any update to the clinic row clears it.
alter table public.clinics add column if not exists flagged_stale_at timestamptz;

create or replace function public.trg_clear_stale_flag()
returns trigger
language plpgsql
as $$
begin
  -- Only clear when something other than the flag itself changed.
  if new.flagged_stale_at is not distinct from old.flagged_stale_at then
    new.flagged_stale_at := null;
  end if;
  return new;
end;
$$;

create trigger clinics_clear_stale_flag
  before update on public.clinics
  for each row execute function public.trg_clear_stale_flag();

-- Safety-net rebuild of every published clinic's search document (triggers
-- keep them fresh online; this catches drift). Returns rows refreshed.
create or replace function public.refresh_all_clinic_search_documents()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_clinic record;
begin
  for v_clinic in
    select id from public.clinics where deleted_at is null
  loop
    perform public.refresh_clinic_search_document(v_clinic.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.refresh_all_clinic_search_documents() from public, anon, authenticated;

-- Periodic job enqueues. pg_cron only inserts queue rows; the processor route
-- executes them (locally via manual tick or the admin console, in production
-- via a platform cron hitting /api/internal/jobs/process).
select cron.schedule(
  'thrivemap-verification-reminder-scan',
  '0 1 * * *',
  $$insert into public.jobs (job_type, idempotency_key)
    values ('verification_reminder_scan', 'verification-reminder-scan-' || to_char(now(), 'YYYY-MM-DD'))
    on conflict (idempotency_key) do nothing$$
);

select cron.schedule(
  'thrivemap-stale-listing-scan',
  '0 2 * * 1',
  $$insert into public.jobs (job_type, idempotency_key)
    values ('stale_listing_scan', 'stale-listing-scan-' || to_char(now(), 'IYYY-IW'))
    on conflict (idempotency_key) do nothing$$
);

select cron.schedule(
  'thrivemap-search-document-refresh',
  '30 2 * * *',
  $$insert into public.jobs (job_type, idempotency_key)
    values ('search_document_refresh', 'search-refresh-' || to_char(now(), 'YYYY-MM-DD'))
    on conflict (idempotency_key) do nothing$$
);
