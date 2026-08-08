# Clinic Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Structured, text-free caregiver ratings on clinic pages with trigger-maintained aggregates, a ≥3 display threshold, and admin void moderation.

**Architecture:** New `clinic_ratings` table (one row per user per clinic, 4 required 1–5 dimensions) written directly under RLS; a `clinic_rating_stats` table recomputed by trigger (excluding voided rows) is the only publicly readable surface. New `src/modules/ratings/` module; admin void actions use the service-role client with audit logging via the existing `write_audit_log` trigger.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres RLS), zod 4, react-hook-form, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-08-clinic-ratings-design.md` — read it first.

## Global Constraints

- zod 4: `z.uuid()` not `z.string().uuid()`; no `.coerce`/`.default()` in form schemas used with zodResolver.
- Supabase hardened defaults: every new table/function needs explicit `grant` statements (migration 19 precedent).
- RLS policy subqueries run as the caller; self-checks on `clinic_managers` are allowed (own rows visible), cross-user checks are not.
- Dimension columns, exact names: `communication`, `sensory_friendliness`, `affirming_approach`, `scheduling`.
- Rate limit key `"rating-edit"`, 20/hour.
- Display threshold: aggregates render only when `rating_count >= 3`.
- No free text anywhere. No search changes.
- Migration filename: `supabase/migrations/20260808000021_clinic_ratings.sql`.
- Test markers: integration rows use emails under `itest-ratings*@thrivemap.test`; e2e uses the demo `caregiver@thrivemap.test` login (password `password123`).
- `pnpm test:integration -- <pattern>` does NOT filter — use `npx vitest run --config vitest.integration.config.ts <pattern>`.
- Regenerate types after the migration: `pnpm db:types`.

---

### Task 1: Migration 21 — tables, trigger, RLS, grants, audit

**Files:**
- Create: `supabase/migrations/20260808000021_clinic_ratings.sql`
- Modify: `src/lib/database.types.ts` (generated — run `pnpm db:types`)

**Interfaces:**
- Produces: tables `public.clinic_ratings`, `public.clinic_rating_stats`; trigger function `public.refresh_clinic_rating_stats()`. Later tasks rely on the exact column names in Global Constraints.

- [ ] **Step 1: Write the migration**

```sql
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
-- the clinic. The clinic_managers subquery runs as the caller and callers
-- can always see their own manager rows — exactly the self-check we need.
create policy clinic_ratings_insert_own on public.clinic_ratings
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.clinic_readable_or_managed(clinic_id)
    and not exists (
      select 1 from public.clinic_managers m
      where m.clinic_id = clinic_ratings.clinic_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
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
    or public.has_role((select auth.uid()), 'administrator')
  );

-- Stats are public; writes happen only inside the security-definer trigger.
create policy clinic_rating_stats_select_all on public.clinic_rating_stats
  for select to anon, authenticated
  using (true);

-- Grants ---------------------------------------------------------------

grant select, insert, update, delete on public.clinic_ratings to authenticated;
grant select on public.clinic_rating_stats to anon, authenticated;
```

Before writing, check the real names of the two helpers with:
`grep -n "clinic_readable_or_managed\|has_role" supabase/migrations/20260801000006_rls.sql supabase/migrations/20260807000019_clinic_therapists.sql`
If the role helper has a different name/signature (e.g. `public.is_admin(uid)`), use the existing one — do not invent a new helper. Same for `set_updated_at` (used by migration 19's `clinic_therapists_updated_at`).

- [ ] **Step 2: Apply and verify**

Run: `pnpm db:reset`
Expected: all 21 migrations apply, seed loads, no errors.

- [ ] **Step 3: Regenerate types**

Run: `pnpm db:types && pnpm typecheck`
Expected: `clinic_ratings` and `clinic_rating_stats` appear in `src/lib/database.types.ts`; typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260808000021_clinic_ratings.sql src/lib/database.types.ts
git commit -m "feat: clinic_ratings schema, stats trigger, RLS (migration 21)"
```

---

### Task 2: Integration tests — RLS and stats math

**Files:**
- Create: `tests/integration/ratings-rls.test.ts`

**Interfaces:**
- Consumes: Task 1 tables/trigger.

Copy the harness (clients, signup helper, cleanup style) from `tests/integration/therapists-rls.test.ts`. Use fresh users `itest-ratings-a@thrivemap.test`, `itest-ratings-b@thrivemap.test`, plus the seeded manager `clinicrep@thrivemap.test` and admin `admin@thrivemap.test` (password `password123`). Target a seeded published clinic WITHOUT seed ratings and not rep-managed (pick one in the test via service client query: published, no `clinic_ratings` rows, no `clinic_managers` rows). Clean up own rows in `beforeAll`/`afterAll` via service client.

