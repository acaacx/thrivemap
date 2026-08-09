# Google Places Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `candidate_import` job stub with a real, fixtures-first Google Places Text Search import pipeline: admin-triggered jobs fill `external_place_candidates`, candidates show clinic matches, and admins promote to draft clinics or attach to existing ones.

**Architecture:** New `src/modules/imports/` module with a `PlacesProvider` interface — `GooglePlacesProvider` (live, env-gated on `GOOGLE_MAPS_SERVER_API_KEY`) and `FixturePlacesProvider` (`[DEV ADAPTER]`, deterministic JSON fixtures). One new migration adds `match_candidate_clinics`, `promote_candidate`, `attach_candidate` RPCs. The existing job queue, admin workspace, and audit conventions carry everything else.

**Tech Stack:** Next.js 16, TypeScript strict, Supabase (local), zod v4 (`z.looseObject`), Vitest (unit colocated in `src/**`, integration in `tests/integration/`), Playwright.

Spec: `docs/superpowers/specs/2026-08-06-places-import-design.md`.

## Global Constraints

- **No external credentials.** Never require a real Google key; everything must work with the fixture provider. Live path activates only when `GOOGLE_MAPS_SERVER_API_KEY` is set.
- **shadcn = Base UI, not Radix.** No `asChild`; links render via `render={<Link …/>}`.
- **New tables/functions need explicit grants** (Supabase hardened defaults — see `supabase/migrations/20260801000008_grants.sql`).
- **Extensions live in the `extensions` schema**: write `extensions.st_setsrid(...)`, `extensions.geography(...)` in SQL.
- Query template is exactly `"{service term} in {city}, Philippines"` — no free text.
- Integration tests and e2e need local Supabase running (`pnpm db:start`; `pnpm db:reset` for a clean slate).
- After schema changes run `pnpm db:reset && pnpm db:types` and commit `src/lib/database.types.ts`.
- e2e specs that touch admin/demo accounts are chromium-only (`test.skip(testInfo.project.name !== "chromium", ...)`) and must be idempotent (clean their own data first).
- Commit messages: plain imperative sentences (repo style, no `feat:` prefixes), ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Success feedback in admin UI goes through the sonner toast (inline success races `router.refresh()` — see commit `5681eb1`).

---

### Task 1: Migration 17 — matching + promotion RPCs

**Files:**

- Create: `supabase/migrations/20260806000017_candidate_matching.sql`
- Create: `tests/integration/candidate-matching.test.ts`
- Modify (generated): `src/lib/database.types.ts`

**Interfaces:**

- Consumes: existing tables (`external_place_candidates`, `clinics`, `clinic_locations`, `clinic_source_records`, `ph_locations`), helpers `public.nearest_ph_city(lat, lng)`, `public.is_moderator_or_admin()`.
- Produces (used by Tasks 5–7):
  - `match_candidate_clinics(p_candidate_id uuid, p_distance_m float8 default 500, p_name_similarity float8 default 0.45)` → rows `(clinic_id uuid, clinic_name text, clinic_slug text, name_similarity real, distance_m float8, same_place_id boolean)`
  - `promote_candidate(p_candidate_id uuid)` → `uuid` (new clinic id); reviewer is `auth.uid()`
  - `attach_candidate(p_candidate_id uuid, p_clinic_id uuid)` → `void`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/candidate-matching.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function adminDb() {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function moderatorClient() {
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: "admin@thrivemap.test",
    password: "password123",
  });
  if (error) throw new Error(`Sign-in failed: ${error.message}`);
  return client;
}

// Static test identities; cleaned up before each run so reruns stay green.
const CLINIC = {
  name: "Match Target Therapy Center",
  slug: "int-match-target-therapy-center",
  place_id: "int-match-place-001",
};
const CAND_NEAR = { external_id: "int-cand-near-001" };
const CAND_PLACE = { external_id: "int-match-place-001" }; // same place id as CLINIC
const CAND_PROMOTE = { external_id: "int-cand-promote-001" };
const CAND_ATTACH = { external_id: "int-cand-attach-001" };
const PROMOTED_SLUG_PREFIX = "fixture-promote-target";

async function cleanup() {
  const db = adminDb();
  await db
    .from("external_place_candidates")
    .delete()
    .like("external_id", "int-%");
  await db.from("clinics").delete().like("slug", `${PROMOTED_SLUG_PREFIX}%`);
  await db.from("clinics").delete().eq("slug", CLINIC.slug);
}

beforeAll(async () => {
  await cleanup();
  const db = adminDb();
  const { data: clinic, error: clinicError } = await db
    .from("clinics")
    .insert({
      name: CLINIC.name,
      slug: CLINIC.slug,
      status: "published_unverified",
      source_type: "manual",
      google_place_id: CLINIC.place_id,
      is_demo: true,
    })
    .select("id")
    .single();
  if (clinicError) throw new Error(clinicError.message);
  const { error: locError } = await db.from("clinic_locations").insert({
    clinic_id: clinic.id,
    is_primary: true,
    address_line1: "12 Integration St",
    city: "Quezon City",
    city_slug: "quezon-city",
    province: "Metro Manila",
    province_slug: "metro-manila",
    location: "SRID=4326;POINT(121.0437 14.676)",
  });
  if (locError) throw new Error(locError.message);

  const { error: candError } = await db
    .from("external_place_candidates")
    .insert([
      {
        provider: "google",
        external_id: CAND_NEAR.external_id,
        normalized_name: "Match Target Therapy Centre",
        normalized_address: "14 Integration St, Quezon City",
        latitude: 14.6761,
        longitude: 121.0438,
      },
      {
        provider: "google",
        external_id: CAND_PLACE.external_id,
        normalized_name: "Completely Different Name",
        latitude: 14.7,
        longitude: 121.1,
      },
      {
        provider: "google",
        external_id: CAND_PROMOTE.external_id,
        normalized_name: "Fixture Promote Target",
        normalized_address: "99 Promote Ave, Quezon City",
        latitude: 14.65,
        longitude: 121.03,
        raw_payload: {
          id: CAND_PROMOTE.external_id,
          internationalPhoneNumber: "+63 2 8123 4567",
          websiteUri: "https://promote.example",
        },
      },
      {
        provider: "google",
        external_id: CAND_ATTACH.external_id,
        normalized_name: "Match Target Annex",
        latitude: 14.676,
        longitude: 121.0437,
      },
    ]);
  if (candError) throw new Error(candError.message);
});

async function candidateId(externalId: string): Promise<string> {
  const { data } = await adminDb()
    .from("external_place_candidates")
    .select("id")
    .eq("external_id", externalId)
    .single();
  return data!.id;
}

describe("match_candidate_clinics", () => {
  it("matches by name similarity + proximity", async () => {
    const mod = await moderatorClient();
    const { data, error } = await mod.rpc("match_candidate_clinics", {
      p_candidate_id: await candidateId(CAND_NEAR.external_id),
    });
    expect(error).toBeNull();
    const match = data!.find((m) => m.clinic_slug === CLINIC.slug);
    expect(match).toBeDefined();
    expect(match!.name_similarity).toBeGreaterThan(0.45);
    expect(match!.distance_m).toBeLessThan(500);
    expect(match!.same_place_id).toBe(false);
  });

  it("matches by exact place id even with a different name", async () => {
    const mod = await moderatorClient();
    const { data } = await mod.rpc("match_candidate_clinics", {
      p_candidate_id: await candidateId(CAND_PLACE.external_id),
    });
    const match = data!.find((m) => m.clinic_slug === CLINIC.slug);
    expect(match).toBeDefined();
    expect(match!.same_place_id).toBe(true);
  });

  it("returns nothing to anonymous callers", async () => {
    const anon = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await anon.rpc("match_candidate_clinics", {
      p_candidate_id: await candidateId(CAND_NEAR.external_id),
    });
    expect(data ?? []).toHaveLength(0);
  });
});

