# Therapist Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clinic managers list their care team on the clinic profile; therapist names/professions/specialties feed clinic search.

**Architecture:** Single per-clinic satellite table `clinic_therapists` (like `clinic_hours`), RLS-guarded direct writes from server actions in a new `src/modules/therapists/` module, therapist text folded into the existing weighted clinic search vector via the existing trigger pattern. Public "Care team" section on the clinic page; "Team" tab in the clinic portal.

**Tech Stack:** Next.js 16 (App Router, breaking changes — read `node_modules/next/dist/docs/` before writing app-router code), Supabase (local), zod, Base UI shadcn components, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-07-therapist-profiles-design.md`

## Global Constraints

- Spec deviation (deliberate, decided at planning): no `src/modules/therapists/queries.ts`. Therapist rows ride the existing selects — `getClinicBySlug` (public, cached) and `requireManagedClinic` (portal). Sort by `display_order` in JS like `clinic_hours` does.
- Therapist writes are **always direct** (no `canEditDirectly` change-request split) — spec locked "live immediately, report-based". Do not route through `clinic_change_requests`.
- No security-definer RPCs; plain table writes under RLS.
- shadcn here is **Base UI, not Radix**: no `asChild`, use `render={<Link …/>}`; `DropdownMenuLabel` needs `DropdownMenuGroup` ancestor.
- zod schemas used with zodResolver must NOT use `.coerce` or `.default()`.
- New tables/functions need explicit grants (Supabase hardened defaults; migrations 8/17/18 precedent).
- Test data markers: `[itest]` (integration) and `[e2e]` (e2e) prefixes on `full_name`; clean up own rows up front by marker.
- e2e: chromium-only for shared-account mutations via `testInfo.project.name !== "chromium"` (NOT `browserName`).
- Demo logins (password `password123`): `clinicrep@thrivemap.test` (manages one clinic), `caregiver@thrivemap.test`, `admin@thrivemap.test`.
- Copy style: user-facing copy is warm, plain English (see existing portal copy).
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Migration 19 — table, RLS, grants, search integration

**Files:**

- Create: `supabase/migrations/20260807000019_clinic_therapists.sql`
- Create: `tests/integration/therapists-rls.test.ts`
- Modify: `src/lib/database.types.ts` (regenerated, not hand-edited)

**Interfaces:**

- Produces: table `public.clinic_therapists` (columns below), search vector containing therapist names (weight B) and profession+specialties (weight C). Later tasks rely on column names exactly: `id, clinic_id, full_name, credentials, profession, specialties, bio, photo_path, display_order, created_at, updated_at`.

- [ ] **Step 1: Write the failing integration test**

`tests/integration/therapists-rls.test.ts` (mirror the client helpers at the top of `tests/integration/rls.test.ts`):

```ts
import { createClient } from "@supabase/supabase-js";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function anonClient() {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
}

function serviceClient() {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
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

const MARKER = "[itest] Therapist";

async function cleanup() {
  await serviceClient()
    .from("clinic_therapists")
    .delete()
    .like("full_name", "[itest]%");
}

/** The clinic the signed-in rep manages (active grant). */
async function managedClinicId(
  rep: Awaited<ReturnType<typeof signedInClient>>,
) {
  const { data: me } = await rep.auth.getUser();
  const { data: grant } = await rep
    .from("clinic_managers")
    .select("clinic_id")
    .eq("user_id", me.user!.id)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (!grant) throw new Error("seed data: clinicrep@ manages no clinic");
  return grant.clinic_id;
}

beforeAll(async () => {
  const { error } = await anonClient().from("services").select("id").limit(1);
  if (error) throw new Error(`Supabase local not reachable: ${error.message}`);
  await cleanup();
});

afterAll(cleanup);

describe("clinic_therapists RLS", () => {
  it("manager can insert, update, and delete rows for their clinic", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const clinicId = await managedClinicId(rep);

    const { data: inserted, error: insertError } = await rep
      .from("clinic_therapists")
      .insert({
        clinic_id: clinicId,
        full_name: `${MARKER} Crud`,
        profession: "Occupational Therapist",
        specialties: ["Sensory integration"],
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const { error: updateError } = await rep
      .from("clinic_therapists")
      .update({ bio: "Updated bio." })
      .eq("id", inserted!.id);
    expect(updateError).toBeNull();

    const { error: deleteError } = await rep
      .from("clinic_therapists")
      .delete()
      .eq("id", inserted!.id);
    expect(deleteError).toBeNull();
  });

  it("non-manager cannot insert for someone else's clinic", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const clinicId = await managedClinicId(rep);
    const caregiver = await signedInClient("caregiver@thrivemap.test");

    const { error } = await caregiver.from("clinic_therapists").insert({
      clinic_id: clinicId,
      full_name: `${MARKER} Intruder`,
      profession: "Speech Therapist",
    });
    expect(error).not.toBeNull();
  });

  it("anon can read rows on a published clinic but cannot write", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const clinicId = await managedClinicId(rep);
    await rep.from("clinic_therapists").insert({
      clinic_id: clinicId,
      full_name: `${MARKER} Public`,
      profession: "Developmental Pediatrician",
    });

    const anon = anonClient();
    const { data } = await anon
      .from("clinic_therapists")
      .select("full_name")
      .eq("clinic_id", clinicId)
      .like("full_name", "[itest]%");
    expect(data?.some((r) => r.full_name === `${MARKER} Public`)).toBe(true);

    const { error } = await anon.from("clinic_therapists").insert({
      clinic_id: clinicId,
      full_name: `${MARKER} Anon`,
      profession: "Speech Therapist",
    });
    expect(error).not.toBeNull();
  });

  it("rejects a blank name via check constraint", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const clinicId = await managedClinicId(rep);
    const { error } = await rep.from("clinic_therapists").insert({
      clinic_id: clinicId,
      full_name: " ",
      profession: "Speech Therapist",
    });
    expect(error).not.toBeNull();
  });
});

