-- ThriveMap: storage buckets and job-queue cron tick

-- Public bucket for clinic imagery (logos, covers, gallery).
insert into storage.buckets (id, name, public)
values ('clinic-images', 'clinic-images', true)
on conflict (id) do nothing;

-- Private bucket for claim verification documents. Never public; access via
-- short-lived signed URLs generated server-side for authorized staff only.
insert into storage.buckets (id, name, public)
values ('claim-documents', 'claim-documents', false)
on conflict (id) do nothing;

-- Storage RLS: clinic images readable by all, writable by clinic managers/admins
-- (path convention: clinic-images/<clinic_id>/...).
create policy "clinic images public read"
  on storage.objects for select
  using (bucket_id = 'clinic-images');

create policy "clinic images manager write"
  on storage.objects for insert
  with check (
    bucket_id = 'clinic-images'
    and (
      public.is_moderator_or_admin()
      or public.manages_clinic(((storage.foldername(name))[1])::uuid)
    )
  );

create policy "clinic images manager delete"
  on storage.objects for delete
  using (
    bucket_id = 'clinic-images'
    and (
      public.is_moderator_or_admin()
      or public.manages_clinic(((storage.foldername(name))[1])::uuid)
    )
  );

-- Claim documents: uploader may insert into their own claim folder
-- (claim-documents/<user_id>/<claim_id>/...); reads only via signed URLs
-- issued by the server (service role), never direct.
create policy "claim documents own upload"
  on storage.objects for insert
  with check (
    bucket_id = 'claim-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Claim a batch of due jobs. Called by the processor route with service role.
create or replace function public.claim_due_jobs(p_worker text, p_batch int default 10)
returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  update public.jobs j
  set status = 'running',
      locked_at = now(),
      locked_by = p_worker,
      attempts = j.attempts + 1
  where j.id in (
    select id from public.jobs
    where status = 'pending' and run_at <= now()
    order by run_at
    limit least(p_batch, 50)
    for update skip locked
  )
  returning j.*;
$$;

-- Requeue jobs whose worker died (locked > 10 minutes without completion).
create or replace function public.requeue_stuck_jobs()
returns int
language sql
security definer
set search_path = public
as $$
  with reset as (
    update public.jobs
    set status = case when attempts >= max_attempts then 'dead'::public.job_status else 'pending'::public.job_status end,
        locked_at = null,
        locked_by = null,
        last_error = coalesce(last_error, 'worker timeout')
    where status = 'running' and locked_at < now() - interval '10 minutes'
    returning 1
  )
  select count(*)::int from reset;
$$;

select cron.schedule('thrivemap-requeue-stuck-jobs', '*/5 * * * *', $$select public.requeue_stuck_jobs()$$);
