# Inquiries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in caregivers message claimed clinics (threaded, with an optional preferred date); clinic reps reply and confirm/decline from the portal; email notifications ride the existing pg job queue.

**Architecture:** New domain module `src/modules/inquiries/` + migration 18. All writes go through security-definer RPCs (`create_inquiry`, `reply_inquiry`, `set_inquiry_status`); RLS grants read access only to the caregiver and the clinic's active managers. Notifications are a new `inquiry_notification` job handled in `src/modules/jobs/handlers.ts`, sending via the existing `getEmailSender()` dev adapter. Reports reuse `clinic_reports` with a new nullable `inquiry_id` column; a reported thread is readable by moderators via `get_reported_inquiry_thread` only.

**Tech Stack:** Next.js (App Router, RSC + server actions), Supabase (Postgres + RLS + RPC), zod, vitest (unit + integration), Playwright (e2e), shadcn-on-Base-UI components, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-06-inquiries-design.md`. One deliberate deviation: the spec says portal route `/portal/[clinicSlug]/inquiries`; the real portal lives at `/clinic-portal/[clinicId]/…`, so inquiries go at `/clinic-portal/[clinicId]/inquiries`.

## Global Constraints

- No external credentials. Email uses the existing `[DEV ADAPTER]` sender via `getEmailSender()`. Nothing in this feature adds an env var.
- Supabase hardened defaults: every new function gets explicit `revoke … from public, anon` + `grant execute … to authenticated, service_role` (migration 17 precedent, bottom of `supabase/migrations/20260806000017_candidate_matching.sql`).
- Extensions live in the `extensions` schema (not relevant here — no PostGIS in this feature — but do not add `public.` extension calls).
- zod schemas must keep input type == output type: **no `.coerce`, no `.default()`** (zodResolver breaks otherwise).
- shadcn here is **Base UI, not Radix**: no `asChild`; use `render={<Link …/>}`; `CardTitle` is a plain div.
- Native `<select>`/`<input type="date">` in forms Playwright touches (import-trigger precedent).
- e2e: chromium-only for anything mutating shared demo accounts; tests idempotent — clean own data first; poll the DB with `expect.poll` + a service-role client, never UI badges; run against the preview port via `PLAYWRIGHT_BASE_URL`; restart the dev server before full-suite runs (in-memory rate limiter accumulates).
- Jobs processor auth header is `x-jobs-secret`, NOT `Authorization: Bearer`.
- Demo logins (local, password `password123`): `admin@thrivemap.test`, `moderator@thrivemap.test`, `caregiver@thrivemap.test`, `clinicrep@thrivemap.test`.
- Commit messages: plain imperative summary + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- After the migration lands, regenerate types: `pnpm db:types` (writes `src/lib/database.types.ts`) — commit alongside the migration.

---

### Task 1: Migration 18 — schema, RLS, RPCs, grants

**Files:**

- Create: `supabase/migrations/20260806000018_inquiries.sql`
- Create: `tests/integration/inquiries-rls.test.ts`
- Modify: `src/lib/database.types.ts` (regenerated, not hand-edited)

**Interfaces:**

- Produces (used by every later task):
  - tables `public.inquiries`, `public.inquiry_messages`; column `public.clinic_reports.inquiry_id uuid null`
  - enum `public.inquiry_status`: `'open' | 'replied' | 'confirmed' | 'declined' | 'closed'`
  - `create_inquiry(p_clinic_id uuid, p_subject text, p_preferred_date date, p_preferred_time_note text, p_body text) returns uuid` (inquiry id)
  - `reply_inquiry(p_inquiry_id uuid, p_body text) returns uuid` (message id)
  - `set_inquiry_status(p_inquiry_id uuid, p_status public.inquiry_status, p_confirmed_date date default null) returns void`
  - `get_reported_inquiry_thread(p_report_id uuid) returns jsonb` — `{ "inquiry": {...}, "messages": [...] }`

- [ ] **Step 1: Write the failing integration tests**

Create `tests/integration/inquiries-rls.test.ts`. Model the client helpers on `tests/integration/rls.test.ts` (copy `anonClient`/`signedInClient` verbatim — they are file-local there). The service client uses the local service-role key the way `tests/integration/places-import.test.ts` does (read that file's constant if unsure; the local demo service key is in `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`, loaded by `vitest.integration.config.ts`).

```ts
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function anonClient() {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
}

async function signedInClient(email: string) {
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: "password123",
  });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

const service = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/** A clinic clinicrep@ manages (active clinic_managers row). */
async function managedClinicId(): Promise<string> {
  const { data: list } = await service.auth.admin.listUsers();
  const rep = list.users.find((u) => u.email === "clinicrep@thrivemap.test")!;
  const { data: grant } = await service
    .from("clinic_managers")
    .select("clinic_id")
    .eq("user_id", rep.id)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (!grant) throw new Error("seed data: clinicrep@ has no managed clinic");
  return grant.clinic_id;
}

/** A published clinic with NO active managers (unclaimed). */
async function unclaimedClinicId(): Promise<string> {
  const { data: clinics } = await service
    .from("clinics")
    .select("id, clinic_managers(id, revoked_at)")
    .in("status", ["published_verified", "published_unverified"])
    .is("deleted_at", null)
    .limit(50);
  const hit = clinics?.find(
    (c) => !c.clinic_managers?.some((m) => m.revoked_at === null),
  );
  if (!hit) throw new Error("seed data: no unclaimed clinic found");
  return hit.id;
}

async function cleanup() {
  // Idempotent: remove threads created by these tests (subject marker).
  const { data } = await service
    .from("inquiries")
    .select("id")
    .like("subject", "[itest]%");
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length) {
    await service.from("clinic_reports").delete().in("inquiry_id", ids);
    await service.from("inquiries").delete().in("id", ids);
  }
}

beforeAll(async () => {
  const { error } = await anonClient().from("services").select("id").limit(1);
  if (error) throw new Error(`Supabase local not reachable: ${error.message}`);
  await cleanup();
});
afterAll(cleanup);

describe("inquiries: create_inquiry", () => {
  it("caregiver can open a thread on a claimed clinic; first message lands", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const clinicId = await managedClinicId();
    const { data: inquiryId, error } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: clinicId,
      p_subject: "[itest] Initial assessment",
      p_preferred_date: "2026-09-01",
      p_preferred_time_note: "weekday mornings",
      p_body: "Hi, do you assess 4-year-olds?",
    });
    expect(error).toBeNull();
    expect(inquiryId).toBeTruthy();
    const { data: msgs } = await caregiver
      .from("inquiry_messages")
      .select("sender_role, body")
      .eq("inquiry_id", inquiryId!);
    expect(msgs).toHaveLength(1);
    expect(msgs![0].sender_role).toBe("caregiver");
  });

  it("rejects unclaimed clinics", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const clinicId = await unclaimedClinicId();
    const { error } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: clinicId,
      p_subject: "[itest] should fail",
      p_preferred_date: null,
      p_preferred_time_note: null,
      p_body: "hello",
    });
    expect(error?.message).toMatch(/not accepting inquiries/i);
  });

  it("rejects anonymous callers", async () => {
    const { error } = await anonClient().rpc("create_inquiry", {
      p_clinic_id: await managedClinicId(),
      p_subject: "[itest] anon",
      p_preferred_date: null,
      p_preferred_time_note: null,
      p_body: "hello",
    });
    expect(error).not.toBeNull();
  });
});

describe("inquiries: visibility", () => {
  let inquiryId: string;

  beforeAll(async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: await managedClinicId(),
      p_subject: "[itest] visibility thread",
      p_preferred_date: null,
      p_preferred_time_note: null,
      p_body: "visibility check",
    });
    inquiryId = data!;
  });

  it("caregiver sees own thread", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data } = await caregiver
      .from("inquiries")
      .select("id")
      .eq("id", inquiryId);
    expect(data).toHaveLength(1);
  });

  it("managing rep sees the thread", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const { data } = await rep
      .from("inquiries")
      .select("id")
      .eq("id", inquiryId);
    expect(data).toHaveLength(1);
  });

  it("unrelated signed-in user sees nothing (moderator has no manager grant)", async () => {
    const other = await signedInClient("moderator@thrivemap.test");
    const { data } = await other
      .from("inquiries")
      .select("id")
      .eq("id", inquiryId);
    expect(data).toEqual([]);
    const { data: msgs } = await other
      .from("inquiry_messages")
      .select("id")
      .eq("inquiry_id", inquiryId);
    expect(msgs).toEqual([]);
  });

  it("direct inserts are blocked even for participants", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data: me } = await caregiver.auth.getUser();
    const { error } = await caregiver.from("inquiry_messages").insert({
      inquiry_id: inquiryId,
      sender_id: me.user!.id,
      sender_role: "caregiver",
      body: "sneaky direct insert",
    });
    expect(error).not.toBeNull();
  });
});

