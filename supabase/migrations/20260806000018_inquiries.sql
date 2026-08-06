-- ThriveMap migration 18: caregiver → clinic inquiries.
-- Threads (inquiries) + messages, written only through security-definer
-- RPCs. RLS grants reads to the caregiver and the clinic's active
-- managers; moderators reach a thread only via a report on it.

create type public.inquiry_status as enum
  ('open', 'replied', 'confirmed', 'declined', 'closed');

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  caregiver_id uuid not null references auth.users (id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 200),
  preferred_date date,
  preferred_time_note text check (char_length(preferred_time_note) <= 200),
  status public.inquiry_status not null default 'open',
  confirmed_date date,
  status_changed_by uuid references auth.users (id) on delete set null,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inquiries_clinic_status_idx on public.inquiries (clinic_id, status);
create index inquiries_caregiver_idx on public.inquiries (caregiver_id);
create index inquiries_created_idx on public.inquiries (created_at desc);

create trigger inquiries_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

create table public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_role text not null check (sender_role in ('caregiver', 'clinic')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index inquiry_messages_thread_idx
  on public.inquiry_messages (inquiry_id, created_at);

-- Reports on a thread reuse the clinic_reports queue.
alter table public.clinic_reports
  add column inquiry_id uuid references public.inquiries (id) on delete cascade;
create index clinic_reports_inquiry_idx
  on public.clinic_reports (inquiry_id) where inquiry_id is not null;

-- Helper: does the current user actively manage this clinic?
create or replace function public.is_active_clinic_manager(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clinic_managers
    where clinic_id = p_clinic_id
      and user_id = auth.uid()
      and revoked_at is null
  );
$$;

alter table public.inquiries enable row level security;
alter table public.inquiry_messages enable row level security;

create policy inquiries_participant_read on public.inquiries
  for select using (
    caregiver_id = auth.uid()
    or public.is_active_clinic_manager(clinic_id)
  );

create policy inquiry_messages_participant_read on public.inquiry_messages
  for select using (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_id
        and (
          i.caregiver_id = auth.uid()
          or public.is_active_clinic_manager(i.clinic_id)
        )
    )
  );

-- No insert/update/delete policies: all writes go through the RPCs below
-- (or service_role, which bypasses RLS).