- [ ] **Step 1: Write the failing tests**

Test cases (one `it` each):

1. **Owner upsert:** user A inserts `{clinic_id, user_id: A, communication: 4, sensory_friendliness: 5, affirming_approach: 4, scheduling: 3}` → succeeds; upsert with `onConflict: "clinic_id,user_id"` changing `communication` to 5 → succeeds and row reflects 5.
2. **Unique per clinic:** plain second `insert` (not upsert) by A for same clinic → error code `23505`.
3. **Manager blocked:** `clinicrep@thrivemap.test` inserting a rating for their own managed clinic (find via `clinic_managers` service query) → RLS error (code `42501`).
4. **Privacy:** user B `select` on A's rating (filter `user_id: A.id`) → 0 rows. Admin client (signed in as admin@) same select → 1 row.
5. **Stats math:** after A (comm 5) and B (comm 4) both rate: stats row has `rating_count = 2`, `avg_communication = 4.5`. Read stats with the ANON client (public readability check).
6. **Void excluded + frozen:** service client sets `voided_at = now(), voided_by = <admin id>` on A's row → stats now `rating_count = 1`, `avg_communication = 4`; A's `update` of the voided row → 0 rows updated (RLS filters it); un-void (service sets `voided_at = null`) → stats back to 2.
7. **Delete recomputes:** A deletes own row → stats `rating_count = 1`; B deletes → stats row GONE (0 rows), not zeroed.

- [ ] **Step 2: Run to verify they fail correctly**

Run: `npx vitest run --config vitest.integration.config.ts ratings-rls`
Expected: with Task 1 applied these should PASS immediately — if any fail, the migration (not the test) is wrong; fix the migration. If you wrote tests before applying Task 1, expected failure mode is missing-table errors.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/ratings-rls.test.ts
git commit -m "test: clinic_ratings RLS and stats trigger integration coverage"
```

---

### Task 3: Ratings module — schema, queries, actions

**Files:**
- Create: `src/modules/ratings/schemas.ts`
- Create: `src/modules/ratings/schemas.test.ts`
- Create: `src/modules/ratings/queries.ts`
- Create: `src/modules/ratings/actions.ts`

**Interfaces:**
- Consumes: `requireUser` from `@/modules/auth/server`; `createSupabaseServerClient` from `@/lib/supabase/server`; `checkRateLimit(key, userId, max, windowSeconds)` from `@/modules/shared/rate-limit`.
- Produces:
  - `ratingInputSchema` (zod object: `communication`, `sensoryFriendliness`, `affirmingApproach`, `scheduling` — all `z.number().int().min(1).max(5)`), type `RatingInput = z.infer<...>`.
  - `upsertRating(clinicId: string, slug: string, raw: unknown): Promise<{ error?: string; message?: string }>`
  - `deleteRating(clinicId: string, slug: string): Promise<{ error?: string; message?: string }>`
  - `getRatingContext(clinicId: string, userId: string | null): Promise<{ stats: RatingStats | null; own: OwnRating | null }>` where `RatingStats = { ratingCount: number; avgCommunication: number; avgSensoryFriendliness: number; avgAffirmingApproach: number; avgScheduling: number }` and `OwnRating = RatingInput & { voided: boolean }`.

- [ ] **Step 1: Write failing schema unit tests** (`schemas.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { ratingInputSchema } from "./schemas";

const valid = {
  communication: 4,
  sensoryFriendliness: 5,
  affirmingApproach: 3,
  scheduling: 1,
};

describe("ratingInputSchema", () => {
  it("accepts all four dimensions in range", () => {
    expect(ratingInputSchema.parse(valid)).toEqual(valid);
  });
  it.each([0, 6, 2.5])("rejects out-of-range or non-int %s", (bad) => {
    expect(
      ratingInputSchema.safeParse({ ...valid, communication: bad }).success,
    ).toBe(false);
  });
  it("rejects a missing dimension", () => {
    const { scheduling: _drop, ...partial } = valid;
    expect(ratingInputSchema.safeParse(partial).success).toBe(false);
  });
});
```

Run: `pnpm test -- ratings` → FAIL (module missing).

- [ ] **Step 2: Implement schemas.ts**

```ts
import { z } from "zod";

const dimension = z.number().int().min(1).max(5);

export const ratingInputSchema = z.object({
  communication: dimension,
  sensoryFriendliness: dimension,
  affirmingApproach: dimension,
  scheduling: dimension,
});