describe("inquiries: reply + status lifecycle", () => {
  let inquiryId: string;

  beforeAll(async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: await managedClinicId(),
      p_subject: "[itest] lifecycle thread",
      p_preferred_date: "2026-09-15",
      p_preferred_time_note: null,
      p_body: "lifecycle check",
    });
    inquiryId = data!;
  });

  it("rep reply flips open → replied", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const { error } = await rep.rpc("reply_inquiry", {
      p_inquiry_id: inquiryId,
      p_body: "Yes, we have slots.",
    });
    expect(error).toBeNull();
    const { data } = await rep
      .from("inquiries")
      .select("status")
      .eq("id", inquiryId)
      .single();
    expect(data!.status).toBe("replied");
  });

  it("non-manager cannot reply or set status", async () => {
    const other = await signedInClient("moderator@thrivemap.test");
    const { error: replyErr } = await other.rpc("reply_inquiry", {
      p_inquiry_id: inquiryId,
      p_body: "intruding",
    });
    expect(replyErr).not.toBeNull();
    const { error: statusErr } = await other.rpc("set_inquiry_status", {
      p_inquiry_id: inquiryId,
      p_status: "closed",
    });
    expect(statusErr).not.toBeNull();
  });

  it("confirm requires a date; sets confirmed_date", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const { error: noDate } = await rep.rpc("set_inquiry_status", {
      p_inquiry_id: inquiryId,
      p_status: "confirmed",
    });
    expect(noDate?.message).toMatch(/date/i);
    const { error } = await rep.rpc("set_inquiry_status", {
      p_inquiry_id: inquiryId,
      p_status: "confirmed",
      p_confirmed_date: "2026-09-15",
    });
    expect(error).toBeNull();
    const { data } = await rep
      .from("inquiries")
      .select("status, confirmed_date")
      .eq("id", inquiryId)
      .single();
    expect(data!.status).toBe("confirmed");
    expect(data!.confirmed_date).toBe("2026-09-15");
  });

  it("caregiver can still reply on a confirmed thread", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { error } = await caregiver.rpc("reply_inquiry", {
      p_inquiry_id: inquiryId,
      p_body: "Thank you, see you then!",
    });
    expect(error).toBeNull();
    // Caregiver reply must NOT downgrade confirmed.
    const { data } = await caregiver
      .from("inquiries")
      .select("status")
      .eq("id", inquiryId)
      .single();
    expect(data!.status).toBe("confirmed");
  });

  it("closed thread rejects replies and further transitions", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    await rep.rpc("set_inquiry_status", {
      p_inquiry_id: inquiryId,
      p_status: "closed",
    });
    const { error: replyErr } = await rep.rpc("reply_inquiry", {
      p_inquiry_id: inquiryId,
      p_body: "too late",
    });
    expect(replyErr?.message).toMatch(/closed/i);
    const { error: reopenErr } = await rep.rpc("set_inquiry_status", {
      p_inquiry_id: inquiryId,
      p_status: "replied",
    });
    expect(reopenErr).not.toBeNull();
  });
});

describe("inquiries: reported-thread moderator access", () => {
  it("moderator reads a thread only through a report", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const clinicId = await managedClinicId();
    const { data: inquiryId } = await caregiver.rpc("create_inquiry", {
      p_clinic_id: clinicId,
      p_subject: "[itest] reported thread",
      p_preferred_date: null,
      p_preferred_time_note: null,
      p_body: "message to be reported",
    });
    const { data: report } = await service
      .from("clinic_reports")
      .insert({
        clinic_id: clinicId,
        report_type: "inappropriate_content",
        details: "[itest] abusive message",
        inquiry_id: inquiryId,
      })
      .select("id")
      .single();

    const moderator = await signedInClient("moderator@thrivemap.test");
    const { data: thread, error } = await moderator.rpc(
      "get_reported_inquiry_thread",
      { p_report_id: report!.id },
    );
    expect(error).toBeNull();
    const parsed = thread as {
      inquiry: { id: string; subject: string };
      messages: Array<{ body: string }>;
    };
    expect(parsed.inquiry.id).toBe(inquiryId);
    expect(parsed.messages).toHaveLength(1);

    // Caregiver (non-moderator) cannot use the moderator read path.
    const { error: denied } = await caregiver.rpc(
      "get_reported_inquiry_thread",
      { p_report_id: report!.id },
    );
    expect(denied).not.toBeNull();
  });
});
```

Note on the two seed-data helpers: if the seed has no unclaimed published clinic or clinicrep@ manages nothing, the helper throws with a clear message — fix the helper by picking different seed rows, do NOT create clinics in the test.

- [ ] **Step 2: Run tests, confirm they fail for the right reason**

```bash
pnpm test:integration -- inquiries-rls
```

Expected: failures like `relation "public.inquiries" does not exist` / unknown RPC. Anything else (sign-in failures, unreachable Supabase) — fix the environment first (`pnpm db:start`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260806000018_inquiries.sql`:

```sql
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
```

- [ ] **Step 4: Apply and regenerate types**

```bash
pnpm db:reset
pnpm db:types
```

Expected: reset replays all 18 migrations cleanly; `git diff src/lib/database.types.ts` shows the new tables/RPCs.

- [ ] **Step 5: Run the integration tests, verify they pass**

```bash
pnpm test:integration -- inquiries-rls
```

Expected: all pass. If `clinic status` check fails on `create_inquiry` for seed data, check which statuses the seeded managed clinic has — the RPC accepts the three public statuses only.

- [ ] **Step 6: Run existing suites to catch regressions**

```bash
pnpm test:integration && pnpm typecheck
```

Expected: all green (types regenerated, nothing else touched).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260806000018_inquiries.sql src/lib/database.types.ts tests/integration/inquiries-rls.test.ts
git commit -m "Add inquiries schema, RPCs, and RLS with integration coverage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Module schemas + status-transition map

**Files:**

- Create: `src/modules/inquiries/schemas.ts`
- Test: `src/modules/inquiries/schemas.test.ts`

**Interfaces:**

- Produces:
  - `INQUIRY_STATUSES = ["open", "replied", "confirmed", "declined", "closed"] as const`; `type InquiryStatus = (typeof INQUIRY_STATUSES)[number]`
  - `INQUIRY_STATUS_LABELS: Record<InquiryStatus, string>`
  - `canTransition(from: InquiryStatus, to: InquiryStatus): boolean`
  - `createInquirySchema` — `{ clinicId: string(uuid), subject: string 3–200, preferredDate?: string (YYYY-MM-DD) | "", preferredTimeNote?: string ≤200, body: string 1–4000 }`
  - `replyInquirySchema` — `{ inquiryId: string(uuid), body: string 1–4000 }`
  - `setInquiryStatusSchema` — `{ inquiryId: string(uuid), status: "replied"|"confirmed"|"declined"|"closed", confirmedDate?: string }` with a `.superRefine` requiring `confirmedDate` when `status === "confirmed"`
  - `reportInquirySchema` — `{ inquiryId: string(uuid), reportType: enum of the existing public.report_type values, details?: string ≤2000 }`

- [ ] **Step 1: Write the failing tests**