describe("clinic_therapists search integration", () => {
  it("adding a therapist makes the clinic findable by profession, and deleting removes it", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const clinicId = await managedClinicId(rep);
    const anon = anonClient();

    // Unique term unlikely to appear in seed data.
    const { data: inserted } = await rep
      .from("clinic_therapists")
      .insert({
        clinic_id: clinicId,
        full_name: `${MARKER} Searchable`,
        profession: "Hippotherapy Specialist",
        specialties: ["Aquatic therapy"],
      })
      .select("id")
      .single();

    const { data: hits, error } = await anon.rpc("search_clinics", {
      p_query: "hippotherapy",
    });
    expect(error).toBeNull();
    expect(hits?.some((h) => h.id === clinicId)).toBe(true);

    const { data: nameHits } = await anon.rpc("search_clinics", {
      p_query: "searchable",
    });
    expect(nameHits?.some((h) => h.id === clinicId)).toBe(true);

    await rep.from("clinic_therapists").delete().eq("id", inserted!.id);
    const { data: afterDelete } = await anon.rpc("search_clinics", {
      p_query: "hippotherapy",
    });
    expect(afterDelete?.some((h) => h.id === clinicId)).toBe(false);
  });
});
```

Note: check `search_clinics` result column names in `src/lib/database.types.ts` after regenerating — if the row type exposes `clinic_id` instead of `id`, adjust the assertions.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- therapists-rls`
Expected: FAIL — `relation "public.clinic_therapists" does not exist` (or type errors; either proves the table is missing).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260807000019_clinic_therapists.sql`:

```sql
-- ThriveMap: clinic care team (therapist profiles).
-- Per-clinic rows owned by the clinic (no shared therapist identity).
-- Spec: docs/superpowers/specs/2026-08-07-therapist-profiles-design.md