export type RatingInput = z.infer<typeof ratingInputSchema>;
```

Run: `pnpm test -- ratings` → PASS.

- [ ] **Step 3: Implement queries.ts**

```ts
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RatingInput } from "./schemas";

export interface RatingStats {
  ratingCount: number;
  avgCommunication: number;
  avgSensoryFriendliness: number;
  avgAffirmingApproach: number;
  avgScheduling: number;
}

export type OwnRating = RatingInput & { voided: boolean };

export async function getRatingContext(
  clinicId: string,
  userId: string | null,
): Promise<{ stats: RatingStats | null; own: OwnRating | null }> {
  const supabase = await createSupabaseServerClient();

  const { data: statsRow } = await supabase
    .from("clinic_rating_stats")
    .select(
      "rating_count, avg_communication, avg_sensory_friendliness, avg_affirming_approach, avg_scheduling",
    )
    .eq("clinic_id", clinicId)
    .maybeSingle();

  let own: OwnRating | null = null;
  if (userId) {
    const { data: ownRow } = await supabase
      .from("clinic_ratings")
      .select(
        "communication, sensory_friendliness, affirming_approach, scheduling, voided_at",
      )
      .eq("clinic_id", clinicId)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownRow) {
      own = {
        communication: ownRow.communication,
        sensoryFriendliness: ownRow.sensory_friendliness,
        affirmingApproach: ownRow.affirming_approach,
        scheduling: ownRow.scheduling,
        voided: ownRow.voided_at !== null,
      };
    }
  }

  return {
    stats: statsRow
      ? {
          ratingCount: statsRow.rating_count,
          avgCommunication: Number(statsRow.avg_communication),
          avgSensoryFriendliness: Number(statsRow.avg_sensory_friendliness),
          avgAffirmingApproach: Number(statsRow.avg_affirming_approach),
          avgScheduling: Number(statsRow.avg_scheduling),
        }
      : null,
    own,
  };
}
```

Note: numeric columns come back as strings through PostgREST — hence `Number(...)`.

- [ ] **Step 4: Implement actions.ts**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/server";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import { ratingInputSchema } from "./schemas";

const RATE_LIMIT = { key: "rating-edit", max: 20, windowSeconds: 3600 };
const clinicIdSchema = z.uuid();

export interface RatingActionResult {
  error?: string;
  message?: string;
}

export async function upsertRating(
  clinicId: string,
  slug: string,
  raw: unknown,
): Promise<RatingActionResult> {
  const idParsed = clinicIdSchema.safeParse(clinicId);
  if (!idParsed.success) return { error: "Invalid clinic." };
  const parsed = ratingInputSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please rate all four areas from 1 to 5." };

  const user = await requireUser();
  const limited = await checkRateLimit(
    RATE_LIMIT.key,
    user.id,
    RATE_LIMIT.max,
    RATE_LIMIT.windowSeconds,
  );
  if (!limited.allowed)
    return { error: "Too many rating changes in a short time. Please try again later." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("clinic_ratings").upsert(
    {
      clinic_id: idParsed.data,
      user_id: user.id,
      communication: parsed.data.communication,
      sensory_friendliness: parsed.data.sensoryFriendliness,
      affirming_approach: parsed.data.affirmingApproach,
      scheduling: parsed.data.scheduling,
    },
    { onConflict: "clinic_id,user_id" },
  );
  if (error) {
    console.error("upsertRating failed:", error.message);
    return { error: "Could not save your rating. Please try again." };
  }
  revalidatePath(`/clinics/${slug}`);
  return { message: "Rating saved." };
}

export async function deleteRating(
  clinicId: string,
  slug: string,
): Promise<RatingActionResult> {
  const idParsed = clinicIdSchema.safeParse(clinicId);
  if (!idParsed.success) return { error: "Invalid clinic." };
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clinic_ratings")
    .delete()
    .eq("clinic_id", idParsed.data)
    .eq("user_id", user.id);
  if (error) {
    console.error("deleteRating failed:", error.message);
    return { error: "Could not remove your rating. Please try again." };
  }
  revalidatePath(`/clinics/${slug}`);
  return { message: "Rating removed." };
}
```

Check `requireUser`'s actual failure behavior in `src/modules/auth/server.ts` (redirect vs return) and mirror how `favorites/actions.ts` handles it.

Note: RLS silently turns a manager's self-rating upsert into a `42501` error — the generic error message is correct behavior (the form is hidden for managers anyway).

- [ ] **Step 5: Verify**

Run: `pnpm test -- ratings && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/ratings/
git commit -m "feat: ratings module — schema, queries, upsert/delete actions"
```