Create `src/modules/inquiries/schemas.test.ts` (mirror the style of `src/modules/submissions/schemas.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import {
  canTransition,
  createInquirySchema,
  replyInquirySchema,
  reportInquirySchema,
  setInquiryStatusSchema,
} from "./schemas";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("createInquirySchema", () => {
  it("accepts a full valid payload", () => {
    const result = createInquirySchema.safeParse({
      clinicId: uuid,
      subject: "Initial assessment for my son",
      preferredDate: "2026-09-01",
      preferredTimeNote: "weekday mornings",
      body: "Do you assess 4-year-olds?",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty optional fields", () => {
    const result = createInquirySchema.safeParse({
      clinicId: uuid,
      subject: "Question",
      preferredDate: "",
      preferredTimeNote: "",
      body: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(
      createInquirySchema.safeParse({
        clinicId: uuid,
        subject: "Question",
        preferredDate: "next tuesday",
        preferredTimeNote: "",
        body: "Hello",
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-bounds subject and body", () => {
    expect(
      createInquirySchema.safeParse({
        clinicId: uuid,
        subject: "ab",
        preferredDate: "",
        preferredTimeNote: "",
        body: "Hello",
      }).success,
    ).toBe(false);
    expect(
      createInquirySchema.safeParse({
        clinicId: uuid,
        subject: "Question",
        preferredDate: "",
        preferredTimeNote: "",
        body: "x".repeat(4001),
      }).success,
    ).toBe(false);
  });
});

describe("setInquiryStatusSchema", () => {
  it("requires a date when confirming", () => {
    expect(
      setInquiryStatusSchema.safeParse({
        inquiryId: uuid,
        status: "confirmed",
        confirmedDate: "",
      }).success,
    ).toBe(false);
    expect(
      setInquiryStatusSchema.safeParse({
        inquiryId: uuid,
        status: "confirmed",
        confirmedDate: "2026-09-15",
      }).success,
    ).toBe(true);
  });

  it("does not require a date otherwise", () => {
    expect(
      setInquiryStatusSchema.safeParse({
        inquiryId: uuid,
        status: "closed",
        confirmedDate: "",
      }).success,
    ).toBe(true);
  });

  it("rejects 'open' as a target", () => {
    expect(
      setInquiryStatusSchema.safeParse({
        inquiryId: uuid,
        status: "open",
        confirmedDate: "",
      }).success,
    ).toBe(false);
  });
});

describe("canTransition", () => {
  it("allows non-terminal → resolution states", () => {
    expect(canTransition("open", "replied")).toBe(true);
    expect(canTransition("open", "confirmed")).toBe(true);
    expect(canTransition("replied", "declined")).toBe(true);
    expect(canTransition("confirmed", "closed")).toBe(true);
  });

  it("blocks anything out of terminal states and reopening", () => {
    expect(canTransition("closed", "replied")).toBe(false);
    expect(canTransition("declined", "confirmed")).toBe(false);
    expect(canTransition("replied", "open")).toBe(false);
  });
});

describe("replyInquirySchema / reportInquirySchema", () => {
  it("bounds reply body", () => {
    expect(
      replyInquirySchema.safeParse({ inquiryId: uuid, body: "" }).success,
    ).toBe(false);
    expect(
      replyInquirySchema.safeParse({ inquiryId: uuid, body: "ok" }).success,
    ).toBe(true);
  });

  it("accepts a known report type", () => {
    expect(
      reportInquirySchema.safeParse({
        inquiryId: uuid,
        reportType: "inappropriate_content",
        details: "abusive language",
      }).success,
    ).toBe(true);
    expect(
      reportInquirySchema.safeParse({
        inquiryId: uuid,
        reportType: "not_a_type",
        details: "",
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
pnpm test -- src/modules/inquiries/schemas.test.ts
```

Expected: FAIL — cannot resolve `./schemas`.

- [ ] **Step 3: Implement**

Create `src/modules/inquiries/schemas.ts`. Remember the global constraint: no `.coerce`, no `.default()` — optional strings stay `string | undefined` with `""` allowed.

```ts
import { z } from "zod";

export const INQUIRY_STATUSES = [
  "open",
  "replied",
  "confirmed",
  "declined",
  "closed",
] as const;

export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  open: "Awaiting reply",
  replied: "Replied",
  confirmed: "Confirmed",
  declined: "Declined",
  closed: "Closed",
};

const TERMINAL: ReadonlySet<InquiryStatus> = new Set(["declined", "closed"]);
const TARGETS: ReadonlySet<InquiryStatus> = new Set([
  "replied",
  "confirmed",
  "declined",
  "closed",
]);

/** Mirrors set_inquiry_status in migration 18 — keep the two in sync. */
export function canTransition(from: InquiryStatus, to: InquiryStatus): boolean {
  return !TERMINAL.has(from) && TARGETS.has(to);
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please pick a valid date");

const optionalIsoDate = z.union([isoDate, z.literal("")]).optional();

const bodyField = z
  .string()
  .min(1, "Please write a message")
  .max(4000, "Messages are limited to 4000 characters");

export const createInquirySchema = z.object({
  clinicId: z.string().uuid(),
  subject: z
    .string()
    .min(3, "Please add a short subject")
    .max(200, "Subjects are limited to 200 characters"),
  preferredDate: optionalIsoDate,
  preferredTimeNote: z
    .string()
    .max(200, "Keep the time note under 200 characters")
    .optional(),
  body: bodyField,
});

export const replyInquirySchema = z.object({
  inquiryId: z.string().uuid(),
  body: bodyField,
});

export const setInquiryStatusSchema = z
  .object({
    inquiryId: z.string().uuid(),
    status: z.enum(["replied", "confirmed", "declined", "closed"]),
    confirmedDate: optionalIsoDate,
  })
  .superRefine((value, ctx) => {
    if (value.status === "confirmed" && !value.confirmedDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmedDate"],
        message: "Pick the confirmed date",
      });
    }
  });

export const reportInquirySchema = z.object({
  inquiryId: z.string().uuid(),
  reportType: z.enum([
    "wrong_address",
    "wrong_phone",
    "incorrect_hours",
    "incorrect_services",
    "permanently_closed",
    "temporarily_closed",
    "duplicate_listing",
    "misleading_information",
    "inappropriate_content",
    "other",
  ]),
  details: z
    .string()
    .max(2000, "Keep details under 2000 characters")
    .optional(),
});

export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
export type ReplyInquiryInput = z.infer<typeof replyInquirySchema>;
export type SetInquiryStatusInput = z.infer<typeof setInquiryStatusSchema>;
export type ReportInquiryInput = z.infer<typeof reportInquirySchema>;
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test -- src/modules/inquiries/schemas.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/inquiries/schemas.ts src/modules/inquiries/schemas.test.ts
git commit -m "Add inquiry zod schemas and status transition map

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Notifications — payload builders, email templates, job handler

**Files:**

- Create: `src/modules/inquiries/notify.ts`
- Test: `src/modules/inquiries/notify.test.ts`
- Modify: `src/modules/jobs/queue.ts` (add `"inquiry_notification"` to `JobType`)
- Modify: `src/modules/jobs/handlers.ts` (add `runInquiryNotification` + register)
- Modify: `src/modules/shared/email/templates.ts` (3 new templates)

**Interfaces:**

- Consumes: `enqueueJob(jobType, payload, { idempotencyKey })` from `src/modules/jobs/queue.ts`; `emailTemplates` / `EmailContent` from `src/modules/shared/email`.
- Produces:
  - `type InquiryNotificationPayload = { inquiry_id: string; kind: "created" | "message" | "status"; message_id?: string; status?: string }`
  - `inquiryCreatedJob(inquiryId: string): { payload: InquiryNotificationPayload; idempotencyKey: string }`
  - `inquiryMessageJob(inquiryId: string, messageId: string): same shape`
  - `inquiryStatusJob(inquiryId: string, status: string, statusChangedAt: string): same shape`
  - templates `inquiryReceived({name, clinicName, subject, path})`, `inquiryReply({name, clinicName, subject, excerpt, path})`, `inquiryStatusChanged({name, clinicName, subject, statusLabel, confirmedDate, path})` — all return `EmailContent`; `path` is a site-relative link target.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/inquiries/notify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  inquiryCreatedJob,
  inquiryMessageJob,
  inquiryStatusJob,
} from "./notify";

const iid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("inquiry notification job builders", () => {
  it("created: keyed once per inquiry", () => {
    const job = inquiryCreatedJob(iid);
    expect(job.payload).toEqual({ inquiry_id: iid, kind: "created" });
    expect(job.idempotencyKey).toBe(`inquiry-notify:created:${iid}`);
  });

  it("message: keyed per message", () => {
    const job = inquiryMessageJob(iid, mid);
    expect(job.payload).toEqual({
      inquiry_id: iid,
      kind: "message",
      message_id: mid,
    });
    expect(job.idempotencyKey).toBe(`inquiry-notify:message:${mid}`);
  });

  it("status: keyed per transition instant", () => {
    const at = "2026-08-06T10:00:00.000Z";
    const job = inquiryStatusJob(iid, "confirmed", at);
    expect(job.payload).toEqual({
      inquiry_id: iid,
      kind: "status",
      status: "confirmed",
    });
    expect(job.idempotencyKey).toBe(
      `inquiry-notify:status:${iid}:confirmed:${at}`,
    );
  });
});
```

Add template assertions to the existing template test file if one exists; otherwise fold into `notify.test.ts`:

```ts
import { emailTemplates } from "@/modules/shared/email";

describe("inquiry email templates", () => {
  it("render subject, link path, and excerpt", () => {
    const received = emailTemplates.inquiryReceived({
      name: "Rep",
      clinicName: "Sunrise Center",
      subject: "Assessment for 4yo",
      path: "/clinic-portal/abc/inquiries/def",
    });
    expect(received.subject).toContain("Sunrise Center");
    expect(received.html).toContain("/clinic-portal/abc/inquiries/def");

    const reply = emailTemplates.inquiryReply({
      name: "Maria",
      clinicName: "Sunrise Center",
      subject: "Assessment for 4yo",
      excerpt: "Yes, we have slots on…",
      path: "/account/inquiries/def",
    });
    expect(reply.html).toContain("Yes, we have slots on…");
    expect(reply.text).toContain("/account/inquiries/def");

    const status = emailTemplates.inquiryStatusChanged({
      name: "Maria",
      clinicName: "Sunrise Center",
      subject: "Assessment for 4yo",
      statusLabel: "Confirmed",
      confirmedDate: "2026-09-15",
      path: "/account/inquiries/def",
    });
    expect(status.subject).toContain("Confirmed");
    expect(status.html).toContain("2026-09-15");
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
pnpm test -- src/modules/inquiries/notify.test.ts
```

Expected: FAIL — `./notify` unresolved, `inquiryReceived` not a template.

- [ ] **Step 3: Implement `notify.ts`**

```ts
/**
 * Pure builders for inquiry_notification jobs — payload + idempotency key
 * only, so they stay unit-testable. Enqueueing happens in actions.ts; the
 * handler lives in src/modules/jobs/handlers.ts.
 */

export interface InquiryNotificationPayload {
  inquiry_id: string;
  kind: "created" | "message" | "status";
  message_id?: string;
  status?: string;
  [key: string]: unknown;
}

export interface InquiryNotificationJob {
  payload: InquiryNotificationPayload;
  idempotencyKey: string;
}

export function inquiryCreatedJob(inquiryId: string): InquiryNotificationJob {
  return {
    payload: { inquiry_id: inquiryId, kind: "created" },
    idempotencyKey: `inquiry-notify:created:${inquiryId}`,
  };
}

export function inquiryMessageJob(
  inquiryId: string,
  messageId: string,
): InquiryNotificationJob {
  return {
    payload: { inquiry_id: inquiryId, kind: "message", message_id: messageId },
    idempotencyKey: `inquiry-notify:message:${messageId}`,
  };
}

export function inquiryStatusJob(
  inquiryId: string,
  status: string,
  statusChangedAt: string,
): InquiryNotificationJob {
  return {
    payload: { inquiry_id: inquiryId, kind: "status", status },
    idempotencyKey: `inquiry-notify:status:${inquiryId}:${status}:${statusChangedAt}`,
  };
}
```

- [ ] **Step 4: Add the three templates**

In `src/modules/shared/email/templates.ts`, before the closing `} as const;`, following the existing helpers (`layout`, `paragraphs`, `button`, `url`). Update the file's top comment ("The 12 transactional email templates") to say 15. Email bodies keep message content to a ≤120-char excerpt — full text lives behind the link.

```ts
  inquiryReceived(params: {
    name: string;
    clinicName: string;
    subject: string;
    path: string;
  }): EmailContent {
    return {
      subject: `New inquiry for ${params.clinicName}`,
      html: layout(
        "New inquiry",
        paragraphs(
          `Hi ${params.name},`,
          `A caregiver sent <strong>${params.clinicName}</strong> a new inquiry: “${params.subject}”.`,
          `Reply from the clinic portal — families appreciate a quick answer.`,
        ) + button(url(params.path), "Open the inquiry"),
      ),
      text: `Hi ${params.name},\n\nNew inquiry for ${params.clinicName}: “${params.subject}”. Reply at ${url(params.path)}`,
    };
  },

  inquiryReply(params: {
    name: string;
    clinicName: string;
    subject: string;
    excerpt: string;
    path: string;
  }): EmailContent {
    return {
      subject: `New reply about “${params.subject}”`,
      html: layout(
        "New reply",
        paragraphs(
          `Hi ${params.name},`,
          `There's a new reply in your conversation with <strong>${params.clinicName}</strong>:`,
          `<em>${params.excerpt}</em>`,
        ) + button(url(params.path), "Read and reply"),
      ),
      text: `Hi ${params.name},\n\nNew reply about “${params.subject}” from your conversation with ${params.clinicName}:\n${params.excerpt}\n\nRead and reply: ${url(params.path)}`,
    };
  },

  inquiryStatusChanged(params: {
    name: string;
    clinicName: string;
    subject: string;
    statusLabel: string;
    confirmedDate?: string;
    path: string;
  }): EmailContent {
    const dateLine = params.confirmedDate
      ? `Confirmed date: <strong>${params.confirmedDate}</strong>.`
      : "";
    return {
      subject: `${params.statusLabel}: your inquiry to ${params.clinicName}`,
      html: layout(
        `Inquiry ${params.statusLabel.toLowerCase()}`,
        paragraphs(
          `Hi ${params.name},`,
          `<strong>${params.clinicName}</strong> updated your inquiry “${params.subject}” to <strong>${params.statusLabel}</strong>.`,
          ...(dateLine ? [dateLine] : []),
        ) + button(url(params.path), "View the conversation"),
      ),
      text: `Hi ${params.name},\n\n${params.clinicName} updated “${params.subject}” to ${params.statusLabel}.${params.confirmedDate ? ` Confirmed date: ${params.confirmedDate}.` : ""}\n${url(params.path)}`,
    };
  },