create table public.clinic_therapists (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  full_name text not null
    check (char_length(btrim(full_name)) between 2 and 120),
  credentials text
    check (credentials is null or char_length(credentials) <= 80),
  profession text not null
    check (char_length(btrim(profession)) between 1 and 80),
  specialties text[] not null default '{}'
    check (coalesce(array_length(specialties, 1), 0) <= 10),
  bio text
    check (bio is null or char_length(bio) <= 1000),
  photo_path text,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clinic_therapists_clinic_idx
  on public.clinic_therapists (clinic_id, display_order);

create trigger clinic_therapists_updated_at
  before update on public.clinic_therapists
  for each row execute function public.set_updated_at();

-- RLS: same shape as the other clinic satellite tables (migration 6).
alter table public.clinic_therapists enable row level security;
create policy "clinic_therapists: read" on public.clinic_therapists
  for select using (public.clinic_readable_or_managed(clinic_id));
create policy "clinic_therapists: manage" on public.clinic_therapists
  for all using (public.clinic_managed_or_admin(clinic_id))
  with check (public.clinic_managed_or_admin(clinic_id));

-- Grants: hardened defaults mean new tables get nothing implicit
-- (migration 8 precedent). RLS remains the row-level gate.
grant select on public.clinic_therapists to anon, authenticated;
grant insert, update, delete on public.clinic_therapists to authenticated;
grant all on public.clinic_therapists to service_role;

-- Search: therapist names join weight B (with locations); professions and
-- specialties join weight C (with services). Full function body replaced —
-- weights are now: A = name + aliases, B = locations + therapist names,
-- C = services + therapist professions/specialties, D = description.
create or replace function public.refresh_clinic_search_document(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clinic public.clinics%rowtype;
  v_location_text text;
  v_service_text text;
  v_therapist_names text;
  v_therapist_focus text;
  v_vector tsvector;
begin
  select * into v_clinic from public.clinics where id = p_clinic_id;
  if not found then
    delete from public.clinic_search_documents where clinic_id = p_clinic_id;
    return;
  end if;

  select string_agg(concat_ws(' ', barangay, city, province, postal_code), ' ')
    into v_location_text
  from public.clinic_locations
  where clinic_id = p_clinic_id;

  select string_agg(s.name, ' ')
    into v_service_text
  from public.clinic_services cs
  join public.services s on s.id = cs.service_id
  where cs.clinic_id = p_clinic_id;

  select string_agg(full_name, ' ')
    into v_therapist_names
  from public.clinic_therapists
  where clinic_id = p_clinic_id;

  select string_agg(concat_ws(' ', profession, array_to_string(specialties, ' ')), ' ')
    into v_therapist_focus
  from public.clinic_therapists
  where clinic_id = p_clinic_id;

  v_vector :=
    setweight(to_tsvector('simple', coalesce(v_clinic.name, '') || ' ' || array_to_string(v_clinic.aliases, ' ')), 'A') ||
    setweight(to_tsvector('simple', concat_ws(' ', coalesce(v_location_text, ''), coalesce(v_therapist_names, ''))), 'B') ||
    setweight(to_tsvector('simple', concat_ws(' ', coalesce(v_service_text, ''), coalesce(v_therapist_focus, ''))), 'C') ||
    setweight(to_tsvector('english', coalesce(v_clinic.description, '')), 'D');

  insert into public.clinic_search_documents (clinic_id, search_vector, name_normalized, refreshed_at)
  values (p_clinic_id, v_vector, lower(v_clinic.name), now())
  on conflict (clinic_id) do update
    set search_vector = excluded.search_vector,
        name_normalized = excluded.name_normalized,
        refreshed_at = excluded.refreshed_at;
end;
$$;

create trigger clinic_therapists_search_refresh
  after insert or update or delete on public.clinic_therapists
  for each row execute function public.trg_refresh_clinic_search();
```

No backfill: the table starts empty, and documents refresh as rows appear. `refresh_clinic_search_document` already had explicit function grants/revokes handled when first created; `create or replace` preserves them.

- [ ] **Step 4: Apply the migration and regenerate types**

```bash
pnpm db:reset
pnpm db:types
```

`db:reset` replays all migrations + seed; expect it to finish without error. `db:types` rewrites `src/lib/database.types.ts` — verify `clinic_therapists` appears in the diff (`git diff --stat src/lib/database.types.ts`).

- [ ] **Step 5: Run the integration test to verify it passes**

Run: `pnpm test:integration -- therapists-rls`
Expected: PASS (all 5 tests). Also run the untouched suites to catch regressions: `pnpm test:integration` — all pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260807000019_clinic_therapists.sql src/lib/database.types.ts tests/integration/therapists-rls.test.ts
git commit -m "feat: clinic_therapists table, RLS, and search integration (migration 19)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Therapist schemas (zod) + unit tests

**Files:**

- Create: `src/modules/therapists/schemas.ts`
- Test: `src/modules/therapists/schemas.test.ts`

**Interfaces:**

- Produces: `therapistInputSchema` (zod object; input `{ full_name: string; credentials?: string; profession: string; specialties: string[]; bio?: string }` — output has trimmed strings), `moveTherapistSchema` (`{ therapist_id: string (uuid); direction: "up" | "down" }`), `therapistPhotoSchema` (`{ therapist_id: string (uuid); storage_path: string }`), and type `TherapistInput = z.infer<typeof therapistInputSchema>`.

- [ ] **Step 1: Write the failing tests**

`src/modules/therapists/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { moveTherapistSchema, therapistInputSchema } from "./schemas";

describe("therapistInputSchema", () => {
  const valid = {
    full_name: "Maria Santos",
    credentials: "OTRP",
    profession: "Occupational Therapist",
    specialties: ["Sensory integration", "Fine motor skills"],
    bio: "Ten years of pediatric practice.",
  };

  it("accepts a full valid input and trims strings", () => {
    const parsed = therapistInputSchema.parse({
      ...valid,
      full_name: "  Maria Santos  ",
      specialties: [" Sensory integration "],
    });
    expect(parsed.full_name).toBe("Maria Santos");
    expect(parsed.specialties).toEqual(["Sensory integration"]);
  });

  it("accepts minimal input (name + profession only)", () => {
    const parsed = therapistInputSchema.parse({
      full_name: "Jo Cruz",
      profession: "Speech Therapist",
      specialties: [],
    });
    expect(parsed.credentials).toBeUndefined();
    expect(parsed.bio).toBeUndefined();
  });

  it("rejects a too-short name after trimming", () => {
    expect(
      therapistInputSchema.safeParse({
        ...valid,
        full_name: " A ",
      }).success,
    ).toBe(false);
  });

  it("rejects more than 10 specialties", () => {
    expect(
      therapistInputSchema.safeParse({
        ...valid,
        specialties: Array.from({ length: 11 }, (_, i) => `Specialty ${i}`),
      }).success,
    ).toBe(false);
  });

  it("rejects an empty specialty chip", () => {
    expect(
      therapistInputSchema.safeParse({ ...valid, specialties: ["  "] }).success,
    ).toBe(false);
  });

  it("rejects a bio over 1000 characters", () => {
    expect(
      therapistInputSchema.safeParse({ ...valid, bio: "x".repeat(1001) })
        .success,
    ).toBe(false);
  });
});

describe("moveTherapistSchema", () => {
  it("accepts up/down with a uuid", () => {
    expect(
      moveTherapistSchema.safeParse({
        therapist_id: "6f0d8f6e-2f5b-4d5f-9b6a-0e6a2b1c3d4e",
        direction: "down",
      }).success,
    ).toBe(true);
  });

  it("rejects other directions", () => {
    expect(
      moveTherapistSchema.safeParse({
        therapist_id: "6f0d8f6e-2f5b-4d5f-9b6a-0e6a2b1c3d4e",
        direction: "sideways",
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/modules/therapists`
Expected: FAIL — cannot resolve `./schemas`.

- [ ] **Step 3: Write the schemas**

`src/modules/therapists/schemas.ts`:

```ts
import { z } from "zod";

// NOTE: consumed by react-hook-form's zodResolver — no .coerce / .default().
const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} is too short.`)
    .max(max, `${label} is too long.`);

export const therapistInputSchema = z.object({
  full_name: trimmed(2, 120, "Name"),
  credentials: z
    .string()
    .trim()
    .max(80, "Credentials are too long.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  profession: trimmed(1, 80, "Profession"),
  specialties: z
    .array(trimmed(1, 60, "Specialty"))
    .max(10, "List up to 10 specialties."),
  bio: z
    .string()
    .trim()
    .max(1000, "Bio is too long (1000 characters max).")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type TherapistInput = z.infer<typeof therapistInputSchema>;

export const moveTherapistSchema = z.object({
  therapist_id: z.string().uuid(),
  direction: z.enum(["up", "down"]),
});

export const therapistPhotoSchema = z.object({
  therapist_id: z.string().uuid(),
  storage_path: z.string().min(1).max(400),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/modules/therapists`
Expected: PASS (8 tests). Also `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add src/modules/therapists/schemas.ts src/modules/therapists/schemas.test.ts
git commit -m "feat: therapist input schemas

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Server actions

**Files:**

- Create: `src/modules/therapists/actions.ts`
- Modify: `src/modules/portal/server.ts` (export the manager-access guard)
- Modify: `src/modules/portal/actions.ts` (import the moved guard)

**Interfaces:**

- Consumes: `therapistInputSchema`, `moveTherapistSchema`, `therapistPhotoSchema` from Task 2; `clinic_therapists` table from Task 1.
- Produces (all return `Promise<TherapistActionResult>` where `TherapistActionResult = { error?: string; message?: string }`):
  - `createTherapist(clinicId: string, raw: unknown)`
  - `updateTherapist(clinicId: string, therapistId: string, raw: unknown)`
  - `deleteTherapist(clinicId: string, therapistId: string)`
  - `moveTherapist(clinicId: string, raw: unknown)` (raw parsed with `moveTherapistSchema`)
  - `setTherapistPhoto(clinicId: string, raw: unknown)` (raw parsed with `therapistPhotoSchema`)
  - `removeTherapistPhoto(clinicId: string, therapistId: string)`
  - Also produces `requireManagerAccess(clinicId)` exported from `src/modules/portal/server.ts`.

- [ ] **Step 1: Move `requireManagerAccess` into portal/server.ts**

Cut the private `requireManagerAccess` function from `src/modules/portal/actions.ts` (lines ~21–47) and add it to `src/modules/portal/server.ts` as an export, unchanged except for the `export` keyword and imports (`getCurrentUser` from `@/modules/auth/server`, `createSupabaseServerClient` already imported there):

```ts
/**
 * Guard for portal server actions: signed-in user with an active manager
 * grant on the clinic. Returns { error } instead of throwing/404 so actions
 * can surface the message in the form.
 */
export async function requireManagerAccess(clinicId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to manage your clinic." as const };

  const supabase = await createSupabaseServerClient();
  const { data: grant } = await supabase
    .from("clinic_managers")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (!grant) return { error: "You don't manage this clinic." as const };

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, slug, status")
    .eq("id", clinicId)
    .maybeSingle();
  if (!clinic) return { error: "Clinic not found." as const };

  return { user, supabase, clinic };
}
```

In `portal/actions.ts`, delete the local copy and add `requireManagerAccess` to the existing `import { canEditDirectly } from "./server";` line. (`server.ts` is `server-only`, importable from `"use server"` files.)

- [ ] **Step 2: Write the actions**

`src/modules/therapists/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { invalidateClinicCaches } from "@/modules/shared/cache";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import { requireManagerAccess } from "@/modules/portal/server";
import {
  moveTherapistSchema,
  therapistInputSchema,
  therapistPhotoSchema,
} from "./schemas";

export interface TherapistActionResult {
  error?: string;
  message?: string;
}

const RATE_LIMIT = { key: "therapist-edit", max: 60, windowSeconds: 3600 };

function revalidateClinic(slug: string, clinicId: string) {
  revalidatePath(`/clinics/${slug}`);
  revalidatePath(`/clinic-portal/${clinicId}`, "layout");
  void invalidateClinicCaches();
}

/** Storage prefix every therapist photo for a clinic must live under. */
function photoPrefix(clinicId: string) {
  return `${clinicId}/therapists/`;
}

export async function createTherapist(
  clinicId: string,
  raw: unknown,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { user, supabase, clinic } = access;

  const parsed = therapistInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }

  const limited = await checkRateLimit(
    RATE_LIMIT.key,
    user.id,
    RATE_LIMIT.max,
    RATE_LIMIT.windowSeconds,
  );
  if (!limited.allowed)
    return { error: "Too many edits in a short time. Please try again later." };

  const { data: last } = await supabase
    .from("clinic_therapists")
    .select("display_order")
    .eq("clinic_id", clinicId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("clinic_therapists").insert({
    clinic_id: clinicId,
    full_name: parsed.data.full_name,
    credentials: parsed.data.credentials ?? null,
    profession: parsed.data.profession,
    specialties: parsed.data.specialties,
    bio: parsed.data.bio ?? null,
    display_order: (last?.display_order ?? -1) + 1,
  });
  if (error) {
    console.error("createTherapist failed:", error.message);
    return { error: "Could not add the team member. Please try again." };
  }
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Team member added." };
}

export async function updateTherapist(
  clinicId: string,
  therapistId: string,
  raw: unknown,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { user, supabase, clinic } = access;

  const parsed = therapistInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }

  const limited = await checkRateLimit(
    RATE_LIMIT.key,
    user.id,
    RATE_LIMIT.max,
    RATE_LIMIT.windowSeconds,
  );
  if (!limited.allowed)
    return { error: "Too many edits in a short time. Please try again later." };

  const { error, count } = await supabase
    .from("clinic_therapists")
    .update(
      {
        full_name: parsed.data.full_name,
        credentials: parsed.data.credentials ?? null,
        profession: parsed.data.profession,
        specialties: parsed.data.specialties,
        bio: parsed.data.bio ?? null,
      },
      { count: "exact" },
    )
    .eq("id", therapistId)
    .eq("clinic_id", clinicId);
  if (error) {
    console.error("updateTherapist failed:", error.message);
    return { error: "Could not save changes. Please try again." };
  }
  if (count === 0) return { error: "Team member not found." };
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Changes published." };
}

export async function deleteTherapist(
  clinicId: string,
  therapistId: string,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { supabase, clinic } = access;

  const { data: row } = await supabase
    .from("clinic_therapists")
    .select("id, photo_path")
    .eq("id", therapistId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!row) return { error: "Team member not found." };

  const { error } = await supabase
    .from("clinic_therapists")
    .delete()
    .eq("id", therapistId)
    .eq("clinic_id", clinicId);
  if (error) {
    console.error("deleteTherapist failed:", error.message);
    return { error: "Could not remove the team member. Please try again." };
  }
  if (row.photo_path) {
    await supabase.storage.from("clinic-images").remove([row.photo_path]);
  }
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Team member removed." };
}

/** Swaps display_order with the neighbor in the given direction. */
export async function moveTherapist(
  clinicId: string,
  raw: unknown,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { supabase, clinic } = access;

  const parsed = moveTherapistSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid reorder request." };
  const { therapist_id, direction } = parsed.data;

  const { data: rows } = await supabase
    .from("clinic_therapists")
    .select("id, display_order")
    .eq("clinic_id", clinicId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  const list = rows ?? [];
  const index = list.findIndex((r) => r.id === therapist_id);
  if (index === -1) return { error: "Team member not found." };
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= list.length)
    return { message: "Order unchanged." };

  // Two updates; display_order values may be equal (legacy rows), so assign
  // explicit positions rather than swapping possibly-identical numbers.
  const a = list[index];
  const b = list[swapWith];
  const { error: e1 } = await supabase
    .from("clinic_therapists")
    .update({ display_order: swapWith })
    .eq("id", a.id)
    .eq("clinic_id", clinicId);
  const { error: e2 } = await supabase
    .from("clinic_therapists")
    .update({ display_order: index })
    .eq("id", b.id)
    .eq("clinic_id", clinicId);
  if (e1 || e2) {
    console.error("moveTherapist failed:", (e1 ?? e2)!.message);
    return { error: "Could not reorder. Please try again." };
  }
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Order updated." };
}

/** Records a photo the client uploaded to clinic-images/<clinicId>/therapists/... */
export async function setTherapistPhoto(
  clinicId: string,
  raw: unknown,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { supabase, clinic } = access;

  const parsed = therapistPhotoSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid photo details." };
  if (!parsed.data.storage_path.startsWith(photoPrefix(clinicId))) {
    return { error: "Invalid photo path." };
  }

  const { data: row } = await supabase
    .from("clinic_therapists")
    .select("id, photo_path")
    .eq("id", parsed.data.therapist_id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!row) return { error: "Team member not found." };

  const { error } = await supabase
    .from("clinic_therapists")
    .update({ photo_path: parsed.data.storage_path })
    .eq("id", row.id)
    .eq("clinic_id", clinicId);
  if (error) {
    console.error("setTherapistPhoto failed:", error.message);
    return { error: "Could not save the photo. Please try again." };
  }
  if (row.photo_path && row.photo_path !== parsed.data.storage_path) {
    await supabase.storage.from("clinic-images").remove([row.photo_path]);
  }
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Photo updated." };
}

export async function removeTherapistPhoto(
  clinicId: string,
  therapistId: string,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { supabase, clinic } = access;

  const { data: row } = await supabase
    .from("clinic_therapists")
    .select("id, photo_path")
    .eq("id", therapistId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!row) return { error: "Team member not found." };
  if (!row.photo_path) return { message: "No photo to remove." };

  const { error } = await supabase
    .from("clinic_therapists")
    .update({ photo_path: null })
    .eq("id", row.id)
    .eq("clinic_id", clinicId);
  if (error) {
    console.error("removeTherapistPhoto failed:", error.message);
    return { error: "Could not remove the photo. Please try again." };
  }
  await supabase.storage.from("clinic-images").remove([row.photo_path]);
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Photo removed." };
}
```

Note: if `checkRateLimit`'s actual signature differs (check `src/modules/shared/rate-limit.ts`), match the call to how `portal/actions.ts` uses it (`checkRateLimit("portal-edit", user.id, 30, 3600)`). If the supabase-js `.update(..., { count: "exact" })` option signature differs in the installed version, use `.select("id")` on the update and check the returned rows instead.

- [ ] **Step 3: Verify with typecheck, unit, and integration suites**

Run: `pnpm typecheck && pnpm test && pnpm test:integration`
Expected: all pass (portal actions still compile with the moved guard; behavioral coverage of these actions lands with the e2e task).

- [ ] **Step 4: Commit**

```bash
git add src/modules/therapists/actions.ts src/modules/portal/server.ts src/modules/portal/actions.ts
git commit -m "feat: therapist server actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Public "Care team" section on the clinic page

**Files:**

- Create: `src/modules/therapists/components/CareTeamSection.tsx`
- Modify: `src/modules/clinics/queries.ts` (`getClinicBySlugUncached` select, ~line 152)
- Modify: `src/app/clinics/[slug]/page.tsx` (insert section after the Services card, ~line 374)

**Interfaces:**

- Consumes: `clinic_therapists` columns from Task 1.
- Produces: `CareTeamSection({ therapists })` — server component; `therapists` is the array from the extended `getClinicBySlug` result (`ClinicProfile["clinic_therapists"]`). Renders nothing when empty.

- [ ] **Step 1: Extend the clinic profile query**

In `src/modules/clinics/queries.ts`, `getClinicBySlugUncached`, add to the select string (after `clinic_images ( ... )`):

```
      clinic_images ( storage_path, alt_text, kind, sort_order ),
      clinic_therapists ( id, full_name, credentials, profession, specialties, bio, photo_path, display_order, created_at )
```

(`ClinicProfile` type updates automatically — it is derived from the query.)

- [ ] **Step 2: Write the component**

`src/modules/therapists/components/CareTeamSection.tsx`:

```tsx
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Therapist {
  id: string;
  full_name: string;
  credentials: string | null;
  profession: string;
  specialties: string[];
  bio: string | null;
  photo_path: string | null;
  display_order: number;
  created_at: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Public storage URL for a clinic-images object (public bucket). */
function photoUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/clinic-images/${path}`;
}

export function CareTeamSection({ therapists }: { therapists: Therapist[] }) {
  if (therapists.length === 0) return null;
  const ordered = [...therapists].sort(
    (a, b) =>
      a.display_order - b.display_order ||
      a.created_at.localeCompare(b.created_at),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          <h2>Care team</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ordered.map((therapist) => (
            <li
              key={therapist.id}
              className="flex gap-3 rounded-xl border bg-card p-4"
            >
              <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
                {therapist.photo_path ? (
                  <Image
                    src={photoUrl(therapist.photo_path)}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span
                    aria-hidden
                    className="font-heading text-lg text-secondary-foreground"
                  >
                    {initials(therapist.full_name)}
                  </span>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="font-medium">
                  {therapist.full_name}
                  {therapist.credentials && (
                    <span className="text-muted-foreground">
                      , {therapist.credentials}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {therapist.profession}
                </p>
                {therapist.specialties.length > 0 && (
                  <p className="flex flex-wrap gap-1.5 pt-1">
                    {therapist.specialties.map((specialty) => (
                      <Badge key={specialty} variant="outline">
                        {specialty}
                      </Badge>
                    ))}
                  </p>
                )}
                {therapist.bio && (
                  <p className="pt-1 text-sm leading-relaxed text-foreground/90">
                    {therapist.bio}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

IMPORTANT: this is a **server component** — do NOT import the browser supabase client here; build the public URL from `NEXT_PUBLIC_SUPABASE_URL` as `photoUrl` does.

- [ ] **Step 3: Insert into the clinic page**

In `src/app/clinics/[slug]/page.tsx`, import `CareTeamSection` from `@/modules/therapists/components/CareTeamSection`, and render it in the left column directly after the Services `</Card>` (before the age-groups card):

```tsx
<CareTeamSection therapists={clinic.clinic_therapists} />
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. Then visual check: with the dev server running, add a row by hand for the seeded clinic via psql or the service client, load `/clinics/<slug>`, confirm the Care team card renders with initials avatar and chips; delete the row and confirm the section disappears. (If a dev server is impractical in this task, the e2e task covers rendering — still run typecheck/lint here.)

- [ ] **Step 5: Commit**

```bash
git add src/modules/therapists/components/CareTeamSection.tsx src/modules/clinics/queries.ts "src/app/clinics/[slug]/page.tsx"
git commit -m "feat: public care team section on clinic profiles

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Portal "Team" tab

**Files:**

- Create: `src/app/clinic-portal/[clinicId]/team/page.tsx`
- Create: `src/modules/therapists/components/TherapistManager.tsx`
- Create: `src/modules/therapists/components/TherapistForm.tsx`
- Modify: `src/app/clinic-portal/[clinicId]/layout.tsx` (nav sections list, ~line 11)
- Modify: `src/modules/portal/server.ts` (`requireManagedClinic` select)

**Interfaces:**

- Consumes: actions from Task 3 (exact names/signatures listed there), `therapistInputSchema`/`TherapistInput` from Task 2, `IMAGE_UPLOAD_ACCEPT`, `IMAGE_UPLOAD_MAX_BYTES`, `IMAGE_UPLOAD_MIME` from `@/modules/portal/schemas`.
- Produces: `/clinic-portal/[clinicId]/team` page; `TherapistManager({ clinicId, therapists })` client component.

- [ ] **Step 1: Extend the portal clinic loader**

In `src/modules/portal/server.ts`, `requireManagedClinic`, add `clinic_therapists(*)` to the select:

```ts
      `*,
       clinic_locations(*),
       clinic_hours(*),
       clinic_images(*),
       clinic_therapists(*),
       clinic_services(service_id, delivery, notes, services(id, slug, name))`,
```

- [ ] **Step 2: Add the nav entry**

In `src/app/clinic-portal/[clinicId]/layout.tsx`, insert into `sections` after Services:

```ts
const sections = [
  { segment: "profile", label: "Profile" },
  { segment: "services", label: "Services" },
  { segment: "team", label: "Team" },
  { segment: "hours", label: "Hours" },
  { segment: "images", label: "Images" },
  { segment: "inquiries", label: "Inquiries" },
];
```

- [ ] **Step 3: Write the form component**

`src/modules/therapists/components/TherapistForm.tsx` — client component used for both add and edit. Look at `src/modules/portal/components/PortalProfileForm.tsx` first and mirror its react-hook-form + zodResolver setup, field markup, and error/success display. Shape:

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { therapistInputSchema, type TherapistInput } from "../schemas";

interface TherapistFormProps {
  initial?: TherapistInput;
  submitLabel: string;
  onSubmit: (values: TherapistInput) => Promise<{ error?: string }>;
  onCancel?: () => void;
}

export function TherapistForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: TherapistFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [specialtiesText, setSpecialtiesText] = useState(
    (initial?.specialties ?? []).join(", "),
  );
  const form = useForm<TherapistInput>({
    resolver: zodResolver(therapistInputSchema),
    defaultValues: initial ?? {
      full_name: "",
      credentials: "",
      profession: "",
      specialties: [],
      bio: "",
    },
  });

  async function submit(values: TherapistInput) {
    setServerError(null);
    const specialties = specialtiesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const parsed = therapistInputSchema.safeParse({ ...values, specialties });
    if (!parsed.success) {
      setServerError(
        parsed.error.issues[0]?.message ?? "Please review the form.",
      );
      return;
    }
    const result = await onSubmit(parsed.data);
    if (result.error) setServerError(result.error);
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {serverError}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="therapist-name">Full name</Label>
          <Input id="therapist-name" {...form.register("full_name")} />
          {form.formState.errors.full_name && (
            <p className="text-sm text-destructive">
              {form.formState.errors.full_name.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="therapist-credentials">
            Credentials (optional, e.g. OTRP)
          </Label>
          <Input id="therapist-credentials" {...form.register("credentials")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="therapist-profession">Profession</Label>
        <Input
          id="therapist-profession"
          placeholder="e.g. Occupational Therapist"
          {...form.register("profession")}
        />
        {form.formState.errors.profession && (
          <p className="text-sm text-destructive">
            {form.formState.errors.profession.message}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="therapist-specialties">
          Specialties (comma-separated, up to 10)
        </Label>
        <Input
          id="therapist-specialties"
          value={specialtiesText}
          onChange={(e) => setSpecialtiesText(e.target.value)}
          placeholder="e.g. Sensory integration, Fine motor skills"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="therapist-bio">Short bio (optional)</Label>
        <Textarea id="therapist-bio" rows={4} {...form.register("bio")} />
        {form.formState.errors.bio && (
          <p className="text-sm text-destructive">
            {form.formState.errors.bio.message}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
```

(If `Textarea` doesn't exist under `@/components/ui/textarea`, check how `PortalProfileForm` renders its description field and use the same primitive.)

- [ ] **Step 4: Write the manager component**

`src/modules/therapists/components/TherapistManager.tsx` — client component modeled on `PortalImagesManager` (router.refresh after mutations, per-row busy state, alert row for errors):

```tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MIME,
} from "@/modules/portal/schemas";
import {
  createTherapist,
  deleteTherapist,
  moveTherapist,
  removeTherapistPhoto,
  setTherapistPhoto,
  updateTherapist,
} from "../actions";
import type { TherapistInput } from "../schemas";
import { TherapistForm } from "./TherapistForm";

interface TherapistRow {
  id: string;
  full_name: string;
  credentials: string | null;
  profession: string;
  specialties: string[];
  bio: string | null;
  photo_path: string | null;
  display_order: number;
  created_at: string;
}

interface TherapistManagerProps {
  clinicId: string;
  therapists: TherapistRow[];
}

export function TherapistManager({
  clinicId,
  therapists,
}: TherapistManagerProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createSupabaseBrowserClient();

  const ordered = [...therapists].sort(
    (a, b) =>
      a.display_order - b.display_order ||
      a.created_at.localeCompare(b.created_at),
  );

  function photoUrl(path: string) {
    return supabase.storage.from("clinic-images").getPublicUrl(path).data
      .publicUrl;
  }

  async function withBusy(id: string, fn: () => Promise<{ error?: string }>) {
    setError(null);
    setBusyId(id);
    try {
      const result = await fn();
      if (result.error) setError(result.error);
      else router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function onUploadPhoto(
    therapistId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      setError("Photos must be 5 MB or smaller.");
      return;
    }
    if (!IMAGE_UPLOAD_MIME.includes(file.type)) {
      setError("Upload a JPG, PNG, or WebP image.");
      return;
    }
    setBusyId(therapistId);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${clinicId}/therapists/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("clinic-images")
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        console.error("therapist photo upload failed:", uploadError.message);
        setError("Upload failed. Please try again.");
        return;
      }
      const result = await setTherapistPhoto(clinicId, {
        therapist_id: therapistId,
        storage_path: path,
      });
      if (result.error) setError(result.error);
      else router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}

      {adding ? (
        <div className="rounded-xl border bg-card p-4">
          <TherapistForm
            submitLabel="Add team member"
            onCancel={() => setAdding(false)}
            onSubmit={async (values: TherapistInput) => {
              const result = await createTherapist(clinicId, values);
              if (!result.error) {
                setAdding(false);
                router.refresh();
              }
              return result;
            }}
          />
        </div>
      ) : (
        <Button onClick={() => setAdding(true)}>Add a team member</Button>
      )}

      {ordered.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          No team members listed yet. Families searching for specific therapy
          types can find you more easily once your team is listed.
        </p>
      ) : (
        <ul className="space-y-3">
          {ordered.map((therapist, index) => (
            <li key={therapist.id} className="rounded-xl border bg-card p-4">
              {editingId === therapist.id ? (
                <TherapistForm
                  initial={{
                    full_name: therapist.full_name,
                    credentials: therapist.credentials ?? "",
                    profession: therapist.profession,
                    specialties: therapist.specialties,
                    bio: therapist.bio ?? "",
                  }}
                  submitLabel="Save changes"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (values: TherapistInput) => {
                    const result = await updateTherapist(
                      clinicId,
                      therapist.id,
                      values,
                    );
                    if (!result.error) {
                      setEditingId(null);
                      router.refresh();
                    }
                    return result;
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-start gap-3">
                  <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
                    {therapist.photo_path ? (
                      <Image
                        src={photoUrl(therapist.photo_path)}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <span aria-hidden className="text-sm font-medium">
                        {therapist.full_name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase() ?? "")
                          .join("")}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {therapist.full_name}
                      {therapist.credentials && (
                        <span className="text-muted-foreground">
                          , {therapist.credentials}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {therapist.profession}
                      {therapist.specialties.length > 0 &&
                        ` — ${therapist.specialties.join(", ")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${therapist.full_name} up`}
                      disabled={index === 0 || busyId === therapist.id}
                      onClick={() =>
                        withBusy(therapist.id, () =>
                          moveTherapist(clinicId, {
                            therapist_id: therapist.id,
                            direction: "up",
                          }),
                        )
                      }
                    >
                      <ArrowUp aria-hidden className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${therapist.full_name} down`}
                      disabled={
                        index === ordered.length - 1 || busyId === therapist.id
                      }
                      onClick={() =>
                        withBusy(therapist.id, () =>
                          moveTherapist(clinicId, {
                            therapist_id: therapist.id,
                            direction: "down",
                          }),
                        )
                      }
                    >
                      <ArrowDown aria-hidden className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${therapist.full_name}`}
                      onClick={() => setEditingId(therapist.id)}
                    >
                      <Pencil aria-hidden className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      aria-label={`Remove ${therapist.full_name}`}
                      disabled={busyId === therapist.id}
                      onClick={() =>
                        withBusy(therapist.id, () =>
                          deleteTherapist(clinicId, therapist.id),
                        )
                      }
                    >
                      {busyId === therapist.id ? (
                        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 aria-hidden className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                    <label
                      className="text-sm text-muted-foreground"
                      htmlFor={`photo-${therapist.id}`}
                    >
                      Photo:
                    </label>
                    <Input
                      id={`photo-${therapist.id}`}
                      className="max-w-64"
                      type="file"
                      accept={IMAGE_UPLOAD_ACCEPT}
                      disabled={busyId === therapist.id}
                      onChange={(e) => onUploadPhoto(therapist.id, e)}
                    />
                    {therapist.photo_path && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === therapist.id}
                        onClick={() =>
                          withBusy(therapist.id, () =>
                            removeTherapistPhoto(clinicId, therapist.id),
                          )
                        }
                      >
                        Remove photo
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write the page**

`src/app/clinic-portal/[clinicId]/team/page.tsx` — mirror the shape of `src/app/clinic-portal/[clinicId]/services/page.tsx` (read it first for heading/props conventions):

```tsx
import { requireManagedClinic } from "@/modules/portal/server";
import { TherapistManager } from "@/modules/therapists/components/TherapistManager";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

export default async function ManageTeamPage({ params }: PageProps) {
  const { clinicId } = await params;
  const { clinic } = await requireManagedClinic(clinicId);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold">Care team</h2>
        <p className="text-sm text-muted-foreground">
          Introduce the therapists families will meet. Names and specialties
          also help your clinic show up in search.
        </p>
      </div>
      <TherapistManager
        clinicId={clinic.id}
        therapists={clinic.clinic_therapists}
      />
    </section>
  );
}
```

(Adjust heading level/wrappers to match the services page exactly.)

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean/pass.

- [ ] **Step 7: Commit**

```bash
git add "src/app/clinic-portal/[clinicId]/team" "src/app/clinic-portal/[clinicId]/layout.tsx" src/modules/therapists/components/TherapistManager.tsx src/modules/therapists/components/TherapistForm.tsx src/modules/portal/server.ts
git commit -m "feat: clinic portal team management tab

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: e2e — portal flow + public rendering + photo upload

**Files:**

- Create: `e2e/therapists.spec.ts`

**Interfaces:**

- Consumes: everything shipped in Tasks 1–5; seeded `clinicrep@thrivemap.test`; helper patterns from `e2e/inquiries.spec.ts` (`adminDb`, `signIn`, `managedClinic` — copy them, don't import across spec files).

- [ ] **Step 1: Write the spec**

`e2e/therapists.spec.ts` — copy the constants and `adminDb`/`signIn`/`managedClinic` helpers verbatim from `e2e/inquiries.spec.ts` (top ~70 lines), then:

```ts
const NAME_A = "[e2e] Maria Santos";
const NAME_B = "[e2e] Jo Cruz";

// 1x1 transparent PNG for the photo upload.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function cleanup() {
  const db = adminDb();
  const { data: rows } = await db
    .from("clinic_therapists")
    .select("id, photo_path")
    .like("full_name", "[e2e]%");
  const paths = (rows ?? [])
    .map((r) => r.photo_path)
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) await db.storage.from("clinic-images").remove(paths);
  await db.from("clinic_therapists").delete().like("full_name", "[e2e]%");
}

test.describe.configure({ mode: "serial" });

test.describe("therapist profiles", () => {
  test.beforeAll(async () => {
    await cleanup();
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "mutates shared demo accounts; run once",
    );
  });

  test("manager adds, edits, reorders team members; public page shows them", async ({
    page,
  }) => {
    const clinic = await managedClinic();
    await signIn(page, "clinicrep@thrivemap.test");
    await page.goto(`/clinic-portal/${clinic.id}/team`);

    // Add two members.
    await page.getByRole("button", { name: "Add a team member" }).click();
    await page.getByLabel("Full name").fill(NAME_A);
    await page.getByLabel(/Credentials/).fill("OTRP");
    await page.getByLabel("Profession").fill("Occupational Therapist");
    await page.getByLabel(/Specialties/).fill("Sensory integration");
    await page.getByRole("button", { name: "Add team member" }).click();
    await expect(page.getByText(NAME_A)).toBeVisible();

    await page.getByRole("button", { name: "Add a team member" }).click();
    await page.getByLabel("Full name").fill(NAME_B);
    await page.getByLabel("Profession").fill("Speech Therapist");
    await page.getByRole("button", { name: "Add team member" }).click();
    await expect(page.getByText(NAME_B)).toBeVisible();

    // Edit A's bio.
    await page.getByRole("button", { name: `Edit ${NAME_A}` }).click();
    await page.getByLabel(/Short bio/).fill("Ten years of pediatric practice.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByRole("button", { name: `Edit ${NAME_A}` }),
    ).toBeVisible();

    // Reorder: move B up, expect B listed before A.
    await page.getByRole("button", { name: `Move ${NAME_B} up` }).click();
    await expect
      .poll(async () => {
        const texts = await page
          .locator("li", { hasText: "[e2e]" })
          .allInnerTexts();
        return texts.findIndex((t) => t.includes(NAME_B)) <
          texts.findIndex((t) => t.includes(NAME_A))
          ? "b-first"
          : "a-first";
      })
      .toBe("b-first");

    // Public page shows the care team.
    await page.goto(`/clinics/${clinic.slug}`);
    await expect(
      page.getByRole("heading", { name: "Care team" }),
    ).toBeVisible();
    await expect(page.getByText(NAME_A)).toBeVisible();
    await expect(page.getByText("Occupational Therapist")).toBeVisible();
  });

  test("manager uploads and removes a photo", async ({ page }) => {
    const clinic = await managedClinic();
    await signIn(page, "clinicrep@thrivemap.test");
    await page.goto(`/clinic-portal/${clinic.id}/team`);

    await page
      .locator(`input[type="file"][id^="photo-"]`)
      .first()
      .setInputFiles({
        name: "headshot.png",
        mimeType: "image/png",
        buffer: PNG_BYTES,
      });
    await expect(
      page.getByRole("button", { name: "Remove photo" }),
    ).toBeVisible();

    // Row now has a stored photo_path.
    const db = adminDb();
    await expect
      .poll(async () => {
        const { data } = await db
          .from("clinic_therapists")
          .select("photo_path")
          .like("full_name", "[e2e]%")
          .not("photo_path", "is", null);
        return data?.length ?? 0;
      })
      .toBeGreaterThan(0);

    await page.getByRole("button", { name: "Remove photo" }).click();
    await expect(
      page.getByRole("button", { name: "Remove photo" }),
    ).toHaveCount(0);
  });

  test("manager deletes team members", async ({ page }) => {
    const clinic = await managedClinic();
    await signIn(page, "clinicrep@thrivemap.test");
    await page.goto(`/clinic-portal/${clinic.id}/team`);

    for (const name of [NAME_A, NAME_B]) {
      await page.getByRole("button", { name: `Remove ${name}` }).click();
      await expect(page.getByText(name)).toHaveCount(0);
    }

    // Public page no longer shows the section.
    await page.goto(`/clinics/${clinic.slug}`);
    await expect(page.getByRole("heading", { name: "Care team" })).toHaveCount(
      0,
    );
  });
});
```

Adjust selectors to the real DOM if they misfire (e.g. duplicate text matches — scope with `.locator("li", { hasText: name })`). The public-page assertions may need `page.reload()` if ISR serves a stale copy; the actions call `revalidatePath`, so a fresh `goto` should suffice.

- [ ] **Step 2: Run the spec**

Run: `pnpm test:e2e -- therapists`
Expected: 3 passes on chromium, skips on other projects. Traps: restart the dev server if sign-ins time out (in-memory rate limiter accumulates); if port 3000 is squatted by another app, run dev on another port and set `PLAYWRIGHT_BASE_URL`.

- [ ] **Step 3: Fix and re-run until green, then commit**

```bash
git add e2e/therapists.spec.ts
git commit -m "test: e2e coverage for therapist profiles

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Docs + full verification sweep

**Files:**

- Modify: `docs/architecture/data-model.md` (add `clinic_therapists` alongside the other clinic satellite tables)
- Modify: `docs/phase-2-plan.md` (feature 2 shipped note)

**Interfaces:** none produced; consumes everything.

- [ ] **Step 1: Update data-model.md**

Add `clinic_therapists` to the clinic satellite-tables documentation, following the style used for the inquiries tables (added 2026-08-07): columns, ownership (clinic aggregate), RLS shape (public read / manager+admin manage), and the search-document contribution (names weight B, profession+specialties weight C).

- [ ] **Step 2: Update phase-2-plan.md**

Under "### 2. Therapist profiles", append (mirroring the feature-3 shipped note):

```markdown
Shipped 2026-08-07: per-clinic care team managed from the clinic portal
(no shared therapist identity or standalone pages yet). Spec:
[`docs/superpowers/specs/2026-08-07-therapist-profiles-design.md`](superpowers/specs/2026-08-07-therapist-profiles-design.md);
plan: [`docs/superpowers/plans/2026-08-07-therapist-profiles.md`](superpowers/plans/2026-08-07-therapist-profiles.md).
```

- [ ] **Step 3: Full verification**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm test:e2e && pnpm build
```

Expected: all green (e2e: prior counts + 3 new passes; unit: prior + 8; integration: prior + 5). If the production build warns about the clinic page, confirm `generateStaticParams` is still declared and `revalidate = 300` unchanged.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/data-model.md docs/phase-2-plan.md
git commit -m "docs: record therapist profiles feature

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