---

### Task 4: Clinic page UI — summary + form

**Files:**
- Create: `src/modules/ratings/components/RatingSummary.tsx` (server component)
- Create: `src/modules/ratings/components/RatingForm.tsx` (client component)
- Create: `src/modules/ratings/components/RatingsSection.tsx` (server component composing both)
- Modify: `src/app/clinics/[slug]/page.tsx` (insert `<RatingsSection …/>` after the `<CareTeamSection …/>` render around line 377; pass `clinicId`, `slug`, and whether the current user manages this clinic — the page already resolves the viewer for other sections; follow how it does that)

**Interfaces:**
- Consumes: `getRatingContext`, `upsertRating`, `deleteRating`, `RatingStats`, `OwnRating` from Task 3.
- Produces: `RatingsSection({ clinicId, slug }: { clinicId: string; slug: string })` — resolves user + manager state itself if the page doesn't already provide it.

**Design system notes:** Warm Horizon theme (`src/app/globals.css`); shadcn here is Base UI, NOT Radix — no `asChild`, use `render={...}`. Follow `CareTeamSection.tsx` for section header markup and `TherapistForm.tsx` for form/success-message plumbing (3-generic `useForm` is NOT needed here — no transforms, plain `useForm<RatingInput>`).

- [ ] **Step 1: RatingSummary** — server component. Props `{ stats: RatingStats | null }`. Rendering rules (exact copy from spec):
  - `stats === null` → "No ratings yet."
  - `stats.ratingCount < 3` → "This clinic has ratings, but not enough yet to show averages." (do NOT render the count)
  - otherwise → four labeled rows (Communication & responsiveness, Sensory-friendliness, Neurodiversity-affirming approach, Scheduling & waiting time), each showing the average to 1 decimal and a proportional bar (`width: avg/5*100%`), plus "Based on N ratings".
  - Always append policy line: "Ratings are structured scores from signed-in caregivers. ThriveMap does not host written reviews."

- [ ] **Step 2: RatingForm** — client component. Props `{ clinicId: string; slug: string; own: OwnRating | null }`. Four 1–5 star-radio rows (accessible: each dimension a `fieldset` with `legend`, five labeled radio inputs, `aria-label="N stars"`). Prefill from `own`. Submit → `upsertRating(clinicId, slug, values)`; render returned `message` (success) or `error` inline — do not discard success. When `own` exists show a "Remove my rating" button → `deleteRating(clinicId, slug)`. When `own.voided` → render scores read-only/disabled with "This rating was removed by moderators." and no buttons.

- [ ] **Step 3: RatingsSection** — server component. Fetches viewer (same helper the clinic page uses for signed-in state), calls `getRatingContext(clinicId, userId)`, determines `isManager` (query `clinic_managers` for `user_id = viewer, clinic_id, status = 'active'` — caller can see own rows). Renders heading "Caregiver ratings", `RatingSummary`, then: signed-out → sign-in prompt link to `/login`; manager → nothing more; otherwise → `RatingForm`.