```

- [ ] **Step 5: Register the job type + handler**

In `src/modules/jobs/queue.ts`, extend the union:

```ts
export type JobType =
  | "duplicate_scan"
  | "send_email"
  | "submission_process"
  | "verification_reminder_scan"
  | "stale_listing_scan"
  | "search_document_refresh"
  | "candidate_import"
  | "inquiry_notification";
```

In `src/modules/jobs/handlers.ts`, add (uses the file-local `emailForUser` and `displayName` helpers that already exist there):

```ts
/**
 * Inquiry notifications. Payload: { inquiry_id, kind, message_id?, status? }.
 * created → all active managers; message → the side that didn't send it;
 * status → the caregiver. Honors each recipient's email_notifications pref
 * via emailForUser.
 */
async function runInquiryNotification(payload: JobPayload): Promise<void> {
  const inquiryId = String(payload.inquiry_id ?? "");
  const kind = String(payload.kind ?? "");
  if (!inquiryId || !kind) {
    throw new Error("inquiry_notification needs inquiry_id and kind");
  }
  const supabase = createSupabaseAdminClient();
  const { data: inquiry, error } = await supabase
    .from("inquiries")
    .select(
      "id, subject, status, confirmed_date, caregiver_id, clinic_id, clinics(name)",
    )
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) throw new Error(`inquiry lookup failed: ${error.message}`);
  if (!inquiry) return; // Thread deleted — nothing to notify.

  const clinicName = inquiry.clinics?.name ?? "the clinic";
  const sender = getEmailSender();
  const portalPath = `/clinic-portal/${inquiry.clinic_id}/inquiries/${inquiry.id}`;
  const accountPath = `/account/inquiries/${inquiry.id}`;

  async function notifyManagers(
    render: (name: string) => EmailContent,
  ): Promise<void> {
    const { data: managers, error: mErr } = await supabase
      .from("clinic_managers")
      .select("user_id")
      .eq("clinic_id", inquiry!.clinic_id)
      .is("revoked_at", null);
    if (mErr) throw new Error(`manager lookup failed: ${mErr.message}`);
    for (const manager of managers ?? []) {
      const to = await emailForUser(manager.user_id);
      if (!to) continue;
      const name = await displayName(manager.user_id, to);
      await sender.send({ to, ...render(name) });
    }
  }

  async function notifyCaregiver(
    render: (name: string) => EmailContent,
  ): Promise<void> {
    const to = await emailForUser(inquiry!.caregiver_id);
    if (!to) return;
    const name = await displayName(inquiry!.caregiver_id, to);
    await sender.send({ to, ...render(name) });
  }

  if (kind === "created") {
    await notifyManagers((name) =>
      emailTemplates.inquiryReceived({
        name,
        clinicName,
        subject: inquiry.subject,
        path: portalPath,
      }),
    );
    return;
  }

  if (kind === "message") {
    const messageId = String(payload.message_id ?? "");
    const { data: message, error: msgErr } = await supabase
      .from("inquiry_messages")
      .select("sender_role, body")
      .eq("id", messageId)
      .maybeSingle();
    if (msgErr) throw new Error(`message lookup failed: ${msgErr.message}`);
    if (!message) return;
    const excerpt =
      message.body.length > 120
        ? `${message.body.slice(0, 120)}…`
        : message.body;
    if (message.sender_role === "caregiver") {
      await notifyManagers((name) =>
        emailTemplates.inquiryReply({
          name,
          clinicName,
          subject: inquiry.subject,
          excerpt,
          path: portalPath,
        }),
      );
    } else {
      await notifyCaregiver((name) =>
        emailTemplates.inquiryReply({
          name,
          clinicName,
          subject: inquiry.subject,
          excerpt,
          path: accountPath,
        }),
      );
    }
    return;
  }

  if (kind === "status") {
    const statusLabels: Record<string, string> = {
      replied: "Replied",
      confirmed: "Confirmed",
      declined: "Declined",
      closed: "Closed",
    };
    const statusLabel = statusLabels[String(payload.status ?? "")] ?? "Updated";
    await notifyCaregiver((name) =>
      emailTemplates.inquiryStatusChanged({
        name,
        clinicName,
        subject: inquiry.subject,
        statusLabel,
        confirmedDate: inquiry.confirmed_date ?? undefined,
        path: accountPath,
      }),
    );
    return;
  }

  throw new Error(`unknown inquiry_notification kind: ${kind}`);
}
```

Register it in `JOB_HANDLERS`:

```ts
  candidate_import: runCandidateImport,
  inquiry_notification: runInquiryNotification,
