-- ThriveMap: Row-Level Security policies.
-- Documented in docs/security/rls-policies.md. Server actions additionally
-- enforce authorization; RLS is the last line of defense.

-- profiles -------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles: owner read" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
create policy "profiles: owner update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- user_roles -----------------------------------------------------------
alter table public.user_roles enable row level security;

create policy "user_roles: owner read" on public.user_roles
  for select using (auth.uid() = user_id or public.is_admin());
-- Role grants happen via service-role only (server actions); no anon/auth writes.

-- user_preferences -----------------------------------------------------
alter table public.user_preferences enable row level security;

create policy "user_preferences: owner all" on public.user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- services (public taxonomy) -------------------------------------------
alter table public.services enable row level security;

create policy "services: public read" on public.services
  for select using (true);
create policy "services: admin write" on public.services
  for all using (public.is_admin()) with check (public.is_admin());

-- clinics --------------------------------------------------------------
alter table public.clinics enable row level security;

create policy "clinics: public read published" on public.clinics
  for select using (
    (deleted_at is null and public.is_publicly_visible(status))
    or public.is_moderator_or_admin()
    or public.manages_clinic(id)
  );
create policy "clinics: manager update" on public.clinics
  for update using (public.manages_clinic(id) or public.is_admin())
  with check (public.manages_clinic(id) or public.is_admin());
create policy "clinics: admin insert" on public.clinics
  for insert with check (public.is_moderator_or_admin());
create policy "clinics: admin delete" on public.clinics
  for delete using (public.is_admin());

-- clinic child tables: readable when parent clinic is publicly readable.
create or replace function public.clinic_publicly_readable(p_clinic_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.clinics c
    where c.id = p_clinic_id
      and c.deleted_at is null
      and public.is_publicly_visible(c.status)
  );
$$;

