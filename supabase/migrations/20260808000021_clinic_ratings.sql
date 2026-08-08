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

-- Recomputes stats for one clinic. `insert ... on conflict do update` keeps
-- concurrent writers on the same clinic from racing a delete-then-insert
-- against each other (which could 23505 on clinic_rating_stats_pkey and
-- abort a user's rating write) — the upsert just waits for the row lock and
-- applies the newer aggregate. The row is deleted only once no live rating
-- remains, not unconditionally on every write.
create or replace function public.refresh_clinic_rating_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  targets uuid[];
  live_count integer;
begin
  -- An UPDATE that retargets clinic_id moves a rating from one clinic's
  -- aggregate to another's; both need recomputing or the old clinic's
  -- stats go stale forever (it never fires its own insert/delete event).
  if TG_OP = 'UPDATE' and old.clinic_id is distinct from new.clinic_id then
    targets := array[old.clinic_id, new.clinic_id];
  else
    targets := array[coalesce(new.clinic_id, old.clinic_id)];
  end if;

  foreach target in array targets loop
    select count(*) into live_count
    from public.clinic_ratings
    where clinic_id = target and voided_at is null;

    if live_count = 0 then
      delete from public.clinic_rating_stats where clinic_id = target;
    else
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
      group by clinic_id
      on conflict (clinic_id) do update set
        rating_count = excluded.rating_count,
        avg_communication = excluded.avg_communication,
        avg_sensory_friendliness = excluded.avg_sensory_friendliness,
        avg_affirming_approach = excluded.avg_affirming_approach,
        avg_scheduling = excluded.avg_scheduling,
        updated_at = excluded.updated_at;
    end if;
  end loop;

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
-- check (clinic_managers.revoked_at is null). It runs SECURITY DEFINER
-- (bypassing clinic_managers' own RLS to read it at all), but it filters
-- internally on auth.uid(), so it only ever reports the caller's own grants
-- — exactly the self-check we need, regardless of how it's invoked.
create policy clinic_ratings_insert_own on public.clinic_ratings
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.clinic_readable_or_managed(clinic_id)
    and not public.manages_clinic(clinic_id)
  );

-- with check repeats the insert policy's clinic checks so an author can't
-- retarget an existing row's clinic_id onto a clinic they manage (or one
-- that never passed the readability check) via UPDATE.
create policy clinic_ratings_update_own on public.clinic_ratings
  for update to authenticated
  using (user_id = (select auth.uid()) and voided_at is null)
  with check (
    user_id = (select auth.uid())
    and voided_at is null
    and public.clinic_readable_or_managed(clinic_id)
    and not public.manages_clinic(clinic_id)
  );

-- voided_at guard: without it, a voided author could delete their own
-- frozen row (the update policy blocks edits but not deletes) and re-insert
-- a fresh live rating, since the unique (clinic_id, user_id) constraint
-- that would otherwise stop them is gone once the old row is gone.
create policy clinic_ratings_delete_own on public.clinic_ratings
  for delete to authenticated
  using (user_id = (select auth.uid()) and voided_at is null);

-- Authors read their own rating; moderators/admins read all (admin panel
-- reads through this policy now — see AdminRatingsPanel). Matches every
-- sibling policy's staff arm (public.is_moderator_or_admin()) rather than
-- is_admin(), since void/unvoid and the panel are gated on requireModerator().
create policy clinic_ratings_select_own_or_admin on public.clinic_ratings
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_moderator_or_admin()
  );

-- Stats are visible wherever the underlying clinic is: ratings can exist on
-- non-public clinics (moderators/admins can rate drafts, which pass
-- clinic_readable_or_managed), so `using (true)` here would leak the
-- clinic_id + aggregates of hidden clinics. This subquery runs as the
-- caller, so it inherits exactly what the clinics select policies already
-- allow them to see. Writes happen only inside the security-definer trigger.
create policy clinic_rating_stats_select_all on public.clinic_rating_stats
  for select to anon, authenticated
  using (exists (select 1 from public.clinics c where c.id = clinic_rating_stats.clinic_id));

-- Grants ---------------------------------------------------------------

grant select, insert, update, delete on public.clinic_ratings to authenticated;
grant select on public.clinic_rating_stats to anon, authenticated;
grant all on public.clinic_ratings, public.clinic_rating_stats to service_role;