```

- [ ] **Step 6: Run tests + typecheck, verify pass**

```bash
pnpm test -- src/modules/inquiries/notify.test.ts && pnpm typecheck
```

Expected: PASS, no type errors. Watch the `inquiry.clinics` join type — Supabase generates it as an object (FK to one row); if types come back as an array, change the select to `clinics!inner(name)` and adjust, matching how `handlers.ts` reads `clinic_managers` joins today.

- [ ] **Step 7: Commit**

```bash
git add src/modules/inquiries/notify.ts src/modules/inquiries/notify.test.ts src/modules/jobs/queue.ts src/modules/jobs/handlers.ts src/modules/shared/email/templates.ts
git commit -m "Add inquiry notification job, templates, and payload builders

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Queries

**Files:**

- Create: `src/modules/inquiries/queries.ts`
- Test: append a `describe` block to `tests/integration/inquiries-rls.test.ts`

**Interfaces:**

- Consumes: `createSupabaseServerClient` from `@/lib/supabase/server`; tables from Task 1.
- Produces (all `import "server-only"`; RLS does the scoping — callers must be signed in):
  - `clinicAcceptsInquiries(clinicId: string): Promise<boolean>`
  - `listMyInquiries(): Promise<InquiryListItem[]>` — `{ id, subject, status, createdAt, clinicName, clinicSlug, lastMessageAt, lastMessagePreview }`
  - `listClinicInquiries(clinicId: string, statusFilter?: InquiryStatus): Promise<ClinicInquiryListItem[]>` — `{ id, subject, status, preferredDate, createdAt, lastMessageAt, lastMessagePreview }`, `open` first then newest activity
  - `getInquiryThread(inquiryId: string): Promise<InquiryThread | null>` — `{ id, clinicId, clinicName, clinicSlug, subject, status, preferredDate, preferredTimeNote, confirmedDate, caregiverId, createdAt, messages: Array<{ id, senderRole, body, createdAt }> }`

- [ ] **Step 1: Write the failing integration test**

Append to `tests/integration/inquiries-rls.test.ts` (the integration config stubs `server-only`, so importing the module works):

```ts
import { clinicAcceptsInquiries } from "@/modules/inquiries/queries";
```

Wait — `queries.ts` uses `createSupabaseServerClient`, which needs Next.js `cookies()`; that does NOT run under vitest. Test the underlying data shape instead: keep `queries.ts` thin, and put the one pure piece — the list-item mapper — in a separately exported function tested here. Concretely:

```ts
describe("inquiry query shaping", () => {
  it("maps thread rows newest-message-last and previews at 80 chars", async () => {
    const { shapeThread } = await import("@/modules/inquiries/queries");
    const shaped = shapeThread({
      id: "i1",
      clinic_id: "c1",
      subject: "s",
      status: "open",
      preferred_date: null,
      preferred_time_note: null,
      confirmed_date: null,
      caregiver_id: "u1",
      created_at: "2026-08-06T00:00:00Z",
      clinics: { name: "Clinic", slug: "clinic" },
      inquiry_messages: [
        {
          id: "m2",
          sender_role: "clinic",
          body: "b",
          created_at: "2026-08-06T02:00:00Z",
        },
        {
          id: "m1",
          sender_role: "caregiver",
          body: "a",
          created_at: "2026-08-06T01:00:00Z",
        },
      ],
    });
    expect(shaped.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});
```

(If `shapeThread`'s input type makes this test awkward, type the parameter as a dedicated `ThreadRow` interface in `queries.ts` — do not use `any`.)

- [ ] **Step 2: Run, verify failure**

```bash
pnpm test:integration -- inquiries-rls
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `queries.ts`**

```ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { InquiryStatus } from "./schemas";

export interface InquiryMessageItem {
  id: string;
  senderRole: "caregiver" | "clinic";
  body: string;
  createdAt: string;
}

export interface InquiryThread {
  id: string;
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  subject: string;
  status: InquiryStatus;
  preferredDate: string | null;
  preferredTimeNote: string | null;
  confirmedDate: string | null;
  caregiverId: string;
  createdAt: string;
  messages: InquiryMessageItem[];
}

export interface InquiryListItem {
  id: string;
  subject: string;
  status: InquiryStatus;
  createdAt: string;
  clinicName: string;
  clinicSlug: string;
  lastMessageAt: string;
  lastMessagePreview: string;
}

export interface ClinicInquiryListItem {
  id: string;
  subject: string;
  status: InquiryStatus;
  preferredDate: string | null;
  createdAt: string;
  lastMessageAt: string;
  lastMessagePreview: string;
}

interface ThreadRow {
  id: string;
  clinic_id: string;
  subject: string;
  status: string;
  preferred_date: string | null;
  preferred_time_note: string | null;
  confirmed_date: string | null;
  caregiver_id: string;
  created_at: string;
  clinics: { name: string; slug: string } | null;
  inquiry_messages: Array<{
    id: string;
    sender_role: string;
    body: string;
    created_at: string;
  }>;
}

const THREAD_SELECT =
  "id, clinic_id, subject, status, preferred_date, preferred_time_note, confirmed_date, caregiver_id, created_at, clinics(name, slug), inquiry_messages(id, sender_role, body, created_at)";

function preview(body: string): string {
  return body.length > 80 ? `${body.slice(0, 80)}…` : body;
}

/** Exported for unit tests — orders messages oldest-first. */
export function shapeThread(row: ThreadRow): InquiryThread {
  const messages = [...row.inquiry_messages]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((m) => ({
      id: m.id,
      senderRole: m.sender_role as "caregiver" | "clinic",
      body: m.body,
      createdAt: m.created_at,
    }));
  return {
    id: row.id,
    clinicId: row.clinic_id,
    clinicName: row.clinics?.name ?? "Unknown clinic",
    clinicSlug: row.clinics?.slug ?? "",
    subject: row.subject,
    status: row.status as InquiryStatus,
    preferredDate: row.preferred_date,
    preferredTimeNote: row.preferred_time_note,
    confirmedDate: row.confirmed_date,
    caregiverId: row.caregiver_id,
    createdAt: row.created_at,
    messages,
  };
}

/** True when the clinic has at least one active manager. */
export async function clinicAcceptsInquiries(
  clinicId: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("clinic_managers")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .is("revoked_at", null);
  return (count ?? 0) > 0;
}

/** Caregiver dashboard: own threads, newest activity first. RLS scopes. */
export async function listMyInquiries(): Promise<InquiryListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("inquiries")
    .select(THREAD_SELECT)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as ThreadRow[]).map((row) => {
    const thread = shapeThread(row);
    const last = thread.messages[thread.messages.length - 1];
    return {
      id: thread.id,
      subject: thread.subject,
      status: thread.status,
      createdAt: thread.createdAt,
      clinicName: thread.clinicName,
      clinicSlug: thread.clinicSlug,
      lastMessageAt: last?.createdAt ?? thread.createdAt,
      lastMessagePreview: last ? preview(last.body) : "",
    };
  });
}

