-- ThriveMap: extensions and enums
-- SQL migrations are the source of truth for the schema.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

-- Roles a user can hold. A user may hold several.
create type public.app_role as enum (
  'user',
  'clinic_representative',
  'moderator',
  'administrator',
  'super_administrator'
);

-- Clinic listing lifecycle.
create type public.listing_status as enum (
  'draft',
  'candidate',
  'pending_review',
  'published_unverified',
  'published_verified',
  'temporarily_closed',
  'permanently_closed',
  'suspended',
  'rejected',
  'archived'
);

create type public.claim_status as enum (
  'draft',
  'submitted',
  'under_review',
  'additional_information_required',
  'approved',
  'rejected',
  'revoked'
);

create type public.change_request_status as enum (
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'partially_approved'
);

create type public.submission_status as enum (
  'submitted',
  'under_review',
  'additional_information_required',
  'approved',
  'rejected'
);

create type public.report_type as enum (
  'wrong_address',
  'wrong_phone',
  'incorrect_hours',
  'incorrect_services',
  'permanently_closed',
  'temporarily_closed',
  'duplicate_listing',
  'misleading_information',
  'inappropriate_content',
  'other'
);

create type public.report_status as enum (
  'open',
  'under_review',
  'resolved',
  'dismissed'
);

create type public.source_type as enum (
  'manual',
  'user_submission',
  'clinic_representative',
  'external_import',
  'admin'
);

create type public.age_group as enum (
  'infants',
  'toddlers',
  'preschool',
  'school_age',
  'teenagers',
  'adults'
);

create type public.service_delivery as enum (
  'in_person',
  'online',
  'home_visit'
);

create type public.candidate_status as enum (
  'new',
  'under_review',
  'promoted',
  'discarded'
);

create type public.duplicate_status as enum (
  'pending',
  'confirmed_duplicate',
  'not_duplicate',
  'merged'
);

create type public.job_status as enum (
  'pending',
  'running',
  'completed',
  'failed',
  'dead'
);

-- Shared trigger to maintain updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
