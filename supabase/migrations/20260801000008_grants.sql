-- ThriveMap: table grants for PostgREST roles.
-- RLS policies (20260801000006_rls.sql) are the row-level gate; these grants
-- are the table-level gate. anon/authenticated get the minimum verbs their
-- policies can ever allow; service_role bypasses RLS and gets everything.

-- Read access (rows still filtered by RLS)
grant select on all tables in schema public to anon, authenticated;

-- service_role: full access
grant all on all tables in schema public to service_role;

-- Authenticated users write through RLS-guarded policies
grant insert, update, delete on
  public.user_preferences,
  public.favorites
to authenticated;

grant update on public.profiles to authenticated;

grant insert, update on
  public.clinic_claims,
  public.clinic_submissions,
  public.clinic_change_requests,
  public.clinic_reports
to authenticated;

grant insert on public.clinic_claim_documents to authenticated;

-- Clinic managers / moderators edit clinic data (RLS restricts which rows)
grant insert, update, delete on
  public.clinics,
  public.clinic_locations,
  public.clinic_contact_methods,
  public.clinic_hours,
  public.clinic_images,
  public.clinic_social_links,
  public.clinic_languages,
  public.clinic_age_groups,
  public.clinic_services,
  public.services,
  public.external_place_candidates,
  public.clinic_verification_records,
  public.duplicate_match_candidates
to authenticated;

grant insert on public.admin_actions to authenticated;

-- Anonymous visitors may suggest clinics and file reports (rate limited in app)
grant insert on
  public.clinic_submissions,
  public.clinic_reports
to anon;

-- Future tables: mirror these defaults
alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