describe("promote_candidate", () => {
  it("creates a draft clinic, source record, and marks the candidate", async () => {
    const mod = await moderatorClient();
    const id = await candidateId(CAND_PROMOTE.external_id);
    const { data: clinicId, error } = await mod.rpc("promote_candidate", {
      p_candidate_id: id,
    });
    expect(error).toBeNull();

    const db = adminDb();
    const { data: clinic } = await db
      .from("clinics")
      .select("name, status, source_type, google_place_id, phone, website")
      .eq("id", clinicId!)
      .single();
    expect(clinic).toMatchObject({
      name: "Fixture Promote Target",
      status: "draft",
      source_type: "external_import",
      google_place_id: CAND_PROMOTE.external_id,
      phone: "+63 2 8123 4567",
      website: "https://promote.example",
    });

    const { data: location } = await db
      .from("clinic_locations")
      .select("city_slug, province_slug")
      .eq("clinic_id", clinicId!)
      .single();
    expect(location).toMatchObject({
      city_slug: "quezon-city",
      province_slug: "metro-manila",
    });

    const { data: source } = await db
      .from("clinic_source_records")
      .select("source_type, provider, external_id")
      .eq("clinic_id", clinicId!)
      .single();
    expect(source).toMatchObject({
      source_type: "external_import",
      provider: "google",
      external_id: CAND_PROMOTE.external_id,
    });

    const { data: cand } = await db
      .from("external_place_candidates")
      .select("status, promoted_clinic_id, reviewed_by")
      .eq("id", id)
      .single();
    expect(cand!.status).toBe("promoted");
    expect(cand!.promoted_clinic_id).toBe(clinicId);
    expect(cand!.reviewed_by).not.toBeNull();
  });

  it("raises when a clinic already has the place id", async () => {
    const mod = await moderatorClient();
    const { error } = await mod.rpc("promote_candidate", {
      p_candidate_id: await candidateId(CAND_PLACE.external_id),
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("already linked");
  });
});

describe("attach_candidate", () => {
  it("adds a source record to an existing clinic and marks the candidate", async () => {
    const db = adminDb();
    const { data: clinic } = await db
      .from("clinics")
      .select("id")
      .eq("slug", CLINIC.slug)
      .single();
    const mod = await moderatorClient();
    const id = await candidateId(CAND_ATTACH.external_id);
    const { error } = await mod.rpc("attach_candidate", {
      p_candidate_id: id,
      p_clinic_id: clinic!.id,
    });
    expect(error).toBeNull();

    const { data: source } = await db
      .from("clinic_source_records")
      .select("id")
      .eq("clinic_id", clinic!.id)
      .eq("external_id", CAND_ATTACH.external_id);
    expect(source).toHaveLength(1);

    const { data: cand } = await db
      .from("external_place_candidates")
      .select("status, promoted_clinic_id")
      .eq("id", id)
      .single();
    expect(cand!.status).toBe("promoted");
    expect(cand!.promoted_clinic_id).toBe(clinic!.id);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:integration -- candidate-matching`
Expected: FAIL — rpc `match_candidate_clinics` does not exist (PostgREST 404 / function not found errors).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260806000017_candidate_matching.sql`:

```sql
-- ThriveMap: candidate-vs-clinic matching + promotion for Places imports.
-- match_candidate_clinics: fuzzy match one external candidate against live
-- clinics (trigram name, PostGIS proximity, exact google_place_id).
-- promote_candidate: candidate -> new draft clinic + source record.
-- attach_candidate: candidate -> source record on an existing clinic.
-- All three are security definer with internal moderator checks; callers are
-- the admin server actions.

create or replace function public.match_candidate_clinics(
  p_candidate_id uuid,
  p_distance_m double precision default 500,
  p_name_similarity double precision default 0.45
)
returns table (
  clinic_id uuid,
  clinic_name text,
  clinic_slug text,
  name_similarity real,
  distance_m double precision,
  same_place_id boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id,
    c.name,
    c.slug,
    similarity(c.name, coalesce(cand.normalized_name, '')) as name_similarity,
    case
      when cand.latitude is not null and cand.longitude is not null
        and l.location is not null
      then st_distance(
        l.location,
        st_setsrid(st_makepoint(cand.longitude, cand.latitude), 4326)::geography
      )
    end as distance_m,
    (c.google_place_id is not null
      and c.google_place_id = cand.external_id) as same_place_id
  from public.external_place_candidates cand
  join public.clinics c on c.deleted_at is null
  left join public.clinic_locations l
    on l.clinic_id = c.id and l.is_primary
  where cand.id = p_candidate_id
    and public.is_moderator_or_admin()
    and (
      (c.google_place_id is not null
        and c.google_place_id = cand.external_id)
      or similarity(c.name, coalesce(cand.normalized_name, ''))
        >= p_name_similarity
      or (
        cand.latitude is not null and cand.longitude is not null
        and l.location is not null
        and st_dwithin(
          l.location,
          st_setsrid(st_makepoint(cand.longitude, cand.latitude), 4326)::geography,
          p_distance_m
        )
        and similarity(c.name, coalesce(cand.normalized_name, '')) >= 0.2
      )
    )
  order by same_place_id desc, name_similarity desc
  limit 5;
$$;

create or replace function public.promote_candidate(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cand public.external_place_candidates;
  v_clinic_id uuid;
  v_slug text;
  v_city record;
begin
  if not public.is_moderator_or_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_cand
  from public.external_place_candidates
  where id = p_candidate_id
  for update;
  if not found then
    raise exception 'candidate not found';
  end if;
  if v_cand.status not in ('new', 'under_review') then
    raise exception 'candidate is not open for review';
  end if;
  if exists (
    select 1 from public.clinics
    where google_place_id = v_cand.external_id
  ) then
    raise exception 'already linked: a clinic has this place id';
  end if;

  v_slug := trim(both '-' from regexp_replace(
    lower(coalesce(v_cand.normalized_name, 'clinic')),
    '[^a-z0-9]+', '-', 'g'
  ));
  v_slug := left(coalesce(nullif(v_slug, ''), 'clinic'), 60);
  if exists (select 1 from public.clinics where slug = v_slug) then
    v_slug := left(v_slug, 51) || '-' || substr(v_cand.id::text, 1, 8);
  end if;

  insert into public.clinics (
    slug, name, status, source_type, google_place_id,
    phone, website, created_by, updated_by
  )
  values (
    v_slug,
    coalesce(v_cand.normalized_name, 'Unnamed place'),
    'draft',
    'external_import',
    v_cand.external_id,
    nullif(v_cand.raw_payload ->> 'internationalPhoneNumber', ''),
    nullif(v_cand.raw_payload ->> 'websiteUri', ''),
    auth.uid(),
    auth.uid()
  )
  returning id into v_clinic_id;

  if v_cand.latitude is not null and v_cand.longitude is not null then
    select * into v_city
    from public.nearest_ph_city(v_cand.latitude, v_cand.longitude);
    insert into public.clinic_locations (
      clinic_id, is_primary, address_line1,
      city, city_slug, province, province_slug, location
    )
    values (
      v_clinic_id,
      true,
      coalesce(v_cand.normalized_address, 'Address to be confirmed'),
      coalesce(v_city.city, 'Unknown'),
      coalesce(v_city.city_slug, 'unknown'),
      coalesce(v_city.province, 'Unknown'),
      coalesce(v_city.province_slug, 'unknown'),
      st_setsrid(
        st_makepoint(v_cand.longitude, v_cand.latitude), 4326
      )::geography
    );
  end if;

  insert into public.clinic_source_records (
    clinic_id, source_type, provider, external_id, raw_payload
  )
  values (
    v_clinic_id, 'external_import', v_cand.provider,
    v_cand.external_id, v_cand.raw_payload
  );

  update public.external_place_candidates
  set status = 'promoted',
      promoted_clinic_id = v_clinic_id,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_candidate_id;

  return v_clinic_id;
end;
$$;

create or replace function public.attach_candidate(
  p_candidate_id uuid,
  p_clinic_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cand public.external_place_candidates;
begin
  if not public.is_moderator_or_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_cand
  from public.external_place_candidates
  where id = p_candidate_id
  for update;
  if not found then
    raise exception 'candidate not found';
  end if;
  if v_cand.status not in ('new', 'under_review') then
    raise exception 'candidate is not open for review';
  end if;
  if not exists (
    select 1 from public.clinics
    where id = p_clinic_id and deleted_at is null
  ) then
    raise exception 'clinic not found';
  end if;

  insert into public.clinic_source_records (
    clinic_id, source_type, provider, external_id, raw_payload
  )
  values (
    p_clinic_id, 'external_import', v_cand.provider,
    v_cand.external_id, v_cand.raw_payload
  );

  -- Backfill the place id when the clinic has none and no other clinic
  -- claims it (google_place_id is unique).
  update public.clinics
  set google_place_id = v_cand.external_id,
      updated_by = auth.uid()
  where id = p_clinic_id
    and google_place_id is null
    and not exists (
      select 1 from public.clinics
      where google_place_id = v_cand.external_id
    );

  update public.external_place_candidates
  set status = 'promoted',
      promoted_clinic_id = p_clinic_id,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_candidate_id;
end;
$$;

-- Hardened defaults: lock execution to signed-in users; the functions
-- themselves gate on is_moderator_or_admin().
revoke execute on function public.match_candidate_clinics(uuid, double precision, double precision) from public, anon;
revoke execute on function public.promote_candidate(uuid) from public, anon;
revoke execute on function public.attach_candidate(uuid, uuid) from public, anon;
grant execute on function public.match_candidate_clinics(uuid, double precision, double precision) to authenticated, service_role;
grant execute on function public.promote_candidate(uuid) to authenticated, service_role;
grant execute on function public.attach_candidate(uuid, uuid) to authenticated, service_role;
```

- [ ] **Step 4: Apply migration and regenerate types**

Run: `pnpm db:reset && pnpm db:types`
Expected: reset completes with migration 17 listed; `git diff src/lib/database.types.ts` shows the three new functions.

Note: `pnpm db:reset` wipes local data — that's routine here (seed restores demo data).

- [ ] **Step 5: Run integration tests to verify they pass**

Run: `pnpm test:integration -- candidate-matching`
Expected: PASS (all describes). If `match_candidate_clinics` ORDER BY errors on the alias, replace `order by same_place_id desc, name_similarity desc` with `order by 6 desc, 4 desc`.

Also run: `pnpm test:integration` (full) — the pre-existing suites must stay green.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260806000017_candidate_matching.sql tests/integration/candidate-matching.test.ts src/lib/database.types.ts
git commit -m "Add candidate matching and promotion RPCs

match_candidate_clinics (trigram + proximity + place-id), promote_candidate
(draft clinic + source record), attach_candidate (source record on existing
clinic). Security definer with internal moderator checks; explicit grants
per hardened-defaults convention.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Imports module core — types, normalizer, query builder, fixture provider, factory

**Files:**

- Create: `src/modules/imports/types.ts`
- Create: `src/modules/imports/normalize.ts`
- Create: `src/modules/imports/query.ts`
- Create: `src/modules/imports/fixtures/autism-therapy.json`
- Create: `src/modules/imports/fixtures/generic.json`
- Create: `src/modules/imports/providers/fixtures.ts`
- Create: `src/modules/imports/index.ts`
- Test: `src/modules/imports/normalize.test.ts`, `src/modules/imports/query.test.ts`, `src/modules/imports/providers/fixtures.test.ts`

**Interfaces:**

- Consumes: `logger` from `@/lib/logger` (same import handlers.ts uses).
- Produces (used by Tasks 3–5):
  - `NormalizedPlace { externalId: string; name: string; address: string | null; latitude: number | null; longitude: number | null; rawPayload: Record<string, unknown> }`
  - `PlacesSearchResult { places: NormalizedPlace[]; skipped: number }`
  - `PlacesProvider { name: string; searchText(query: string, options?: { maxPages?: number }): Promise<PlacesSearchResult> }`
  - `normalizeGooglePlace(raw: unknown): NormalizedPlace | null`
  - `IMPORT_SERVICE_TERMS: readonly { slug: string; label: string }[]`
  - `buildImportQuery(termSlug: string, cityName: string): string` (throws on unknown term)
  - `getPlacesProvider(): PlacesProvider` (factory)

- [ ] **Step 1: Write the failing unit tests**

`src/modules/imports/query.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildImportQuery, IMPORT_SERVICE_TERMS } from "./query";

describe("buildImportQuery", () => {
  it("builds the templated query from a known term", () => {
    expect(buildImportQuery("autism-therapy", "Quezon City")).toBe(
      "Autism therapy in Quezon City, Philippines",
    );
  });

  it("throws on unknown term slugs", () => {
    expect(() => buildImportQuery("free-text-injection", "Manila")).toThrow(
      /unknown service term/i,
    );
  });

  it("exposes exactly the five approved terms", () => {
    expect(IMPORT_SERVICE_TERMS.map((t) => t.slug)).toEqual([
      "autism-therapy",
      "occupational-therapy",
      "speech-therapy",
      "developmental-pediatrician",
      "aba-therapy",
    ]);
  });
});
```

`src/modules/imports/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeGooglePlace } from "./normalize";

describe("normalizeGooglePlace", () => {
  it("normalizes a full Google place", () => {
    const raw = {
      id: "abc123",
      displayName: { text: "Bright Steps Therapy" },
      formattedAddress: "1 Example St, Quezon City",
      location: { latitude: 14.676, longitude: 121.0437 },
      internationalPhoneNumber: "+63 2 8123 4567",
      websiteUri: "https://example.ph",
    };
    expect(normalizeGooglePlace(raw)).toEqual({
      externalId: "abc123",
      name: "Bright Steps Therapy",
      address: "1 Example St, Quezon City",
      latitude: 14.676,
      longitude: 121.0437,
      rawPayload: raw,
    });
  });

  it("tolerates missing optional fields", () => {
    const place = normalizeGooglePlace({ id: "min1" });
    expect(place).toMatchObject({
      externalId: "min1",
      name: "Unnamed place",
      address: null,
      latitude: null,
      longitude: null,
    });
  });

  it("returns null when id is missing", () => {
    expect(normalizeGooglePlace({ displayName: { text: "No id" } })).toBeNull();
  });

  it("returns null for non-objects", () => {
    expect(normalizeGooglePlace("garbage")).toBeNull();
  });
});
```

`src/modules/imports/providers/fixtures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FixturePlacesProvider } from "./fixtures";

describe("FixturePlacesProvider", () => {
  const provider = new FixturePlacesProvider();

  it("is named google (stand-in for the live provider)", () => {
    expect(provider.name).toBe("google");
  });

  it("serves the autism-therapy fixture for autism queries", async () => {
    const { places, skipped } = await provider.searchText(
      "Autism therapy in Quezon City, Philippines",
    );
    expect(skipped).toBe(0);
    expect(places.length).toBeGreaterThanOrEqual(3);
    expect(places.map((p) => p.name)).toContain("Fixture Autism Care Center");
    expect(places.every((p) => p.externalId.startsWith("fixture-"))).toBe(true);
  });

  it("is deterministic", async () => {
    const a = await provider.searchText(
      "Autism therapy in Quezon City, Philippines",
    );
    const b = await provider.searchText(
      "Autism therapy in Quezon City, Philippines",
    );
    expect(a).toEqual(b);
  });

  it("falls back to the generic fixture for unknown queries", async () => {
    const { places } = await provider.searchText(
      "Speech therapy in Davao City, Philippines",
    );
    expect(places.length).toBeGreaterThanOrEqual(1);
    expect(places.map((p) => p.name)).toContain("Fixture Developmental Clinic");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/modules/imports`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/modules/imports/types.ts`:

```ts
export interface NormalizedPlace {
  externalId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rawPayload: Record<string, unknown>;
}

export interface PlacesSearchResult {
  places: NormalizedPlace[];
  /** Provider results that failed schema validation and were dropped. */
  skipped: number;
}

export interface PlacesSearchOptions {
  maxPages?: number;
}

export interface PlacesProvider {
  /** Provider slug stored in external_place_candidates.provider. */
  readonly name: string;
  searchText(
    query: string,
    options?: PlacesSearchOptions,
  ): Promise<PlacesSearchResult>;
}
```

`src/modules/imports/normalize.ts`:

```ts
import { z } from "zod";
import type { NormalizedPlace } from "./types";

/** Shape of a Places API (New) place; fixtures mirror this exactly. */
const googlePlaceSchema = z.looseObject({
  id: z.string().min(1),
  displayName: z.looseObject({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  location: z
    .looseObject({ latitude: z.number(), longitude: z.number() })
    .optional(),
  internationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
});

export function normalizeGooglePlace(raw: unknown): NormalizedPlace | null {
  const parsed = googlePlaceSchema.safeParse(raw);
  if (!parsed.success) return null;
  const place = parsed.data;
  return {
    externalId: place.id,
    name: place.displayName?.text ?? "Unnamed place",
    address: place.formattedAddress ?? null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    rawPayload: place as Record<string, unknown>,
  };
}
```

`src/modules/imports/query.ts`:

```ts
export const IMPORT_SERVICE_TERMS = [
  { slug: "autism-therapy", label: "Autism therapy" },
  { slug: "occupational-therapy", label: "Occupational therapy" },
  { slug: "speech-therapy", label: "Speech therapy" },
  { slug: "developmental-pediatrician", label: "Developmental pediatrician" },
  { slug: "aba-therapy", label: "ABA therapy" },
] as const;

export type ImportServiceTermSlug =
  (typeof IMPORT_SERVICE_TERMS)[number]["slug"];

/**
 * The only query shape the importer ever sends: a fixed service term plus a
 * seeded PH city. No free text (quota + injection hygiene).
 */
export function buildImportQuery(termSlug: string, cityName: string): string {
  const term = IMPORT_SERVICE_TERMS.find((t) => t.slug === termSlug);
  if (!term) throw new Error(`unknown service term: ${termSlug}`);
  return `${term.label} in ${cityName}, Philippines`;
}
```

`src/modules/imports/fixtures/autism-therapy.json`:

```json
{
  "places": [
    {
      "id": "fixture-autism-001",
      "displayName": { "text": "Fixture Autism Care Center" },
      "formattedAddress": "101 Kalayaan Ave, Quezon City, Metro Manila",
      "location": { "latitude": 14.6512, "longitude": 121.0491 },
      "internationalPhoneNumber": "+63 2 8555 0101",
      "websiteUri": "https://fixture-autism-care.example"
    },
    {
      "id": "fixture-autism-002",
      "displayName": { "text": "Fixture Bright Path Intervention Hub" },
      "formattedAddress": "22 Timog Ave, Quezon City, Metro Manila",
      "location": { "latitude": 14.6355, "longitude": 121.0355 },
      "internationalPhoneNumber": "+63 2 8555 0202"
    },
    {
      "id": "fixture-autism-003",
      "displayName": { "text": "Fixture Sensory Steps Therapy" },
      "formattedAddress": "5 Katipunan Ave, Quezon City, Metro Manila",
      "location": { "latitude": 14.639, "longitude": 121.0745 },
      "websiteUri": "https://fixture-sensory-steps.example"
    }
  ]
}
```

`src/modules/imports/fixtures/generic.json`:

```json
{
  "places": [
    {
      "id": "fixture-generic-001",
      "displayName": { "text": "Fixture Developmental Clinic" },
      "formattedAddress": "8 Rizal St, Davao City, Davao del Sur",
      "location": { "latitude": 7.0731, "longitude": 125.6128 }
    },
    {
      "id": "fixture-generic-002",
      "displayName": { "text": "Fixture Child Wellness Center" },
      "formattedAddress": "14 Osmeña Blvd, Cebu City, Cebu",
      "location": { "latitude": 10.3157, "longitude": 123.8854 }
    }
  ]
}
```

`src/modules/imports/providers/fixtures.ts`:

```ts
import autismTherapy from "../fixtures/autism-therapy.json";
import generic from "../fixtures/generic.json";
import { normalizeGooglePlace } from "../normalize";
import type {
  PlacesProvider,
  PlacesSearchOptions,
  PlacesSearchResult,
} from "../types";

/**
 * [DEV ADAPTER] Deterministic stand-in for Google Places when no server key
 * is configured. Fixtures mirror the Places API (New) response shape, so the
 * whole import -> review -> promote flow is demoable and testable offline.
 */
const FIXTURES: Record<string, { places: unknown[] }> = {
  "autism-therapy": autismTherapy,
};

function slugifyQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class FixturePlacesProvider implements PlacesProvider {
  // Stand-in for the live provider: rows must merge with real Google rows
  // later, so the provider slug matches.
  readonly name = "google";

  async searchText(
    query: string,
    _options?: PlacesSearchOptions,
  ): Promise<PlacesSearchResult> {
    const querySlug = slugifyQuery(query);
    const fixture =
      Object.entries(FIXTURES).find(([key]) =>
        querySlug.startsWith(key),
      )?.[1] ?? generic;
    const places = fixture.places
      .map(normalizeGooglePlace)
      .filter((p): p is NonNullable<typeof p> => p !== null);
    return { places, skipped: fixture.places.length - places.length };
  }
}
```

`src/modules/imports/index.ts` (adjust the logger import to match handlers.ts):

```ts
import "server-only";
import { logger } from "@/lib/logger";
import { FixturePlacesProvider } from "./providers/fixtures";
import { GooglePlacesProvider } from "./providers/google";
import type { PlacesProvider } from "./types";

export function getPlacesProvider(): PlacesProvider {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (apiKey) return new GooglePlacesProvider(apiKey);
  logger.info(
    "[DEV ADAPTER] Google Places not configured — using FixturePlacesProvider.",
  );
  return new FixturePlacesProvider();
}
```

Note: `index.ts` imports `GooglePlacesProvider`, which is Task 3. To keep this task compiling on its own, create `src/modules/imports/providers/google.ts` now with only the class skeleton:

```ts
import type {
  PlacesProvider,
  PlacesSearchOptions,
  PlacesSearchResult,
} from "../types";

/** Live Places API (New) Text Search client. Implemented in the next task. */
export class GooglePlacesProvider implements PlacesProvider {
  readonly name = "google";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async searchText(
    _query: string,
    _options?: PlacesSearchOptions,
  ): Promise<PlacesSearchResult> {
    throw new Error("GooglePlacesProvider.searchText not implemented");
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/modules/imports`
Expected: PASS. Also `pnpm typecheck` and `pnpm lint` clean.

- [ ] **Step 5: Commit**

```bash
git add src/modules/imports
git commit -m "Add imports module core: provider interface, fixtures, query templating

PlacesProvider interface with a [DEV ADAPTER] fixture provider mirroring the
Places API (New) response shape, a shared Google-place normalizer, and the
fixed service-term query builder. Google provider is a skeleton for now.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Google Places provider

**Files:**

- Modify: `src/modules/imports/providers/google.ts` (replace the skeleton body)
- Test: `src/modules/imports/providers/google.test.ts`

**Interfaces:**

- Consumes: `normalizeGooglePlace`, `PlacesProvider`, `PlacesSearchResult` from Task 2.
- Produces: working `GooglePlacesProvider` with constructor `(apiKey: string, fetchImpl: typeof fetch = fetch)`; exports `MAX_PAGES = 3`.

- [ ] **Step 1: Write the failing unit tests**

`src/modules/imports/providers/google.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { GooglePlacesProvider, MAX_PAGES } from "./google";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PLACE = {
  id: "live-001",
  displayName: { text: "Live Therapy Center" },
  formattedAddress: "1 Real St, Makati",
  location: { latitude: 14.5547, longitude: 121.0244 },
};

describe("GooglePlacesProvider", () => {
  it("sends the right request: URL, key header, field mask, body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ places: [PLACE] }));
    const provider = new GooglePlacesProvider("test-key", fetchMock);
    await provider.searchText("Autism therapy in Quezon City, Philippines");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(init.headers["X-Goog-FieldMask"]).toBe(
      [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "nextPageToken",
      ].join(","),
    );
    expect(JSON.parse(init.body)).toEqual({
      textQuery: "Autism therapy in Quezon City, Philippines",
    });
  });

  it("normalizes places and counts unparseable ones as skipped", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ places: [PLACE, { noId: true }] }));
    const provider = new GooglePlacesProvider("k", fetchMock);
    const { places, skipped } = await provider.searchText("q");
    expect(places).toHaveLength(1);
    expect(places[0].externalId).toBe("live-001");
    expect(skipped).toBe(1);
  });

  it("paginates with nextPageToken and stops at MAX_PAGES", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ places: [PLACE], nextPageToken: "t" }));
    const provider = new GooglePlacesProvider("k", fetchMock);
    const { places } = await provider.searchText("q");
    expect(fetchMock).toHaveBeenCalledTimes(MAX_PAGES);
    expect(places).toHaveLength(MAX_PAGES);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).pageToken).toBe("t");
  });

  it("stops when there is no nextPageToken", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ places: [PLACE] }));
    const provider = new GooglePlacesProvider("k", fetchMock);
    await provider.searchText("q");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on non-200 responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 403));
    const provider = new GooglePlacesProvider("k", fetchMock);
    await expect(provider.searchText("q")).rejects.toThrow(/HTTP 403/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/modules/imports/providers/google`
Expected: FAIL — "not implemented".

- [ ] **Step 3: Implement**

Replace the skeleton body in `src/modules/imports/providers/google.ts`:

```ts
import { z } from "zod";
import { normalizeGooglePlace } from "../normalize";
import type {
  NormalizedPlace,
  PlacesProvider,
  PlacesSearchOptions,
  PlacesSearchResult,
} from "../types";

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

/** Minimal mask = base-tier billing; nextPageToken is top-level. */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "nextPageToken",
].join(",");

/** Hard quota guard: at most 3 pages (~60 places) per job. */
export const MAX_PAGES = 3;

const responseSchema = z.looseObject({
  places: z.array(z.unknown()).optional(),
  nextPageToken: z.string().optional(),
});

export class GooglePlacesProvider implements PlacesProvider {
  readonly name = "google";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async searchText(
    query: string,
    options?: PlacesSearchOptions,
  ): Promise<PlacesSearchResult> {
    const maxPages = options?.maxPages ?? MAX_PAGES;
    const places: NormalizedPlace[] = [];
    let skipped = 0;
    let pageToken: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const response = await this.fetchImpl(SEARCH_TEXT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: query,
          ...(pageToken ? { pageToken } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`Places searchText failed: HTTP ${response.status}`);
      }
      const parsed = responseSchema.parse(await response.json());
      for (const raw of parsed.places ?? []) {
        const place = normalizeGooglePlace(raw);
        if (place) places.push(place);
        else skipped++;
      }
      pageToken = parsed.nextPageToken;
      if (!pageToken) break;
    }
    return { places, skipped };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/modules/imports`
Expected: PASS (google + fixtures + normalize + query). `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add src/modules/imports/providers/google.ts src/modules/imports/providers/google.test.ts
git commit -m "Implement Google Places Text Search provider

POST places:searchText with minimal field mask, nextPageToken pagination
capped at 3 pages, zod-validated responses, per-place skip counting. Fetch
is injectable; the live path stays unexercised until a key exists.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Import job — `runPlacesImport` + handler wiring

**Files:**

- Create: `src/modules/imports/server.ts`
- Modify: `src/modules/jobs/handlers.ts` (replace `runCandidateImport`, lines ~247–263)
- Test: `tests/integration/places-import.test.ts`

**Interfaces:**

- Consumes: `getPlacesProvider()` (Task 2), `createSupabaseAdminClient` from `@/lib/supabase/admin`, `JobPayload` type from handlers.ts (check its actual export — reuse whatever `runCandidateImport` currently receives).
- Produces: `runPlacesImport(payload: { query?: unknown }): Promise<{ fetched: number; created: number; updated: number; skipped: number }>` — throws when `payload.query` is not a non-empty string.

- [ ] **Step 1: Write the failing integration test**

`tests/integration/places-import.test.ts` (reuse the client helpers from `tests/integration/candidate-matching.test.ts` — copy the `SUPABASE_URL`/`SERVICE_ROLE_KEY`/`adminDb` block; integration files are self-contained by convention, see `rls.test.ts`):

```ts
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { runPlacesImport } from "@/modules/imports/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function adminDb() {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const QUERY = "Autism therapy in Quezon City, Philippines";

beforeAll(async () => {
  await adminDb()
    .from("external_place_candidates")
    .delete()
    .like("external_id", "fixture-%");
});

describe("runPlacesImport (fixture provider)", () => {
  it("creates candidates from fixture places", async () => {
    const result = await runPlacesImport({ query: QUERY });
    expect(result.created).toBeGreaterThanOrEqual(3);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);

    const { data } = await adminDb()
      .from("external_place_candidates")
      .select("external_id, status, normalized_name, latitude")
      .eq("external_id", "fixture-autism-001")
      .single();
    expect(data).toMatchObject({
      status: "new",
      normalized_name: "Fixture Autism Care Center",
    });
    expect(data!.latitude).toBeCloseTo(14.6512, 3);
  });

  it("re-import updates fields but preserves review status", async () => {
    const db = adminDb();
    await db
      .from("external_place_candidates")
      .update({ status: "discarded", normalized_name: "Stale Name" })
      .eq("external_id", "fixture-autism-001");

    const result = await runPlacesImport({ query: QUERY });
    expect(result.created).toBe(0);
    expect(result.updated).toBeGreaterThanOrEqual(3);

    const { data } = await db
      .from("external_place_candidates")
      .select("status, normalized_name")
      .eq("external_id", "fixture-autism-001")
      .single();
    // Fields refreshed, discard NOT resurrected.
    expect(data!.status).toBe("discarded");
    expect(data!.normalized_name).toBe("Fixture Autism Care Center");
  });

  it("throws on a missing query", async () => {
    await expect(runPlacesImport({})).rejects.toThrow(/query/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:integration -- places-import`
Expected: FAIL — `@/modules/imports/server` not found.

Note: this test runs `server-only` imports under Vitest. The integration config already handles that for other server modules — if `server-only` throws, check how `vitest.integration.config.ts` aliases it (it must already, since `tests/integration/search.test.ts` exercises server code paths); mirror that. If no alias exists, add `resolve: { alias: { "server-only": path to an empty module } }` — but check first.

- [ ] **Step 3: Implement**

`src/modules/imports/server.ts`:

```ts
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getPlacesProvider } from "./index";

export interface PlacesImportResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
}

/**
 * Body of the candidate_import job. Fetches places for a templated query and
 * upserts external_place_candidates. Existing rows refresh raw_payload and
 * normalized fields but keep status/reviewed_by/reviewed_at — a discarded
 * candidate never resurrects. Idempotent: safe to retry after partial runs.
 */
export async function runPlacesImport(payload: {
  query?: unknown;
}): Promise<PlacesImportResult> {
  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!query) throw new Error("candidate_import: payload.query is required");

  const provider = getPlacesProvider();
  const { places, skipped } = await provider.searchText(query);

  const supabase = createSupabaseAdminClient();
  let created = 0;
  let updated = 0;

  if (places.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from("external_place_candidates")
      .select("external_id")
      .eq("provider", provider.name)
      .in(
        "external_id",
        places.map((p) => p.externalId),
      );
    if (existingError) {
      throw new Error(
        `candidate_import: lookup failed: ${existingError.message}`,
      );
    }
    const existing = new Set(existingRows?.map((r) => r.external_id));

    // Upsert only the data columns; status and review fields are absent from
    // the payload, so ON CONFLICT leaves them untouched.
    const { error: upsertError } = await supabase
      .from("external_place_candidates")
      .upsert(
        places.map((place) => ({
          provider: provider.name,
          external_id: place.externalId,
          raw_payload: JSON.parse(JSON.stringify(place.rawPayload)),
          normalized_name: place.name,
          normalized_address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
        })),
        { onConflict: "provider,external_id" },
      );
    if (upsertError) {
      throw new Error(
        `candidate_import: upsert failed: ${upsertError.message}`,
      );
    }
    created = places.filter((p) => !existing.has(p.externalId)).length;
    updated = places.length - created;
  }

  logger.info("candidate_import finished", {
    query,
    fetched: places.length,
    created,
    updated,
    skipped,
  });
  return { fetched: places.length, created, updated, skipped };
}
```

In `src/modules/jobs/handlers.ts`, replace the whole `runCandidateImport` function (the `[DEV ADAPTER]` stub) with:

```ts
/**
 * External candidate import: Google Places Text Search (or the [DEV ADAPTER]
 * fixture provider when GOOGLE_MAPS_SERVER_API_KEY is absent — see
 * src/modules/imports). Payload: { query, termSlug, citySlug, requestedBy }.
 */
async function runCandidateImport(payload: JobPayload): Promise<void> {
  await runPlacesImport(payload);
}
```

and add the import at the top: `import { runPlacesImport } from "@/modules/imports/server";`

Caution: if Supabase's generated types make `.upsert` reject the partial row (they shouldn't — all omitted columns have defaults), do NOT cast to `any`; fix the row shape instead.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:integration -- places-import`
Expected: PASS. Then `pnpm test:integration` (full), `pnpm typecheck`, `pnpm lint` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/modules/imports/server.ts src/modules/jobs/handlers.ts tests/integration/places-import.test.ts
git commit -m "Wire candidate_import job to the Places import pipeline

runPlacesImport fetches via the configured provider and upserts candidates
on (provider, external_id), refreshing data columns while preserving review
status — discarded candidates never resurrect. Replaces the stage-4 stub.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Admin server queries + actions

**Files:**

- Modify: `src/modules/admin/server.ts` (append after `listCandidates`, ~line 122)
- Modify: `src/modules/admin/actions.ts` (append to the "External candidates" section, ~line 745)

**Interfaces:**

- Consumes: Task 1 RPCs; `buildImportQuery`, `IMPORT_SERVICE_TERMS` (Task 2); existing `requireModerator`, `logAdminAction`, `AdminActionResult`, `enqueueJob`, `checkRateLimit` from `@/modules/shared/rate-limit`.
- Produces (used by Task 6):
  - `listImportCities(): Promise<{ id: string; city: string; province: string }[]>`
  - `listCandidateMatches(candidateIds: string[]): Promise<Record<string, CandidateMatch[]>>` where `CandidateMatch = { clinic_id: string; clinic_name: string; clinic_slug: string; name_similarity: number; distance_m: number | null; same_place_id: boolean }`
  - `listRecentImportJobs(): Promise<{ id: string; status: string; payload: unknown; created_at: string; last_error: string | null }[]>`
  - `triggerCandidateImportAction(termSlug: string, locationId: string): Promise<AdminActionResult>`
  - `promoteCandidateAction(candidateId: string, note: string): Promise<AdminActionResult>`
  - `attachCandidateAction(candidateId: string, clinicId: string, note: string): Promise<AdminActionResult>`

No new unit tests here: these are thin glue over already-tested RPCs/limiter; behavior is covered end-to-end in Task 7. (Match the file's existing style — none of the sibling actions have unit tests.)

- [ ] **Step 1: Add server queries**

Append to `src/modules/admin/server.ts` (after `listCandidates`). Check the jobs listing further down the same file (~line 185) and reuse its client choice for `listRecentImportJobs` — the jobs table needs the admin client:

```ts
export type CandidateMatch = {
  clinic_id: string;
  clinic_name: string;
  clinic_slug: string;
  name_similarity: number;
  distance_m: number | null;
  same_place_id: boolean;
};

/** Live candidate-vs-clinic matches; computed at render, never stored. */
export async function listCandidateMatches(
  candidateIds: string[],
): Promise<Record<string, CandidateMatch[]>> {
  const supabase = await createSupabaseServerClient();
  const entries = await Promise.all(
    candidateIds.map(async (id) => {
      const { data } = await supabase.rpc("match_candidate_clinics", {
        p_candidate_id: id,
      });
      return [id, (data ?? []) as CandidateMatch[]] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function listImportCities() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ph_locations")
    .select("id, city, province")
    .in("kind", ["city", "municipality"])
    .order("province", { ascending: true })
    .order("city", { ascending: true });
  return (data ?? []).filter(
    (row): row is { id: string; city: string; province: string } =>
      row.city !== null,
  );
}

export async function listRecentImportJobs() {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, status, payload, created_at, last_error")
    .eq("job_type", "candidate_import")
    .order("created_at", { ascending: false })
    .limit(5);
  return data ?? [];
}
```

- [ ] **Step 2: Add actions**

Append to the "External candidates" section of `src/modules/admin/actions.ts`. Add imports at the top of the file: `import { checkRateLimit } from "@/modules/shared/rate-limit";` and `import { buildImportQuery, IMPORT_SERVICE_TERMS } from "@/modules/imports/query";`

```ts
export async function triggerCandidateImportAction(
  termSlug: string,
  locationId: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const { allowed } = await checkRateLimit(
    "candidate-import",
    user.id,
    10,
    3600,
  );
  if (!allowed) {
    return { error: "Import rate limit reached — try again in an hour." };
  }
  const term = IMPORT_SERVICE_TERMS.find((t) => t.slug === termSlug);
  if (!term) return { error: "Unknown service term." };

  const supabase = await createSupabaseServerClient();
  const { data: location } = await supabase
    .from("ph_locations")
    .select("id, city, city_slug, province")
    .eq("id", locationId)
    .maybeSingle();
  if (!location?.city || !location.city_slug) {
    return { error: "Unknown city." };
  }

  const query = buildImportQuery(term.slug, location.city);
  const day = new Date().toISOString().slice(0, 10);
  await enqueueJob(
    "candidate_import",
    {
      query,
      termSlug: term.slug,
      citySlug: location.city_slug,
      requestedBy: user.id,
    },
    // One import per term+city per day; repeat clicks are no-ops.
    {
      idempotencyKey: `candidate-import:${term.slug}:${location.city_slug}:${day}`,
    },
  );
  await logAdminAction(user.id, "trigger_candidate_import", "job", null, null, {
    query,
    term: term.slug,
    city_slug: location.city_slug,
  });
  revalidatePath("/admin/candidates");
  return { message: `Import queued: ${query}` };
}

export async function promoteCandidateAction(
  candidateId: string,
  note: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const supabase = await createSupabaseServerClient();
  const { data: clinicId, error } = await supabase.rpc("promote_candidate", {
    p_candidate_id: candidateId,
  });
  if (error) {
    if (error.message.includes("already linked")) {
      return { error: "A clinic already has this place — use Attach instead." };
    }
    console.error("promoteCandidateAction failed:", error.message);
    return { error: "Could not promote the candidate." };
  }
  await logAdminAction(
    user.id,
    "promote_candidate",
    "external_place_candidate",
    candidateId,
    note.trim() || null,
    { clinic_id: clinicId },
  );
  revalidatePath("/admin/candidates");
  return { message: "Draft clinic created." };
}

export async function attachCandidateAction(
  candidateId: string,
  clinicId: string,
  note: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("attach_candidate", {
    p_candidate_id: candidateId,
    p_clinic_id: clinicId,
  });
  if (error) {
    console.error("attachCandidateAction failed:", error.message);
    return { error: "Could not attach the candidate." };
  }
  await logAdminAction(
    user.id,
    "attach_candidate",
    "external_place_candidate",
    candidateId,
    note.trim() || null,
    { clinic_id: clinicId },
  );
  revalidatePath("/admin/candidates");
  return { message: "Candidate attached to the existing clinic." };
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (If `checkRateLimit` pulls `next/headers` into a non-request context, note that these actions always run in request scope — same as sibling actions.)

- [ ] **Step 4: Commit**

```bash
git add src/modules/admin/server.ts src/modules/admin/actions.ts
git commit -m "Add admin queries and actions for the Places import flow

Trigger action (rate-limited, idempotency-keyed per term+city+day), promote
and attach actions over the new RPCs, live match lookup, import city list,
and recent candidate_import job listing.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Admin candidates UI

**Files:**

- Create: `src/modules/admin/components/ImportTriggerCard.tsx`
- Modify: `src/app/admin/candidates/page.tsx` (full rewrite of the page body)

**Interfaces:**

- Consumes: everything from Task 5; `ReviewActions` (`{ actions: ReviewActionSpec[] }`, `ReviewActionSpec = { label; variant?; requiresReason?; run: (reason: string) => Promise<AdminActionResult> }`); existing `discardCandidate(candidateId, reason)`.
- Produces: the finished workspace page. e2e (Task 7) relies on: a `<select>` labeled "Service", a `<select>` labeled "City", a button named "Queue import", buttons named "Promote" / "Discard", per-match buttons named `Attach to <clinic name>`.

- [ ] **Step 1: Build the trigger card (client component)**

`src/modules/admin/components/ImportTriggerCard.tsx`. Native `<select>` elements on purpose: the municipality list is long and Playwright's `selectOption` is far less flaky than driving a Base UI listbox. Style with the same border/input classes used elsewhere (`crib from src/components/ui/input.tsx` class names):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { triggerCandidateImportAction } from "../actions";

const SELECT_CLASSES =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ImportTriggerCard({
  terms,
  cities,
}: {
  terms: readonly { slug: string; label: string }[];
  cities: { id: string; city: string; province: string }[];
}) {
  const router = useRouter();
  const [termSlug, setTermSlug] = useState(terms[0]?.slug ?? "");
  const [locationId, setLocationId] = useState(cities[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  function onQueue() {
    startTransition(async () => {
      const result = await triggerCandidateImportAction(termSlug, locationId);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.message ?? "Import queued.");
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-6 rounded-2xl border bg-card p-5">
      <h2 className="font-heading text-lg font-semibold">Run an import</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Queues a Google Places search for one service in one city. Results land
        here for review — nothing publishes automatically.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="import-term">Service</Label>
          <select
            id="import-term"
            className={SELECT_CLASSES}
            value={termSlug}
            onChange={(e) => setTermSlug(e.target.value)}
          >
            {terms.map((term) => (
              <option key={term.slug} value={term.slug}>
                {term.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="import-city">City</Label>
          <select
            id="import-city"
            className={SELECT_CLASSES}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.city} — {city.province}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={onQueue} disabled={pending || !locationId}>
          {pending ? "Queueing…" : "Queue import"}
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Rewrite the candidates page**

`src/app/admin/candidates/page.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import {
  attachCandidateAction,
  discardCandidate,
  promoteCandidateAction,
} from "@/modules/admin/actions";
import { ImportTriggerCard } from "@/modules/admin/components/ImportTriggerCard";
import { ReviewActions } from "@/modules/admin/components/ReviewCard";
import {
  listCandidateMatches,
  listCandidates,
  listImportCities,
  listRecentImportJobs,
} from "@/modules/admin/server";
import { IMPORT_SERVICE_TERMS } from "@/modules/imports/query";

export default async function AdminCandidatesPage() {
  const [candidates, cities, recentJobs] = await Promise.all([
    listCandidates(),
    listImportCities(),
    listRecentImportJobs(),
  ]);
  const open = candidates.filter((c) =>
    ["new", "under_review"].includes(c.status),
  );
  const matches = await listCandidateMatches(open.map((c) => c.id));

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">
        External candidates
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Places found by imports. Promote a candidate into a draft listing,
        attach it to a clinic we already have, or discard noise. Nothing here is
        public until a draft is reviewed and published.
      </p>

      <ImportTriggerCard terms={IMPORT_SERVICE_TERMS} cities={cities} />

      {recentJobs.length > 0 && (
        <section className="mt-4 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Recent imports</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {recentJobs.map((job) => {
              const query =
                job.payload &&
                typeof job.payload === "object" &&
                "query" in job.payload
                  ? String((job.payload as { query?: unknown }).query ?? "")
                  : "";
              return (
                <li key={job.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{job.status}</Badge>
                  <span>{query || "(no query)"}</span>
                  {job.last_error && (
                    <span className="text-destructive">{job.last_error}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {open.length === 0 ? (
        <p className="mt-8 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No candidates waiting. Queue an import above to fill this list.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {open.map((candidate) => {
            const candidateMatches = matches[candidate.id] ?? [];
            return (
              <li key={candidate.id} className="rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-heading text-lg font-semibold">
                    {candidate.normalized_name ?? "Unnamed place"}
                  </p>
                  <Badge variant="outline">{candidate.provider}</Badge>
                  <Badge variant="outline">
                    {candidate.status.replaceAll("_", " ")}
                  </Badge>
                </div>
                {candidate.normalized_address && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {candidate.normalized_address}
                  </p>
                )}
                {candidateMatches.length > 0 && (
                  <div className="mt-3 rounded-lg border border-dashed p-3">
                    <p className="text-sm font-medium">Possible matches</p>
                    <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                      {candidateMatches.map((match) => (
                        <li
                          key={match.clinic_id}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <a
                            className="underline underline-offset-2"
                            href={`/clinics/${match.clinic_slug}`}
                          >
                            {match.clinic_name}
                          </a>
                          {match.same_place_id && (
                            <Badge variant="outline">same place id</Badge>
                          )}
                          <span>
                            {Math.round(match.name_similarity * 100)}% name
                          </span>
                          {match.distance_m !== null && (
                            <span>{Math.round(match.distance_m)} m away</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ReviewActions
                  actions={[
                    {
                      label: "Promote",
                      run: promoteCandidateAction.bind(null, candidate.id),
                    },
                    ...candidateMatches.map((match) => ({
                      label: `Attach to ${match.clinic_name}`,
                      variant: "outline" as const,
                      run: attachCandidateAction.bind(
                        null,
                        candidate.id,
                        match.clinic_id,
                      ),
                    })),
                    {
                      label: "Discard",
                      variant: "destructive" as const,
                      run: discardCandidate.bind(null, candidate.id),
                    },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify in the browser**

Run: `pnpm typecheck && pnpm lint`, then start the dev server via the preview tooling (never Bash) and open `/admin/candidates` signed in as `admin@thrivemap.test` / `password123`:

1. Trigger card renders with 5 service terms and seeded cities.
2. Queue an import (Autism therapy / Quezon City) → toast "Import queued: …".
3. Go to `/admin/jobs`, click "Run tick now".
4. Back on `/admin/candidates`: three fixture candidates listed.
5. Promote one → toast "Draft clinic created", card disappears.
6. Reason field + Discard still works (reason required).

- [ ] **Step 4: Commit**

```bash
git add src/modules/admin/components/ImportTriggerCard.tsx src/app/admin/candidates/page.tsx
git commit -m "Build the candidates workspace: import trigger, matches, promote/attach

Native selects for term+city (long municipality list, Playwright-friendly),
recent import job statuses, live match display per candidate, and
promote/attach/discard through ReviewActions with toast feedback.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: e2e test + docs + full verification

**Files:**

- Create: `e2e/places-import.spec.ts`
- Modify: `.env.example` (Google Maps section, ~line 17)
- Modify: `docs/architecture/jobs.md` (candidate_import section)
- Modify: `docs/architecture/dev-adapters.md` (adapter table/list)
- Modify: `docs/operations/deployment.md` (env vars / optional providers section)

**Interfaces:**

- Consumes: the full flow from Tasks 1–6; e2e helpers copied from `e2e/stage3-flows.spec.ts` (`signIn`, `adminDb`, chromium-only skip).

- [ ] **Step 1: Write the e2e spec**

`e2e/places-import.spec.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "@/lib/database.types";

/**
 * Places import flow: trigger an import (fixture provider), process the job,
 * review candidates, promote one to a draft clinic.
 *
 * Chromium-only: mutates shared demo accounts/queues (same rule as stage 3).
 * Idempotent: fixture rows are deleted up front, so reruns start clean.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function adminDb() {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function cleanupFixtureData() {
  const db = adminDb();
  await db
    .from("external_place_candidates")
    .delete()
    .like("external_id", "fixture-%");
  await db.from("clinics").delete().like("google_place_id", "fixture-%");
  // Allow the import to re-enqueue today: the trigger action idempotency-keys
  // per term+city+day.
  await db.from("jobs").delete().like("idempotency_key", "candidate-import:%");
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page
    .locator("#main-content")
    .getByRole("button", { name: /^sign in$/i })
    .click();
  await page.waitForURL("**/account");
}

test.describe("places import", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Shared demo accounts; chromium project only.",
    );
  });

  test("admin imports fixture candidates and promotes one", async ({
    page,
  }) => {
    await cleanupFixtureData();
    await signIn(page, "admin@thrivemap.test");

    await page.goto("/admin/candidates");
    await page.getByLabel("Service").selectOption("autism-therapy");
    const cityValue = await page
      .locator("#import-city option", { hasText: "Quezon City" })
      .first()
      .getAttribute("value");
    await page.getByLabel("City").selectOption(cityValue!);
    await page.getByRole("button", { name: "Queue import" }).click();
    await expect(page.getByText(/import queued/i)).toBeVisible();

    await page.goto("/admin/jobs");
    await page.getByRole("button", { name: "Run tick now" }).click();

    await page.goto("/admin/candidates");
    await expect(page.getByText("Fixture Autism Care Center")).toBeVisible();

    const card = page.locator("li", {
      hasText: "Fixture Autism Care Center",
    });
    await card.getByRole("button", { name: "Promote" }).click();
    await expect(page.getByText(/draft clinic created/i)).toBeVisible();
    await expect(page.getByText("Fixture Autism Care Center")).toBeHidden();

    const { data: clinic } = await adminDb()
      .from("clinics")
      .select("status, source_type")
      .eq("google_place_id", "fixture-autism-001")
      .single();
    expect(clinic).toMatchObject({
      status: "draft",
      source_type: "external_import",
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e -- places-import`
Expected: 1 passed (chromium), 1 skipped (mobile). Known traps: never `waitForLoadState("networkidle")`; after "Run tick now" the server action completes before navigation resolves, so no extra waiting is needed — if the candidate list is empty, the job likely failed: check `/admin/jobs` dead letters and `.next` dev-server logs.

- [ ] **Step 3: Update docs**

- `.env.example` (Google Maps section): extend the server-key comment:

```
# Server key: restrict by IP + enable Places (New) Text Search, Geocoding.
# When empty, the candidate importer serves deterministic fixtures
# ([DEV ADAPTER]) so the admin import flow works offline.
```

- `docs/architecture/jobs.md`: replace any "stub / ships later" wording for `candidate_import` with a short paragraph: payload `{ query, termSlug, citySlug, requestedBy }`; provider selection (fixture vs live); upsert semantics (data columns refresh, review status preserved); 3-page cap; failures retry into the dead-letter view.
- `docs/architecture/dev-adapters.md`: add the fixture Places provider to the adapter list (trigger condition: `GOOGLE_MAPS_SERVER_API_KEY` empty).
- `docs/operations/deployment.md`: in the optional-providers/env section, add: enabling real imports = set `GOOGLE_MAPS_SERVER_API_KEY` with Places API (New) enabled; imports remain admin-triggered; expect Text Search base-tier billing; fixtures apply otherwise.
- Also update the stale copy on the candidates page — already done in Task 6 (the old "ships in a later stage" paragraph must be gone; verify).

- [ ] **Step 4: Full verification**

Run, in order:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm test:integration`
5. `pnpm build`
6. `pnpm test:e2e`

Expected: all green (e2e: previous counts + the new spec; 5 pre-existing intentional skips remain, plus this spec's mobile skip). The build must succeed without a reachable database (invariant from `5681eb1` — nothing in this feature touches build-time fetching, but confirm no new page breaks it).

- [ ] **Step 5: Commit**

```bash
git add e2e/places-import.spec.ts .env.example docs/architecture/jobs.md docs/architecture/dev-adapters.md docs/operations/deployment.md
git commit -m "Add Places import e2e coverage and documentation

End-to-end: trigger import, run the jobs tick, review fixture candidates,
promote to a draft clinic. Docs cover the fixture adapter, live-key setup,
and the candidate_import payload/semantics.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-review notes (already applied)

- Spec coverage: every spec section maps to a task (RPCs→1, module/providers→2–3, job→4, actions→5, UI→6, e2e/docs→7). Rate limit (spec: 10/hour/admin) in Task 5; idempotency key added as an extra guard consistent with queue semantics.
- Deviation from spec, deliberate: fixture provider's `name` is `"google"` (not a separate provider slug) so fixture rows and future live rows share the `(provider, external_id)` uniqueness space; fixture ids are prefixed `fixture-` and cleaned up by tests.
- `attach_candidate` backfills `google_place_id` when free — spec implies it via `same_place_id` matching; harmless and audited.
- Types: `CandidateMatch` field names match the RPC's return columns; `ReviewActionSpec.run(reason)` matches the promote/attach/discard action signatures `(…, note/reason: string)`.
