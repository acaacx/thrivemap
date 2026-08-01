-- ThriveMap: clinic lifecycle enforcement + duplicate merge.

-- Where a clinic went when it was merged away (future redirect support).
alter table public.clinics
  add column merged_into_clinic_id uuid references public.clinics (id) on delete set null;

-- Allowed listing_status transitions. Mirrors src/modules/clinics/lifecycle.ts
-- (LISTING_TRANSITIONS) — keep both in sync when editing.
create or replace function public.is_valid_listing_transition(
  p_from public.listing_status,
  p_to public.listing_status
)
returns boolean
language sql
immutable
as $$
  select p_from = p_to or (p_from, p_to) in (
    ('draft', 'pending_review'), ('draft', 'archived'),
    ('candidate', 'pending_review'), ('candidate', 'rejected'), ('candidate', 'archived'),
    ('pending_review', 'published_unverified'), ('pending_review', 'rejected'), ('pending_review', 'draft'),
    ('pending_review', 'archived'),
    ('published_unverified', 'published_verified'), ('published_unverified', 'temporarily_closed'),
    ('published_unverified', 'permanently_closed'), ('published_unverified', 'suspended'),
    ('published_unverified', 'archived'),
    ('published_verified', 'published_unverified'), ('published_verified', 'temporarily_closed'),
    ('published_verified', 'permanently_closed'), ('published_verified', 'suspended'),
    ('published_verified', 'archived'),
    ('temporarily_closed', 'published_unverified'), ('temporarily_closed', 'published_verified'),
    ('temporarily_closed', 'permanently_closed'), ('temporarily_closed', 'suspended'),
    ('temporarily_closed', 'archived'),
    ('permanently_closed', 'published_unverified'), ('permanently_closed', 'archived'),
    ('suspended', 'published_unverified'), ('suspended', 'published_verified'), ('suspended', 'archived'),
    ('rejected', 'pending_review'), ('rejected', 'archived'),
    ('archived', 'draft')
  );
$$;

create or replace function public.enforce_clinic_status_transition()
returns trigger
language plpgsql
as $$
begin
  if not public.is_valid_listing_transition(old.status, new.status) then
    raise exception 'invalid clinic status transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger clinics_status_transition
  before update of status on public.clinics
  for each row
  when (old.status is distinct from new.status)
  execute function public.enforce_clinic_status_transition();

-- Manual duplicate merge. Moves user/relational data from p_merge_id onto
-- p_keep_id, archives the merged clinic, and resolves the matching
-- duplicate_match_candidates row. Caller identity comes from auth.uid();
-- moderators/admins only. Fully audited via the clinics audit trigger plus an
-- admin_actions row written here.
create or replace function public.merge_clinics(
  p_keep_id uuid,
  p_merge_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator_or_admin() then
    raise exception 'merge_clinics: moderator or administrator role required'
      using errcode = 'insufficient_privilege';
  end if;
  if p_keep_id = p_merge_id then
    raise exception 'merge_clinics: cannot merge a clinic into itself';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'merge_clinics: a reason is required';
  end if;

  -- Relocate user data; ignore rows that would duplicate existing ones.
  insert into public.favorites (user_id, clinic_id, created_at)
    select user_id, p_keep_id, created_at from public.favorites
    where clinic_id = p_merge_id
  on conflict do nothing;
  delete from public.favorites where clinic_id = p_merge_id;

  update public.clinic_reports set clinic_id = p_keep_id where clinic_id = p_merge_id;
  update public.clinic_claims set clinic_id = p_keep_id where clinic_id = p_merge_id;
  update public.clinic_change_requests set clinic_id = p_keep_id where clinic_id = p_merge_id;
  update public.clinic_source_records set clinic_id = p_keep_id where clinic_id = p_merge_id;
  update public.clinic_verification_records set clinic_id = p_keep_id where clinic_id = p_merge_id;
  update public.clinic_verification_events set clinic_id = p_keep_id where clinic_id = p_merge_id;

  insert into public.clinic_managers (clinic_id, user_id, granted_via_claim_id, granted_by, revoked_at, created_at)
    select p_keep_id, user_id, granted_via_claim_id, granted_by, revoked_at, created_at
    from public.clinic_managers where clinic_id = p_merge_id
  on conflict (clinic_id, user_id) do nothing;
  delete from public.clinic_managers where clinic_id = p_merge_id;

  -- Archive the merged listing and point it at the kept one.
  update public.clinics
  set status = 'archived',
      deleted_at = now(),
      merged_into_clinic_id = p_keep_id,
      updated_by = auth.uid()
  where id = p_merge_id;

  update public.duplicate_match_candidates
  set status = 'merged', resolved_by = auth.uid(), resolved_at = now()
  where status = 'pending'
    and clinic_a_id = least(p_keep_id, p_merge_id)
    and clinic_b_id = greatest(p_keep_id, p_merge_id);

  insert into public.admin_actions (actor_id, action, target_type, target_id, reason, metadata)
  values (
    auth.uid(), 'merge_clinics', 'clinic', p_keep_id, p_reason,
    jsonb_build_object('merged_clinic_id', p_merge_id)
  );
end;
$$;

revoke execute on function public.merge_clinics(uuid, uuid, text) from public, anon;
grant execute on function public.merge_clinics(uuid, uuid, text) to authenticated, service_role;