create or replace function public.clinic_readable_or_managed(p_clinic_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.clinic_publicly_readable(p_clinic_id)
    or public.manages_clinic(p_clinic_id)
    or public.is_moderator_or_admin();
$$;

create or replace function public.clinic_managed_or_admin(p_clinic_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.manages_clinic(p_clinic_id) or public.is_admin();
$$;

alter table public.clinic_locations enable row level security;
create policy "clinic_locations: read" on public.clinic_locations
  for select using (public.clinic_readable_or_managed(clinic_id));
create policy "clinic_locations: manage" on public.clinic_locations
  for all using (public.clinic_managed_or_admin(clinic_id))
  with check (public.clinic_managed_or_admin(clinic_id));

alter table public.clinic_contact_methods enable row level security;
create policy "clinic_contact_methods: read" on public.clinic_contact_methods
  for select using (public.clinic_readable_or_managed(clinic_id));
create policy "clinic_contact_methods: manage" on public.clinic_contact_methods
  for all using (public.clinic_managed_or_admin(clinic_id))
  with check (public.clinic_managed_or_admin(clinic_id));

alter table public.clinic_hours enable row level security;
create policy "clinic_hours: read" on public.clinic_hours
  for select using (public.clinic_readable_or_managed(clinic_id));
create policy "clinic_hours: manage" on public.clinic_hours
  for all using (public.clinic_managed_or_admin(clinic_id))
  with check (public.clinic_managed_or_admin(clinic_id));

alter table public.clinic_images enable row level security;
create policy "clinic_images: read" on public.clinic_images
  for select using (public.clinic_readable_or_managed(clinic_id));
create policy "clinic_images: manage" on public.clinic_images
  for all using (public.clinic_managed_or_admin(clinic_id))
  with check (public.clinic_managed_or_admin(clinic_id));

alter table public.clinic_social_links enable row level security;
create policy "clinic_social_links: read" on public.clinic_social_links
  for select using (public.clinic_readable_or_managed(clinic_id));
create policy "clinic_social_links: manage" on public.clinic_social_links
  for all using (public.clinic_managed_or_admin(clinic_id))
  with check (public.clinic_managed_or_admin(clinic_id));

alter table public.clinic_languages enable row level security;
create policy "clinic_languages: read" on public.clinic_languages
  for select using (public.clinic_readable_or_managed(clinic_id));
create policy "clinic_languages: manage" on public.clinic_languages
  for all using (public.clinic_managed_or_admin(clinic_id))
  with check (public.clinic_managed_or_admin(clinic_id));

alter table public.clinic_age_groups enable row level security;
create policy "clinic_age_groups: read" on public.clinic_age_groups
  for select using (public.clinic_readable_or_managed(clinic_id));
create policy "clinic_age_groups: manage" on public.clinic_age_groups
  for all using (public.clinic_managed_or_admin(clinic_id))
  with check (public.clinic_managed_or_admin(clinic_id));

alter table public.clinic_services enable row level security;
create policy "clinic_services: read" on public.clinic_services
  for select using (public.clinic_readable_or_managed(clinic_id));
create policy "clinic_services: manage" on public.clinic_services
  for all using (public.clinic_managed_or_admin(clinic_id))
  with check (public.clinic_managed_or_admin(clinic_id));

-- ph_locations (public reference data) ---------------------------------
alter table public.ph_locations enable row level security;
create policy "ph_locations: public read" on public.ph_locations
  for select using (true);

-- search documents ------------------------------------------------------
alter table public.clinic_search_documents enable row level security;
create policy "clinic_search_documents: read" on public.clinic_search_documents
  for select using (public.clinic_readable_or_managed(clinic_id));

-- external sources (admin-only) -----------------------------------------
alter table public.external_place_candidates enable row level security;
create policy "external_place_candidates: moderator" on public.external_place_candidates
  for all using (public.is_moderator_or_admin())
  with check (public.is_moderator_or_admin());

alter table public.clinic_source_records enable row level security;
create policy "clinic_source_records: moderator read" on public.clinic_source_records
  for select using (public.is_moderator_or_admin());

-- claims ----------------------------------------------------------------
alter table public.clinic_claims enable row level security;
create policy "clinic_claims: own read" on public.clinic_claims
  for select using (auth.uid() = user_id or public.is_moderator_or_admin());
create policy "clinic_claims: own insert" on public.clinic_claims
  for insert with check (auth.uid() = user_id);
create policy "clinic_claims: own update draft" on public.clinic_claims
  for update using (
    (auth.uid() = user_id and status in ('draft', 'additional_information_required'))
    or public.is_moderator_or_admin()
  );

alter table public.clinic_claim_documents enable row level security;
-- Documents metadata: claimant + moderators. Actual files live in a private
-- storage bucket; access only via short-lived signed URLs from the server.
create policy "clinic_claim_documents: own read" on public.clinic_claim_documents
  for select using (
    uploaded_by = auth.uid() or public.is_moderator_or_admin()
  );
create policy "clinic_claim_documents: own insert" on public.clinic_claim_documents
  for insert with check (uploaded_by = auth.uid());

alter table public.clinic_managers enable row level security;
create policy "clinic_managers: own read" on public.clinic_managers
  for select using (user_id = auth.uid() or public.is_moderator_or_admin());
-- Grants/revocations via service role only.

-- verification ----------------------------------------------------------
alter table public.clinic_verification_records enable row level security;
create policy "clinic_verification_records: moderator" on public.clinic_verification_records
  for all using (public.is_moderator_or_admin())
  with check (public.is_moderator_or_admin());

alter table public.clinic_verification_events enable row level security;
create policy "clinic_verification_events: moderator read" on public.clinic_verification_events
  for select using (public.is_moderator_or_admin());

-- contributions ----------------------------------------------------------
alter table public.clinic_submissions enable row level security;
create policy "clinic_submissions: own read" on public.clinic_submissions
  for select using (submitted_by = auth.uid() or public.is_moderator_or_admin());
create policy "clinic_submissions: insert" on public.clinic_submissions
  for insert with check (
    submitted_by is null or submitted_by = auth.uid()
  );
create policy "clinic_submissions: moderator update" on public.clinic_submissions
  for update using (public.is_moderator_or_admin());

alter table public.clinic_change_requests enable row level security;
create policy "clinic_change_requests: own read" on public.clinic_change_requests
  for select using (requested_by = auth.uid() or public.is_moderator_or_admin());
create policy "clinic_change_requests: insert" on public.clinic_change_requests
  for insert with check (requested_by = auth.uid());
create policy "clinic_change_requests: moderator update" on public.clinic_change_requests
  for update using (public.is_moderator_or_admin());

alter table public.clinic_reports enable row level security;
create policy "clinic_reports: own read" on public.clinic_reports
  for select using (reported_by = auth.uid() or public.is_moderator_or_admin());
create policy "clinic_reports: insert" on public.clinic_reports
  for insert with check (reported_by is null or reported_by = auth.uid());
create policy "clinic_reports: moderator update" on public.clinic_reports
  for update using (public.is_moderator_or_admin());

-- favorites --------------------------------------------------------------
alter table public.favorites enable row level security;
create policy "favorites: owner all" on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- admin ------------------------------------------------------------------
alter table public.admin_actions enable row level security;
create policy "admin_actions: admin read" on public.admin_actions
  for select using (public.is_moderator_or_admin());
create policy "admin_actions: admin insert" on public.admin_actions
  for insert with check (public.is_moderator_or_admin() and actor_id = auth.uid());

alter table public.audit_logs enable row level security;
create policy "audit_logs: admin read" on public.audit_logs
  for select using (public.is_admin());
-- Inserts happen via SECURITY DEFINER trigger only.

alter table public.duplicate_match_candidates enable row level security;
create policy "duplicate_match_candidates: moderator" on public.duplicate_match_candidates
  for all using (public.is_moderator_or_admin())
  with check (public.is_moderator_or_admin());

alter table public.jobs enable row level security;
create policy "jobs: admin read" on public.jobs
  for select using (public.is_admin());
-- Job enqueue/processing via service role only.
