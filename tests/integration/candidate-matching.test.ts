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
        raw_payload: { id: CAND_NEAR.external_id },
      },
      {
        provider: "google",
        external_id: CAND_PLACE.external_id,
        normalized_name: "Completely Different Name",
        latitude: 14.7,
        longitude: 121.1,
        raw_payload: { id: CAND_PLACE.external_id },
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
        raw_payload: { id: CAND_ATTACH.external_id },
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