/** Portal inbox: one clinic's threads, open first, then newest activity. */
export async function listClinicInquiries(
  clinicId: string,
  statusFilter?: InquiryStatus,
): Promise<ClinicInquiryListItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("inquiries")
    .select(THREAD_SELECT)
    .eq("clinic_id", clinicId);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data } = await query;
  const items = ((data ?? []) as unknown as ThreadRow[]).map((row) => {
    const thread = shapeThread(row);
    const last = thread.messages[thread.messages.length - 1];
    return {
      id: thread.id,
      subject: thread.subject,
      status: thread.status,
      preferredDate: thread.preferredDate,
      createdAt: thread.createdAt,
      lastMessageAt: last?.createdAt ?? thread.createdAt,
      lastMessagePreview: last ? preview(last.body) : "",
    };
  });
  return items.sort((a, b) => {
    const aOpen = a.status === "open" ? 0 : 1;
    const bOpen = b.status === "open" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}

/** Full thread; null when RLS hides it or it doesn't exist. */
export async function getInquiryThread(
  inquiryId: string,
): Promise<InquiryThread | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("inquiries")
    .select(THREAD_SELECT)
    .eq("id", inquiryId)
    .maybeSingle();
  if (!data) return null;
  return shapeThread(data as unknown as ThreadRow);
}
```

- [ ] **Step 4: Run tests + typecheck, verify pass**

```bash
pnpm test:integration -- inquiries-rls && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/inquiries/queries.ts tests/integration/inquiries-rls.test.ts
git commit -m "Add inquiry query helpers with thread shaping

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Server actions

**Files:**

- Create: `src/modules/inquiries/actions.ts`

**Interfaces:**

- Consumes: schemas (Task 2), notify builders (Task 3), `enqueueJob`, `checkRateLimit`, `getCurrentUser` from `@/modules/auth/server`, `createSupabaseServerClient`.
- Produces:
  - `interface InquiryActionResult { error?: string; message?: string; inquiryId?: string }`
  - `createInquiryAction(raw: unknown): Promise<InquiryActionResult>`
  - `replyInquiryAction(raw: unknown): Promise<InquiryActionResult>`
  - `setInquiryStatusAction(raw: unknown): Promise<InquiryActionResult>`
  - `reportInquiryAction(raw: unknown): Promise<InquiryActionResult>`

Server actions here follow the codebase's testing pattern: schemas are unit-tested (Task 2), RPCs are integration-tested (Task 1), and the actions themselves are exercised end-to-end in Task 9 — no direct vitest coverage (they need Next request context).

- [ ] **Step 1: Implement**

Create `src/modules/inquiries/actions.ts` (pattern: `src/modules/portal/actions.ts`):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/modules/auth/server";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import { enqueueJob } from "@/modules/jobs/queue";
import {
  inquiryCreatedJob,
  inquiryMessageJob,
  inquiryStatusJob,
} from "./notify";
import {
  createInquirySchema,
  replyInquirySchema,
  reportInquirySchema,
  setInquiryStatusSchema,
} from "./schemas";

export interface InquiryActionResult {
  error?: string;
  message?: string;
  inquiryId?: string;
}

const SIGN_IN_MESSAGE = "Sign in to send inquiries.";

export async function createInquiryAction(
  raw: unknown,
): Promise<InquiryActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN_MESSAGE };

  const parsed = createInquirySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }

  const limited = await checkRateLimit("inquiry-create", user.id, 5, 86_400);
  if (!limited.allowed) {
    return {
      error: "You've sent several inquiries today. Please try again tomorrow.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: inquiryId, error } = await supabase.rpc("create_inquiry", {
    p_clinic_id: parsed.data.clinicId,
    p_subject: parsed.data.subject,
    p_preferred_date: parsed.data.preferredDate || undefined,
    p_preferred_time_note: parsed.data.preferredTimeNote || undefined,
    p_body: parsed.data.body,
  });
  if (error || !inquiryId) {
    return { error: friendlyRpcError(error?.message) };
  }

  const job = inquiryCreatedJob(inquiryId);
  await enqueueJob("inquiry_notification", job.payload, {
    idempotencyKey: job.idempotencyKey,
  });

  revalidatePath("/account/inquiries");
  return { message: "Inquiry sent.", inquiryId };
}

export async function replyInquiryAction(
  raw: unknown,
): Promise<InquiryActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN_MESSAGE };

  const parsed = replyInquirySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review your reply.",
    };
  }

  const limited = await checkRateLimit("inquiry-reply", user.id, 30, 3_600);
  if (!limited.allowed) {
    return { error: "Too many replies in a short time. Please slow down." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: messageId, error } = await supabase.rpc("reply_inquiry", {
    p_inquiry_id: parsed.data.inquiryId,
    p_body: parsed.data.body,
  });
  if (error || !messageId) {
    return { error: friendlyRpcError(error?.message) };
  }

  const job = inquiryMessageJob(parsed.data.inquiryId, messageId);
  await enqueueJob("inquiry_notification", job.payload, {
    idempotencyKey: job.idempotencyKey,
  });

  revalidatePath(`/account/inquiries/${parsed.data.inquiryId}`);
  return { message: "Reply sent." };
}

export async function setInquiryStatusAction(
  raw: unknown,
): Promise<InquiryActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN_MESSAGE };

  const parsed = setInquiryStatusSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the update.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_inquiry_status", {
    p_inquiry_id: parsed.data.inquiryId,
    p_status: parsed.data.status,
    p_confirmed_date: parsed.data.confirmedDate || undefined,
  });
  if (error) return { error: friendlyRpcError(error.message) };

  // status_changed_at was just stamped by the RPC; read it back for the
  // idempotency key so retries of THIS transition dedupe.
  const { data: row } = await supabase
    .from("inquiries")
    .select("status_changed_at")
    .eq("id", parsed.data.inquiryId)
    .maybeSingle();
  const job = inquiryStatusJob(
    parsed.data.inquiryId,
    parsed.data.status,
    row?.status_changed_at ?? new Date().toISOString(),
  );
  await enqueueJob("inquiry_notification", job.payload, {
    idempotencyKey: job.idempotencyKey,
  });

  revalidatePath(`/account/inquiries/${parsed.data.inquiryId}`);
  return { message: "Status updated." };
}

export async function reportInquiryAction(
  raw: unknown,
): Promise<InquiryActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN_MESSAGE };

  const parsed = reportInquirySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the report.",
    };
  }

  const limited = await checkRateLimit("report", user.id, 5, 86_400);
  if (!limited.allowed) {
    return { error: "Too many reports today. Please try again tomorrow." };
  }

  const supabase = await createSupabaseServerClient();
  // The thread's clinic id — visible only to participants under RLS, so
  // this doubles as the participation check.
  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("clinic_id")
    .eq("id", parsed.data.inquiryId)
    .maybeSingle();
  if (!inquiry) return { error: "Conversation not found." };

  const { error } = await supabase.from("clinic_reports").insert({
    clinic_id: inquiry.clinic_id,
    inquiry_id: parsed.data.inquiryId,
    reported_by: user.id,
    report_type: parsed.data.reportType,
    details: parsed.data.details || null,
  });
  if (error) return { error: "Could not submit the report. Please retry." };

  return { message: "Report submitted. Our moderators will review it." };
}

