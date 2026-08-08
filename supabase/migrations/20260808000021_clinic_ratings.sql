-- ThriveMap: clinic ratings (Phase 2 feature 4).
-- Structured ratings only — no free text. See
-- docs/superpowers/specs/2026-08-08-clinic-ratings-design.md.

create table public.clinic_ratings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  communication smallint not null check (communication between 1 and 5),
  sensory_friendliness smallint not null check (sensory_friendliness between 1 and 5),
  affirming_approach smallint not null check (affirming_approach between 1 and 5),
  scheduling smallint not null check (scheduling between 1 and 5),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);

create index clinic_ratings_clinic_idx on public.clinic_ratings (clinic_id);

create trigger clinic_ratings_updated_at
  before update on public.clinic_ratings
  for each row execute function public.set_updated_at();

-- Every write (including admin voids) is audited.
create trigger clinic_ratings_audit
  after insert or update or delete on public.clinic_ratings
  for each row execute function public.write_audit_log();

-- Aggregates: the only publicly readable surface. Voided rows excluded.
create table public.clinic_rating_stats (
  clinic_id uuid primary key references public.clinics (id) on delete cascade,
  rating_count integer not null,
  avg_communication numeric(3,2) not null,
  avg_sensory_friendliness numeric(3,2) not null,
  avg_affirming_approach numeric(3,2) not null,
  avg_scheduling numeric(3,2) not null,
  updated_at timestamptz not null default now()
);

create or replace function public.refresh_clinic_rating_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := coalesce(new.clinic_id, old.clinic_id);

  delete from public.clinic_rating_stats where clinic_id = target;

  insert into public.clinic_rating_stats (
    clinic_id, rating_count,
    avg_communication, avg_sensory_friendliness,
    avg_affirming_approach, avg_scheduling, updated_at
  )
  select
    target, count(*),
    round(avg(communication), 2), round(avg(sensory_friendliness), 2),
    round(avg(affirming_approach), 2), round(avg(scheduling), 2), now()
  from public.clinic_ratings
  where clinic_id = target and voided_at is null
  having count(*) > 0;

  return null;
end;
$$;

create trigger clinic_ratings_stats_refresh
  after insert or update or delete on public.clinic_ratings
  for each row execute function public.refresh_clinic_rating_stats();

-- RLS ------------------------------------------------------------------

alter table public.clinic_ratings enable row level security;
alter table public.clinic_rating_stats enable row level security;

-- Authors manage their own rating on readable clinics, unless they manage
-- the clinic. public.manages_clinic() is the existing active-management
-- check (clinic_managers.revoked_at is null) — it runs as the caller and
-- callers can always see their own manager rows, so it's exactly the
-- self-check we need.
create policy clinic_ratings_insert_own on public.clinic_ratings
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.clinic_readable_or_managed(clinic_id)
    and not public.manages_clinic(clinic_id)
  );

create policy clinic_ratings_update_own on public.clinic_ratings
  for update to authenticated
  using (user_id = (select auth.uid()) and voided_at is null)
  with check (user_id = (select auth.uid()) and voided_at is null);

create policy clinic_ratings_delete_own on public.clinic_ratings
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Authors read their own rating; admins read all (admin panel).
create policy clinic_ratings_select_own_or_admin on public.clinic_ratings
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
  );

-- Stats are public; writes happen only inside the security-definer trigger.
create policy clinic_rating_stats_select_all on public.clinic_rating_stats
  for select to anon, authenticated
  using (true);

-- Grants ---------------------------------------------------------------

grant select, insert, update, delete on public.clinic_ratings to authenticated;
grant select on public.clinic_rating_stats to anon, authenticated;
grant all on public.clinic_ratings, public.clinic_rating_stats to service_role;