-- Open a thread. Caller becomes the caregiver; clinic must be published,
-- not deleted, and have at least one active manager.
create or replace function public.create_inquiry(
  p_clinic_id uuid,
  p_subject text,
  p_preferred_date date,
  p_preferred_time_note text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in to send an inquiry';
  end if;
  if not exists (
    select 1 from public.clinics
    where id = p_clinic_id
      and deleted_at is null
      and status in
        ('published_verified', 'published_unverified', 'temporarily_closed')
  ) then
    raise exception 'clinic not found';
  end if;
  if not exists (
    select 1 from public.clinic_managers
    where clinic_id = p_clinic_id and revoked_at is null
  ) then
    raise exception 'this clinic is not accepting inquiries yet';
  end if;

  insert into public.inquiries (
    clinic_id, caregiver_id, subject, preferred_date, preferred_time_note
  )
  values (
    p_clinic_id, auth.uid(), p_subject, p_preferred_date,
    nullif(p_preferred_time_note, '')
  )
  returning id into v_inquiry_id;

  insert into public.inquiry_messages (inquiry_id, sender_id, sender_role, body)
  values (v_inquiry_id, auth.uid(), 'caregiver', p_body);

  return v_inquiry_id;
end;
$$;

-- Reply on an open thread. A manager reply flips open → replied; a
-- caregiver reply never changes status.
create or replace function public.reply_inquiry(
  p_inquiry_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.inquiries;
  v_role text;
  v_message_id uuid;
begin
  select * into v_inquiry
  from public.inquiries where id = p_inquiry_id
  for update;
  if not found then
    raise exception 'inquiry not found';
  end if;
  if v_inquiry.status in ('declined', 'closed') then
    raise exception 'this conversation is closed';
  end if;

  if v_inquiry.caregiver_id = auth.uid() then
    v_role := 'caregiver';
  elsif public.is_active_clinic_manager(v_inquiry.clinic_id) then
    v_role := 'clinic';
  else
    raise exception 'not authorized';
  end if;

  insert into public.inquiry_messages (inquiry_id, sender_id, sender_role, body)
  values (p_inquiry_id, auth.uid(), v_role, p_body)
  returning id into v_message_id;

  if v_role = 'clinic' and v_inquiry.status = 'open' then
    update public.inquiries
    set status = 'replied',
        status_changed_by = auth.uid(),
        status_changed_at = now()
    where id = p_inquiry_id;
  end if;

  return v_message_id;
end;
$$;

-- Status transitions, managers only. Valid: any non-terminal status to
-- replied | confirmed | declined | closed. confirmed requires a date.
create or replace function public.set_inquiry_status(
  p_inquiry_id uuid,
  p_status public.inquiry_status,
  p_confirmed_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.inquiries;
begin
  select * into v_inquiry
  from public.inquiries where id = p_inquiry_id
  for update;
  if not found then
    raise exception 'inquiry not found';
  end if;
  if not public.is_active_clinic_manager(v_inquiry.clinic_id) then
    raise exception 'not authorized';
  end if;
  if v_inquiry.status in ('declined', 'closed') then
    raise exception 'this conversation is closed';
  end if;
  if p_status not in ('replied', 'confirmed', 'declined', 'closed') then
    raise exception 'invalid status change';
  end if;
  if p_status = 'confirmed' and p_confirmed_date is null then
    raise exception 'a confirmed inquiry needs a date';
  end if;

  update public.inquiries
  set status = p_status,
      confirmed_date = case
        when p_status = 'confirmed' then p_confirmed_date
        else confirmed_date
      end,
      status_changed_by = auth.uid(),
      status_changed_at = now()
  where id = p_inquiry_id;
end;
$$;

-- The ONLY moderator read path into a thread: through a report on it.
create or replace function public.get_reported_inquiry_thread(
  p_report_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inquiry_id uuid;
  v_result jsonb;
begin
  if not public.is_moderator_or_admin() then
    raise exception 'not authorized';
  end if;

  select inquiry_id into v_inquiry_id
  from public.clinic_reports
  where id = p_report_id and inquiry_id is not null;
  if v_inquiry_id is null then
    raise exception 'report not found or not an inquiry report';
  end if;

  select jsonb_build_object(
    'inquiry', to_jsonb(i) - 'caregiver_id',
    'messages', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'sender_role', m.sender_role,
            'body', m.body,
            'created_at', m.created_at
          ) order by m.created_at
        )
        from public.inquiry_messages m
        where m.inquiry_id = i.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.inquiries i
  where i.id = v_inquiry_id;

  return v_result;
end;
$$;

-- Hardened defaults: explicit grants.
grant select on public.inquiries, public.inquiry_messages to authenticated;
grant all on public.inquiries, public.inquiry_messages to service_role;

revoke execute on function public.is_active_clinic_manager(uuid) from public, anon;
revoke execute on function public.create_inquiry(uuid, text, date, text, text) from public, anon;
revoke execute on function public.reply_inquiry(uuid, text) from public, anon;
revoke execute on function public.set_inquiry_status(uuid, public.inquiry_status, date) from public, anon;
revoke execute on function public.get_reported_inquiry_thread(uuid) from public, anon;
grant execute on function public.is_active_clinic_manager(uuid) to authenticated, service_role;
grant execute on function public.create_inquiry(uuid, text, date, text, text) to authenticated, service_role;
grant execute on function public.reply_inquiry(uuid, text) to authenticated, service_role;
grant execute on function public.set_inquiry_status(uuid, public.inquiry_status, date) to authenticated, service_role;
grant execute on function public.get_reported_inquiry_thread(uuid) to authenticated, service_role;