function friendlyRpcError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (message.includes("not accepting inquiries")) {
    return "This clinic isn't accepting inquiries yet.";
  }
  if (message.includes("conversation is closed")) {
    return "This conversation is closed.";
  }
  if (message.includes("needs a date")) {
    return "Pick a date before confirming.";
  }
  if (message.includes("not authorized")) {
    return "You don't have access to this conversation.";
  }
  return "Something went wrong. Please try again.";
}
```

Check one thing before finishing: whether `clinic_reports` has an INSERT RLS policy and grant that allows a signed-in user to insert a row with `inquiry_id` set (migration 6 line ~223 allows `reported_by = auth.uid()`; migration 8 grants insert on `clinic_reports`). The new column rides the existing policy — nothing to change. If `pnpm typecheck` flags the `.rpc("create_inquiry")` param types as requiring `null` instead of `undefined` for optional args, pass `?? null` accordingly — match what `src/lib/database.types.ts` generated.

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/modules/inquiries/actions.ts
git commit -m "Add inquiry server actions with rate limits and notifications

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Caregiver UI — clinic CTA, account list, thread view

**Files:**

- Create: `src/modules/inquiries/components/InquiryCta.tsx` (client)
- Create: `src/modules/inquiries/components/InquiryThreadView.tsx` (client — shared by caregiver and portal)
- Create: `src/modules/inquiries/components/ReportInquiryDialog.tsx` (client)
- Create: `src/app/account/inquiries/page.tsx`
- Create: `src/app/account/inquiries/[inquiryId]/page.tsx`
- Modify: `src/app/account/layout.tsx` (nav item)
- Modify: `src/app/clinics/[slug]/page.tsx` (render CTA)

**Interfaces:**

- Consumes: `createInquiryAction`, `replyInquiryAction`, `reportInquiryAction` (Task 5); `clinicAcceptsInquiries`, `listMyInquiries`, `getInquiryThread` (Task 4); `INQUIRY_STATUS_LABELS` (Task 2); ui kit from `@/components/ui/*`; toasts via the sonner setup already in `providers.tsx` (`import { toast } from "sonner"` — check how existing forms fire toasts and copy that import).
- Produces: `InquiryThreadView` props — `{ thread: InquiryThread; viewer: "caregiver" | "clinic"; children?: React.ReactNode }` (children = portal status controls slot, used in Task 7).

Design language: Warm Horizon (Fraunces display + Nunito Sans body already global). Status chips reuse `Badge`. Message bubbles: caregiver right-aligned `bg-primary/10`, clinic left-aligned `bg-card border`. No new fonts, no new colors — use existing CSS variables/tokens only.

- [ ] **Step 1: Build `InquiryCta`**

Client component. Props: `{ clinicId: string; clinicName: string; clinicSlug: string; accepts: boolean; signedIn: boolean }`. Renders a `Card` titled "Contact this clinic":

- `signedIn && accepts` → button "Send an inquiry" opening a `Dialog` (from `@/components/ui/dialog`) with a form: subject (`Input`), message (`Textarea`), preferred date (**native** `<input type="date" name="preferredDate">` styled with the input classes), time note (`Input`, placeholder "e.g. weekday mornings"). Submit calls `createInquiryAction`; on success toast the message and `router.push(\`/account/inquiries/${result.inquiryId}\`)`; on error toast destructive.
- `signedIn && !accepts` → muted text: "This clinic hasn't been claimed yet, so it can't receive inquiries." plus a `Link` to `/clinics/[slug]/claim` labeled "Represent this clinic? Claim it." (pass `clinicSlug` as an extra prop for the link).
- `!signedIn` → text + `Link` to `/login` ("Sign in to send an inquiry").

Form state: `useState` per field + a pending flag, matching the simplest existing client form in the codebase (see `src/app/clinics/[slug]/report/` for the closest precedent — copy its action-calling pattern). Base UI rule: `render={<Link …/>}`, never `asChild`.

- [ ] **Step 2: Wire the CTA into the clinic page**

In `src/app/clinics/[slug]/page.tsx`, locate where sidebar cards render (contact info block). Add:

```tsx
const acceptsInquiries = await clinicAcceptsInquiries(clinic.id);
const user = await getCurrentUser();
```

(check what the page already fetches — it likely already has the user; reuse, don't duplicate) and render:

```tsx
<InquiryCta
  clinicId={clinic.id}
  clinicName={clinic.name}
  clinicSlug={clinic.slug}
  accepts={acceptsInquiries}
  signedIn={Boolean(user)}
/>
```

- [ ] **Step 3: Build `InquiryThreadView` + `ReportInquiryDialog`**

`InquiryThreadView` (client): renders status banner (`Badge` with `INQUIRY_STATUS_LABELS[thread.status]`, plus "Confirmed for {confirmedDate}" line when set, plus preferred date/time note line when present), the message list (bubbles as specified above, `aria-label` per sender), a reply `Textarea` + submit calling `replyInquiryAction` — hidden when `thread.status` is `declined` or `closed`, replaced by "This conversation is closed." — and an overflow `DropdownMenu` with "Report this conversation" opening `ReportInquiryDialog`. `children` renders between banner and messages (portal status controls). After a successful reply call `router.refresh()`.

`ReportInquiryDialog` (client): native `<select>` of report types (labels from the `REPORT_LABELS` map pattern in `src/app/account/reports/page.tsx` — import-or-copy; prefer exporting a shared const from `src/modules/inquiries/components/report-labels.ts` if importing from a page file is ugly), `Textarea` details, disclosure line: "Reporting shares this conversation with our moderators." Submits `reportInquiryAction`; toast result.

- [ ] **Step 4: Account pages + nav**

`src/app/account/inquiries/page.tsx` (RSC, pattern: `src/app/account/reports/page.tsx`): `requireUser()`, `listMyInquiries()`, render `Card` per item: subject, clinic name (link to `/clinics/[clinicSlug]`), status `Badge`, `lastMessagePreview`, relative date; whole card links to `/account/inquiries/[id]`. Empty state: "No inquiries yet. Find a clinic and send one." linking `/clinics`.

`src/app/account/inquiries/[inquiryId]/page.tsx` (RSC): `requireUser()`, `getInquiryThread(inquiryId)`; `notFound()` when null; render `<InquiryThreadView thread={thread} viewer="caregiver" />`.

Nav: in `src/app/account/layout.tsx` add `{ href: "/account/inquiries", label: "Inquiries" }` after Favorites.

- [ ] **Step 5: Verify in the browser**

```bash
# dev server via the preview tooling (never Bash) — then:
```

Sign in as `caregiver@thrivemap.test` / `password123`, open a claimed clinic (one managed by clinicrep@ — find via the portal or seed), send an inquiry, confirm redirect to the thread, reply, check `/account/inquiries` list renders. Check an unclaimed clinic shows the claim hint. Check signed-out state shows the sign-in prompt. Trap: verify flows via Playwright/manual browser if the preview pane misbehaves (`read_page` "(empty page)" flakiness).

- [ ] **Step 6: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/modules/inquiries/components src/app/account/inquiries src/app/account/layout.tsx src/app/clinics/[slug]/page.tsx
git commit -m "Add caregiver inquiry UI: clinic CTA, account list, thread view

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Portal UI — inbox + status controls

**Files:**

- Create: `src/modules/inquiries/components/InquiryStatusControls.tsx` (client)
- Create: `src/app/clinic-portal/[clinicId]/inquiries/page.tsx`
- Create: `src/app/clinic-portal/[clinicId]/inquiries/[inquiryId]/page.tsx`
- Modify: `src/app/clinic-portal/[clinicId]/layout.tsx` (nav item)

**Interfaces:**

- Consumes: `listClinicInquiries`, `getInquiryThread` (Task 4); `setInquiryStatusAction`, `replyInquiryAction` (Task 5); `InquiryThreadView` (Task 6); the portal's existing manager guard — check how `src/app/clinic-portal/[clinicId]/profile/page.tsx` verifies access and copy that exact pattern.
- Produces: nothing consumed later.

- [ ] **Step 1: Nav item**

In `src/app/clinic-portal/[clinicId]/layout.tsx`, add to `sections`:

```ts
  { segment: "inquiries", label: "Inquiries" },
```

- [ ] **Step 2: Inbox page**

`src/app/clinic-portal/[clinicId]/inquiries/page.tsx` (RSC). Access guard: same as the sibling portal pages (copy from `profile/page.tsx`). Status filter via `searchParams` (`?status=open` etc.) rendered as `Link` pills (native links, not JS tabs — Playwright-friendly): All / Awaiting reply / Replied / Confirmed / Declined / Closed. Call `listClinicInquiries(clinicId, statusFilter)`. Rows: subject, status `Badge`, preferred date when set, `lastMessagePreview`, last-activity date; row links to `./inquiries/[id]`. Empty state: "No inquiries yet."

- [ ] **Step 3: Thread page + status controls**

`InquiryStatusControls` (client). Props: `{ inquiryId: string; status: InquiryStatus; preferredDate: string | null }`. Uses `canTransition` to decide what to render; nothing when status is terminal. Buttons:

- "Confirm" → inline row with **native** `<input type="date">` defaulting to `preferredDate ?? ""` + "Confirm date" submit → `setInquiryStatusAction({ inquiryId, status: "confirmed", confirmedDate })`
- "Decline" → `setInquiryStatusAction({ inquiryId, status: "declined" })` behind a one-step confirm (button turns into "Really decline?" on first click — no dialog needed)
- "Close" → same pattern as Decline
  Toast results; `router.refresh()` on success.

Thread page `src/app/clinic-portal/[clinicId]/inquiries/[inquiryId]/page.tsx` (RSC): guard, `getInquiryThread`, `notFound()` when null or `thread.clinicId !== clinicId`, then:

```tsx
<InquiryThreadView thread={thread} viewer="clinic">
  <InquiryStatusControls
    inquiryId={thread.id}
    status={thread.status}
    preferredDate={thread.preferredDate}
  />
</InquiryThreadView>
```

- [ ] **Step 4: Verify in the browser**

As `clinicrep@thrivemap.test`: portal → managed clinic → Inquiries tab shows the thread from Task 6's manual test; reply; Confirm with date; check status banner updates. As caregiver: `/account/inquiries/[id]` shows the reply + Confirmed banner. Tick the job queue and check the dev-adapter email log lines appear:

```bash
curl -X POST -H "x-jobs-secret: $JOBS_PROCESSOR_SECRET" http://localhost:<preview-port>/api/internal/jobs/process
```

(secret from `.env.local`).

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/app/clinic-portal/[clinicId]/inquiries src/app/clinic-portal/[clinicId]/layout.tsx src/modules/inquiries/components/InquiryStatusControls.tsx
git commit -m "Add clinic portal inquiry inbox and status controls

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Admin — reported-thread view

**Files:**

- Modify: the admin reports UI — find it first: `src/app/admin/reports/page.tsx` and whatever component renders a single report (grep `clinic_reports` under `src/app/admin` and `src/modules/admin`). Add the thread panel where report details render.
- Modify: `src/modules/admin/server.ts` (add `getReportedInquiryThread`)

**Interfaces:**

- Consumes: RPC `get_reported_inquiry_thread` (Task 1).
- Produces: `getReportedInquiryThread(reportId: string)` in `src/modules/admin/server.ts` returning `{ inquiry: { id: string; subject: string; status: string; created_at: string }; messages: Array<{ id: string; sender_role: string; body: string; created_at: string }> } | null`.

- [ ] **Step 1: Server query**

In `src/modules/admin/server.ts`, following the file's existing style:

```ts
export interface ReportedInquiryThread {
  inquiry: { id: string; subject: string; status: string; created_at: string };
  messages: Array<{
    id: string;
    sender_role: string;
    body: string;
    created_at: string;
  }>;
}

/** Thread behind an inquiry report — the only admin read path (RPC-gated). */
export async function getReportedInquiryThread(
  reportId: string,
): Promise<ReportedInquiryThread | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_reported_inquiry_thread", {
    p_report_id: reportId,
  });
  if (error || !data) return null;
  return data as unknown as ReportedInquiryThread;
}
```

- [ ] **Step 2: Render in the reports queue**

In the admin reports list/detail (found in Step 0 grep): where a report's `details` show, when the report row has `inquiry_id`, fetch `getReportedInquiryThread(report.id)` and render a bordered panel: "Reported conversation" heading, subject + status line, then each message as `[caregiver] / [clinic]` prefix + body + timestamp, read-only. Update the reports query in `src/modules/admin/server.ts` to also select `inquiry_id` so the page knows when to fetch.

- [ ] **Step 3: Verify manually**

Report a thread from the caregiver thread view (Task 6 UI), sign in as `moderator@thrivemap.test`, open `/admin/reports`, confirm the conversation panel renders. Confirm a non-inquiry report renders unchanged.

- [ ] **Step 4: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/modules/admin/server.ts src/app/admin/reports
git commit -m "Show reported inquiry threads in the admin reports queue

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: End-to-end coverage

**Files:**

- Create: `e2e/inquiries.spec.ts`

**Interfaces:**

- Consumes: everything; demo accounts; service-role client pattern from `e2e/places-import.spec.ts` (copy its supabase client setup + DB-polling helpers).

- [ ] **Step 1: Write the spec**

Chromium-only (mutates shared demo accounts), idempotent (cleans own threads first by subject marker `[e2e]`), signs in via the same login helper the other specs use (read `e2e/caregiver-flows.spec.ts` first and reuse its sign-in helper/pattern exactly).

```ts
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.describe("inquiries", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "shared accounts");

  const SUBJECT = "[e2e] Assessment availability";

  // Service client + cleanup: copy the constants/helpers from
  // e2e/places-import.spec.ts (SUPABASE_URL, SERVICE_KEY).
  test.beforeEach(async () => {
    const service = serviceClient();
    const { data } = await service
      .from("inquiries")
      .select("id")
      .like("subject", "[e2e]%");
    const ids = (data ?? []).map((r) => r.id);
    if (ids.length) {
      await service.from("clinic_reports").delete().in("inquiry_id", ids);
      await service.from("inquiries").delete().in("id", ids);
    }
  });

  test("caregiver sends, rep replies and confirms, caregiver sees outcome", async ({
    page,
  }) => {
    // 1. Find the clinic clinicrep@ manages (service client, same lookup as
    //    the integration test's managedClinicId — inline it here).
    // 2. Sign in as caregiver@, go to /clinics/<slug>, click "Send an inquiry",
    //    fill subject SUBJECT, body, preferred date, submit.
    // 3. Expect redirect to /account/inquiries/<id>; thread shows the message.
    // 4. Poll the DB until the inquiry row exists with status 'open'.
    // 5. Sign out; sign in as clinicrep@; open
    //    /clinic-portal/<clinicId>/inquiries — row with SUBJECT visible.
    // 6. Open the thread, type a reply, submit; expect the bubble to render.
    // 7. Click Confirm, keep the defaulted date, submit; expect the
    //    Confirmed badge.
    // 8. Poll the DB: inquiries row status === 'confirmed',
    //    confirmed_date not null.
    // 9. Sign out; sign in as caregiver@; open the thread: reply bubble +
    //    "Confirmed" banner visible.
    // 10. Poll the DB for the notification jobs:
    //     expect.poll(async () => countJobs("inquiry_notification",
    //       "completed")).toBeGreaterThanOrEqual(3)
    //     — scoped by payload->>'inquiry_id' = our id, NOT the whole table.
  });

  test("closed thread hides the reply box", async ({ page }) => {
    // Create a thread via service client RPC-equivalent inserts (status
    // 'closed' directly), sign in as caregiver@, open it, expect
    // "This conversation is closed." and no textarea.
  });

  test("unclaimed clinic shows the claim hint", async ({ page }) => {
    // Find an unclaimed published clinic via service client, visit its page
    // signed in as caregiver@, expect the "hasn't been claimed" text and no
    // inquiry button.
  });
});
```

Flesh the comments into real steps — every selector should target accessible names/labels (`getByRole("button", { name: "Send an inquiry" })` etc.), not CSS classes. For the job tick inside e2e: POST to `/api/internal/jobs/process` with header `x-jobs-secret` read from `process.env.JOBS_PROCESSOR_SECRET` (Playwright config loads `.env.local` the same way the places-import spec gets its secrets — copy that mechanism).

- [ ] **Step 2: Run it**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:<preview-port> pnpm test:e2e -- inquiries
```

