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

  it("admin can insert and delete rows for a clinic they don't manage", async () => {
    const rep = await signedInClient("clinicrep@thrivemap.test");
    const clinicId = await managedClinicId(rep);
    const admin = await signedInClient("admin@thrivemap.test");

    const { data: inserted, error: insertError } = await admin
      .from("clinic_therapists")
      .insert({
        clinic_id: clinicId,
        full_name: `${MARKER} Admin`,
        profession: "Physical Therapist",
        specialties: ["Gross motor skills"],
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const { error: deleteError } = await admin
      .from("clinic_therapists")
      .delete()
      .eq("id", inserted!.id);
    expect(deleteError).toBeNull();
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
    expect(hits?.some((h) => h.clinic_id === clinicId)).toBe(true);

    const { data: nameHits } = await anon.rpc("search_clinics", {
      p_query: "searchable",
    });
    expect(nameHits?.some((h) => h.clinic_id === clinicId)).toBe(true);

    await rep.from("clinic_therapists").delete().eq("id", inserted!.id);
    const { data: afterDelete } = await anon.rpc("search_clinics", {
      p_query: "hippotherapy",
    });
    expect(afterDelete?.some((h) => h.clinic_id === clinicId)).toBe(false);
  });
});
