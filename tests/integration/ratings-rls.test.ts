import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

/** Creates the user if they don't already exist (idempotent across runs). */
async function ensureUser(svc: ReturnType<typeof serviceClient>, email: string) {
  const { data: list, error: listError } = await svc.auth.admin.listUsers();
  if (listError) throw new Error(`listUsers failed: ${listError.message}`);
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw new Error(`Failed to create ${email}: ${error.message}`);
  return data.user!.id;
}

/** A published clinic with no existing ratings and no manager rows at all. */
async function targetClinicId(svc: ReturnType<typeof serviceClient>) {
  const { data: clinics, error } = await svc
    .from("clinics")
    .select("id, clinic_ratings(id), clinic_managers(id)")
    .in("status", ["published_verified", "published_unverified"])
    .is("deleted_at", null)
    .limit(200);
  if (error) throw new Error(`target clinic query failed: ${error.message}`);
  const hit = clinics?.find(
    (c) =>
      (c.clinic_ratings?.length ?? 0) === 0 &&
      (c.clinic_managers?.length ?? 0) === 0,
  );
  if (!hit) {
    throw new Error(
      "seed data: no published clinic without ratings/managers found",
    );
  }
  return hit.id;
}

/** The clinic clinicrep@ actively manages. */
async function managedClinicId(rep: Awaited<ReturnType<typeof signedInClient>>) {
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

const EMAIL_A = "itest-ratings-a@thrivemap.test";
const EMAIL_B = "itest-ratings-b@thrivemap.test";

let a: Awaited<ReturnType<typeof signedInClient>>;
let b: Awaited<ReturnType<typeof signedInClient>>;
let admin: Awaited<ReturnType<typeof signedInClient>>;
let aId: string;
let bId: string;
let adminId: string;
let clinicId: string;
let aRatingId: string;

async function cleanup() {
  const svc = serviceClient();
  const { data: list } = await svc.auth.admin.listUsers();
  const ids = list.users
    .filter((u) => u.email === EMAIL_A || u.email === EMAIL_B)
    .map((u) => u.id);
  if (ids.length) {
    await svc.from("clinic_ratings").delete().in("user_id", ids);
  }
}

beforeAll(async () => {
  const { error } = await anonClient().from("services").select("id").limit(1);
  if (error) throw new Error(`Supabase local not reachable: ${error.message}`);

  await cleanup();

  const svc = serviceClient();
  aId = await ensureUser(svc, EMAIL_A);
  bId = await ensureUser(svc, EMAIL_B);
  clinicId = await targetClinicId(svc);

  a = await signedInClient(EMAIL_A);
  b = await signedInClient(EMAIL_B);
  admin = await signedInClient("admin@thrivemap.test");
  const { data: adminMe } = await admin.auth.getUser();
  adminId = adminMe.user!.id;
});

afterAll(cleanup);

describe("clinic_ratings RLS and stats trigger", () => {
  it("owner can insert then upsert their own rating", async () => {
    const { data: inserted, error: insertError } = await a
      .from("clinic_ratings")
      .insert({
        clinic_id: clinicId,
        user_id: aId,
        communication: 4,
        sensory_friendliness: 5,
        affirming_approach: 4,
        scheduling: 3,
      })
      .select("id, communication")
      .single();
    expect(insertError).toBeNull();
    expect(inserted?.communication).toBe(4);
    aRatingId = inserted!.id;

    const { data: upserted, error: upsertError } = await a
      .from("clinic_ratings")
      .upsert(
        {
          clinic_id: clinicId,
          user_id: aId,
          communication: 5,
          sensory_friendliness: 5,
          affirming_approach: 4,
          scheduling: 3,
        },
        { onConflict: "clinic_id,user_id" },
      )
      .select("id, communication")
      .single();
    expect(upsertError).toBeNull();
    expect(upserted?.communication).toBe(5);
    expect(upserted?.id).toBe(aRatingId);
  });

  it("rejects a second plain insert for the same clinic (unique violation)", async () => {
    const { error } = await a.from("clinic_ratings").insert({
      clinic_id: clinicId,
      user_id: aId,
      communication: 3,
      sensory_friendliness: 3,
      affirming_approach: 3,
      scheduling: 3,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23505");
  });

  it("blocks a manager from rating the clinic they manage", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const { data: repMe } = await rep.auth.getUser();
    const repManagedClinicId = await managedClinicId(rep);

    const { error } = await rep.from("clinic_ratings").insert({
      clinic_id: repManagedClinicId,
      user_id: repMe.user!.id,
      communication: 5,
      sensory_friendliness: 5,
      affirming_approach: 5,
      scheduling: 5,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("keeps ratings private to their author (except admins)", async () => {
    const { data: bSees, error: bError } = await b
      .from("clinic_ratings")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("user_id", aId);
    expect(bError).toBeNull();
    expect(bSees ?? []).toHaveLength(0);

    const { data: adminSees, error: adminError } = await admin
      .from("clinic_ratings")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("user_id", aId);
    expect(adminError).toBeNull();
    expect(adminSees).toHaveLength(1);
  });

  it("computes stats correctly, readable anonymously", async () => {
    const { error: bInsertError } = await b.from("clinic_ratings").insert({
      clinic_id: clinicId,
      user_id: bId,
      communication: 4,
      sensory_friendliness: 4,
      affirming_approach: 4,
      scheduling: 4,
    });
    expect(bInsertError).toBeNull();

    const anon = anonClient();
    const { data: stats, error: statsError } = await anon
      .from("clinic_rating_stats")
      .select("rating_count, avg_communication")
      .eq("clinic_id", clinicId)
      .single();
    expect(statsError).toBeNull();
    expect(stats?.rating_count).toBe(2);
    expect(Number(stats?.avg_communication)).toBe(4.5);
  });

  it("excludes voided rows from stats and freezes them from author updates", async () => {
    const svc = serviceClient();
    const anon = anonClient();

    const { error: voidError } = await svc
      .from("clinic_ratings")
      .update({ voided_at: new Date().toISOString(), voided_by: adminId })
      .eq("id", aRatingId);
    expect(voidError).toBeNull();

    const { data: statsAfterVoid, error: statsAfterVoidError } = await anon
      .from("clinic_rating_stats")
      .select("rating_count, avg_communication")
      .eq("clinic_id", clinicId)
      .single();
    expect(statsAfterVoidError).toBeNull();
    expect(statsAfterVoid?.rating_count).toBe(1);
    expect(Number(statsAfterVoid?.avg_communication)).toBe(4);

    const { data: aUpdateAttempt, error: aUpdateError } = await a
      .from("clinic_ratings")
      .update({ communication: 1 })
      .eq("id", aRatingId)
      .select("id");
    expect(aUpdateError).toBeNull();
    expect(aUpdateAttempt ?? []).toHaveLength(0);

    const { error: unvoidError } = await svc
      .from("clinic_ratings")
      .update({ voided_at: null, voided_by: null })
      .eq("id", aRatingId);
    expect(unvoidError).toBeNull();

    const { data: statsAfterUnvoid, error: statsAfterUnvoidError } = await anon
      .from("clinic_rating_stats")
      .select("rating_count, avg_communication")
      .eq("clinic_id", clinicId)
      .single();
    expect(statsAfterUnvoidError).toBeNull();
    expect(statsAfterUnvoid?.rating_count).toBe(2);
    expect(Number(statsAfterUnvoid?.avg_communication)).toBe(4.5);
  });

  it("recomputes stats on delete, and removes the row when the last rating goes", async () => {
    const anon = anonClient();

    const { error: aDeleteError } = await a
      .from("clinic_ratings")
      .delete()
      .eq("id", aRatingId);
    expect(aDeleteError).toBeNull();

    const { data: statsAfterADelete, error: statsAfterADeleteError } = await anon
      .from("clinic_rating_stats")
      .select("rating_count, avg_communication")
      .eq("clinic_id", clinicId)
      .single();
    expect(statsAfterADeleteError).toBeNull();
    expect(statsAfterADelete?.rating_count).toBe(1);
    expect(Number(statsAfterADelete?.avg_communication)).toBe(4);

    const { error: bDeleteError } = await b
      .from("clinic_ratings")
      .delete()
      .eq("clinic_id", clinicId)
      .eq("user_id", bId);
    expect(bDeleteError).toBeNull();

    const { data: statsGone, error: statsGoneError } = await anon
      .from("clinic_rating_stats")
      .select("rating_count")
      .eq("clinic_id", clinicId)
      .maybeSingle();
    expect(statsGoneError).toBeNull();
    expect(statsGone).toBeNull();
  });
});