Traps: port 3000 squatter (another app answers there — always pass `PLAYWRIGHT_BASE_URL` for the preview server); restart the dev server first if sign-ins start timing out (rate limiter accumulation).
Expected: 3 passed (chromium), skipped on mobile project.

- [ ] **Step 3: Full suite**

```bash
pnpm test && pnpm test:integration
PLAYWRIGHT_BASE_URL=http://localhost:<preview-port> pnpm test:e2e
```

Expected: everything green; the 6 pre-existing by-design skips remain.

- [ ] **Step 4: Commit**

```bash
git add e2e/inquiries.spec.ts
git commit -m "Add end-to-end coverage for the inquiries flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Documentation + final verification

**Files:**

- Modify: `docs/architecture/jobs.md` (document `inquiry_notification`: payload shape, idempotency keys, recipient rules — mirror the `candidate_import` section's format)
- Modify: `docs/phase-2-plan.md` (feature 3: one-line note that inquiry-only shipped 2026-08-06, spec/plan paths)
- Check: `docs/operations/deployment.md` and `docs/architecture/dev-adapters.md` need NO changes (no new env vars, no new adapters) — verify, don't edit blindly.

- [ ] **Step 1: Write the doc updates**

- [ ] **Step 2: Final verification (all of it, fresh)**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm build
```

Then restart the dev server and:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:<preview-port> pnpm test:e2e
```

Expected: all green, prod build clean.

- [ ] **Step 3: Commit + push**

```bash
git add docs/
git commit -m "Document the inquiries feature and notification job

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```
