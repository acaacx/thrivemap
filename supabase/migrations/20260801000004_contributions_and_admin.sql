-- ThriveMap: external sources, claims, contributions, admin, jobs

create table public.external_place_candidates (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google',
  external_id text not null,
  raw_payload jsonb not null default '{}',
  normalized_name text,
  normalized_address text,
  latitude double precision,
  longitude double precision,
  status public.candidate_status not null default 'new',
  promoted_clinic_id uuid references public.clinics (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create trigger external_place_candidates_updated_at
  before update on public.external_place_candidates
  for each row execute function public.set_updated_at();

create table public.clinic_source_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  source_type public.source_type not null,
  provider text,
  external_id text,
  raw_payload jsonb not null default '{}',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index clinic_source_records_clinic_idx on public.clinic_source_records (clinic_id);

create table public.clinic_claims (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.claim_status not null default 'draft',
  full_name text not null default '',
  work_email text not null default '',
  mobile_number text not null default '',
  job_title text not null default '',
  relationship text not null default '',
  business_registration_info text,
  consent_given boolean not null default false,
  additional_info_request text,
  decision_reason text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clinic_claims_clinic_idx on public.clinic_claims (clinic_id);
create index clinic_claims_user_idx on public.clinic_claims (user_id);
create index clinic_claims_status_idx on public.clinic_claims (status);

create trigger clinic_claims_updated_at
  before update on public.clinic_claims
  for each row execute function public.set_updated_at();

create table public.clinic_claim_documents (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.clinic_claims (id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('proof_of_affiliation', 'government_id', 'business_registration', 'other')),
  original_filename text,
  uploaded_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index clinic_claim_documents_claim_idx on public.clinic_claim_documents (claim_id);

-- Which users may manage which clinics (populated on claim approval).
create table public.clinic_managers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  granted_via_claim_id uuid references public.clinic_claims (id) on delete set null,
  granted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);

create index clinic_managers_user_idx on public.clinic_managers (user_id);

create or replace function public.manages_clinic(p_clinic_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.clinic_managers
    where clinic_id = p_clinic_id
      and user_id = auth.uid()
      and revoked_at is null
  );
$$;

create table public.clinic_verification_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  method text not null check (method in ('claim_approval', 'manual_review', 'document_review', 'phone_verification', 'site_visit')),
  notes text,
  verified_by uuid not null references auth.users (id) on delete cascade,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index clinic_verification_records_clinic_idx on public.clinic_verification_records (clinic_id);

create table public.clinic_verification_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  event text not null,
  actor_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index clinic_verification_events_clinic_idx on public.clinic_verification_events (clinic_id);

create table public.clinic_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users (id) on delete set null,
  submitter_email text,
  status public.submission_status not null default 'submitted',
  clinic_name text not null,
  address text not null,
  latitude double precision,
  longitude double precision,
  phone text,
  email text,
  website text,
  social_media_url text,
  service_slugs text[] not null default '{}',
  notes text,
  reference_links text[] not null default '{}',
  consent_given boolean not null default false,
  duplicate_of_clinic_id uuid references public.clinics (id) on delete set null,
  created_clinic_id uuid references public.clinics (id) on delete set null,
  review_reason text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clinic_submissions_status_idx on public.clinic_submissions (status);
create index clinic_submissions_user_idx on public.clinic_submissions (submitted_by);

create trigger clinic_submissions_updated_at
  before update on public.clinic_submissions
  for each row execute function public.set_updated_at();

create table public.clinic_change_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  status public.change_request_status not null default 'submitted',
  -- Proposed field changes: { "field": { "from": ..., "to": ... }, ... }
  changes jsonb not null default '{}',
  message text,
  review_reason text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clinic_change_requests_clinic_idx on public.clinic_change_requests (clinic_id);
create index clinic_change_requests_status_idx on public.clinic_change_requests (status);
create index clinic_change_requests_user_idx on public.clinic_change_requests (requested_by);

create trigger clinic_change_requests_updated_at
  before update on public.clinic_change_requests
  for each row execute function public.set_updated_at();

create table public.clinic_reports (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  reported_by uuid references auth.users (id) on delete set null,
  report_type public.report_type not null,
  details text,
  status public.report_status not null default 'open',
  resolution_note text,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clinic_reports_clinic_idx on public.clinic_reports (clinic_id);
create index clinic_reports_status_idx on public.clinic_reports (status);
create index clinic_reports_user_idx on public.clinic_reports (reported_by);

create trigger clinic_reports_updated_at
  before update on public.clinic_reports
  for each row execute function public.set_updated_at();

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, clinic_id)
);

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id uuid,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index admin_actions_actor_idx on public.admin_actions (actor_id);
create index admin_actions_target_idx on public.admin_actions (target_type, target_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create table public.duplicate_match_candidates (
  id uuid primary key default gen_random_uuid(),
  clinic_a_id uuid not null references public.clinics (id) on delete cascade,
  clinic_b_id uuid not null references public.clinics (id) on delete cascade,
  similarity_score numeric(5, 4) not null,
  matching_fields jsonb not null default '{}',
  status public.duplicate_status not null default 'pending',
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (clinic_a_id < clinic_b_id),
  unique (clinic_a_id, clinic_b_id)
);

create index duplicate_match_candidates_status_idx on public.duplicate_match_candidates (status);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  payload jsonb not null default '{}',
  -- Repeat submissions of the same logical job are deduped by this key.
  idempotency_key text unique,
  status public.job_status not null default 'pending',
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_ready_idx on public.jobs (status, run_at) where status = 'pending';
create index jobs_type_idx on public.jobs (job_type);

create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- Generic audit trigger for moderation-sensitive tables.
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger clinics_audit
  after insert or update or delete on public.clinics
  for each row execute function public.write_audit_log();

create trigger clinic_claims_audit
  after insert or update or delete on public.clinic_claims
  for each row execute function public.write_audit_log();

create trigger clinic_managers_audit
  after insert or update or delete on public.clinic_managers
  for each row execute function public.write_audit_log();

create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.write_audit_log();