- [ ] **Step 4: Wire into clinic page** — import and render in `src/app/clinics/[slug]/page.tsx` after `CareTeamSection`. `pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Manual verify** — `pnpm dev`; as `caregiver@thrivemap.test` rate a seeded clinic: form saves with success message, summary states correct at 0/1/3 ratings (adjust via service-role psql inserts if needed); as `clinicrep@thrivemap.test` on own clinic: no form; signed out: prompt.

- [ ] **Step 6: Commit**

```bash
git add src/modules/ratings/components/ src/app/clinics/
git commit -m "feat: caregiver ratings section on clinic page"
```

---

### Task 5: Admin ratings panel + void actions

**Files:**
- Create: `src/modules/ratings/admin-actions.ts`
- Create: `src/modules/ratings/components/AdminRatingsPanel.tsx`
- Modify: the admin clinic detail page (find it: `grep -rn "clinic" src/app/admin --include=page.tsx -l` — follow how existing panels are added there)

**Interfaces:**
- Consumes: admin client from `@/lib/supabase/admin`; the admin role-check helper used by `src/modules/admin/actions.ts` (grep `requireAdmin` there and reuse it exactly).
- Produces: `voidRating(ratingId: string): Promise<{ error?: string; message?: string }>`, `unvoidRating(ratingId: string)` same shape.

- [ ] **Step 1: admin-actions.ts** — mirror the guard/audit style of existing admin actions in `src/modules/admin/actions.ts` (they already run under the audit trigger — no manual audit write needed). `voidRating`: admin check, then admin client `update({ voided_at: new Date().toISOString(), voided_by: admin.id }).eq("id", ratingId)`. `unvoidRating`: set both null. Both `revalidatePath` on the admin clinic page and return `{ message: "Rating voided." }` / `"Rating restored."`. `z.uuid()` on the id.

- [ ] **Step 2: AdminRatingsPanel** — server component taking `clinicId`. Admin client query: all `clinic_ratings` for the clinic joined with user email (follow how existing admin pages resolve emails — likely `auth.users` via admin client or an existing helper). Table: email, 4 dimension values, created/updated, voided badge; void/unvoid button per row (client subcomponent or form action, matching existing admin panel button patterns); above the table, per-day counts for the last 14 days (simple GROUP BY in the same query path) for brigade spotting.

- [ ] **Step 3: Wire into admin clinic page**, `pnpm typecheck && pnpm lint`, manual check as `admin@thrivemap.test`: void a rating → public stats drop (verify on clinic page), audit_logs row exists (`psql`: `select * from audit_logs where table_name = 'clinic_ratings' order by created_at desc limit 3`).

- [ ] **Step 4: Commit**

```bash
git add src/modules/ratings/admin-actions.ts src/modules/ratings/components/AdminRatingsPanel.tsx src/app/admin/
git commit -m "feat: admin ratings panel with void/unvoid moderation"
```

---

### Task 6: Seeds + e2e

**Files:**
- Modify: `supabase/seed.sql` (after the clinic_therapists block ~line 181)
- Create: `e2e/ratings.spec.ts`

**Interfaces:**
- Consumes: everything above; seeded demo users.

- [ ] **Step 1: Seeds** — insert ratings from seeded demo users onto public demo clinics: one clinic gets 3 ratings (aggregate visible), a second gets 1 (below-threshold state). NONE for the rep-managed clinic (e2e clean-slate precedent from therapists). Seeded auth users already exist; reference them by email subquery: `(select id from auth.users where email = 'caregiver@thrivemap.test')` etc. — check how seed.sql references users today and copy that. Three distinct users are needed for the 3-rating clinic (unique constraint): reuse `caregiver@`, `moderator@`, `admin@` (roles don't block rating; only managers of THAT clinic are blocked). Run `pnpm db:reset` → verify stats rows: `select * from clinic_rating_stats` shows counts 3 and 1.

- [ ] **Step 2: e2e spec** — copy structure/markers from `e2e/therapists.spec.ts` (chromium-only skip via `testInfo.project.name !== "chromium"`). Sign in as `caregiver@thrivemap.test`. Tests:
  1. On the 3-rating seeded clinic: "Caregiver ratings" section shows four average bars and "Based on 3 ratings".
  2. On the 1-rating clinic: shows the not-enough-yet message and no averages.
  3. On a clinic the caregiver hasn't rated (clean one — delete own row up front in the test): submit 4 dimensions → success message "Rating saved."; reload → form prefilled; change one dimension → "Rating saved."; "Remove my rating" → "Rating removed." Clean up after.

- [ ] **Step 3: Run** — `pnpm test:e2e -- ratings` (Playwright DOES filter, unlike vitest integration). Restart dev server first if sign-ins time out (in-memory rate limiter accumulation trap). Expected: 3 passed on chromium, skipped elsewhere.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql e2e/ratings.spec.ts
git commit -m "feat: rating seeds and e2e coverage"
```

---

### Task 7: Docs, terms copy, full-suite verification

**Files:**
- Modify: `docs/architecture/data-model.md` (add clinic_ratings + clinic_rating_stats to the table inventory, matching the style of the clinic_therapists entry)
- Modify: `docs/phase-2-plan.md` (mark feature 4 shipped, structured-ratings scope, date 2026-08-08)
- Modify: the terms page (`src/app/terms/` — one paragraph: ratings are structured 1–5 scores from signed-in users, one per clinic, editable; ThriveMap hosts no written reviews; ratings may be removed by moderators for manipulation)

- [ ] **Step 1: Write the doc + terms changes**

- [ ] **Step 2: Full verification**

Run, in order: `pnpm typecheck && pnpm lint && pnpm test`, then `npx vitest run --config vitest.integration.config.ts`, then `pnpm test:e2e`, then `pnpm build`.
Expected: all green (e2e: previous baseline 55 passed/13 skipped + new ratings tests). Traps: restart dev server before full e2e; port 3000 squatter — if occupied, dev on another port + `PLAYWRIGHT_BASE_URL`.

- [ ] **Step 3: Commit**

```bash
git add docs/ src/app/terms/
git commit -m "docs: clinic ratings shipped — data model, phase plan, terms copy"
```
