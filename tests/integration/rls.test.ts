import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

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

beforeAll(async () => {
  const { error } = await anonClient().from("services").select("id").limit(1);
  if (error) throw new Error(`Supabase local not reachable: ${error.message}`);
});

describe("RLS: anonymous visitors", () => {
  const anon = anonClient();

  it("can read published clinics only", async () => {
    const { data } = await anon.from("clinics").select("status");
    expect(data!.length).toBeGreaterThan(0);
    expect(
      data!.every((c) =>
        ["published_verified", "published_unverified", "temporarily_closed"].includes(c.status),
      ),
    ).toBe(true);
  });

  it("cannot read audit logs", async () => {
    const { data } = await anon.from("audit_logs").select("id");
    expect(data).toEqual([]);
  });

  it("cannot read external place candidates", async () => {
    const { data } = await anon.from("external_place_candidates").select("id");
    expect(data).toEqual([]);
  });

  it("cannot read favorites", async () => {
    const { data } = await anon.from("favorites").select("clinic_id");
    expect(data).toEqual([]);
  });

  it("cannot read claims", async () => {
    const { data } = await anon.from("clinic_claims").select("id");
    expect(data).toEqual([]);
  });

  it("cannot update clinics", async () => {
    const { data: clinics } = await anon.from("clinics").select("id, name").limit(1);
    const { data: updated, error } = await anon
      .from("clinics")
      .update({ name: "Hacked Name" })
      .eq("id", clinics![0].id)
      .select();
    // Either a permission error (no UPDATE grant for anon) or zero rows (RLS).
    if (error) {
      expect(error.message).toMatch(/permission denied/i);
    } else {
      expect(updated).toEqual([]);
    }
    // Regardless, the row must be unchanged.
    const { data: after } = await anon
      .from("clinics")
      .select("name")
      .eq("id", clinics![0].id)
      .single();
    expect(after!.name).toBe(clinics![0].name);
  });
});

describe("RLS: registered caregiver", () => {
  it("sees only their own favorites and reports", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data: favorites } = await caregiver.from("favorites").select("user_id");
    expect(favorites!.length).toBeGreaterThan(0);
    const { data: userInfo } = await caregiver.auth.getUser();
    expect(favorites!.every((f) => f.user_id === userInfo.user!.id)).toBe(true);

    const { data: reports } = await caregiver.from("clinic_reports").select("reported_by");
    expect(reports!.every((r) => r.reported_by === userInfo.user!.id)).toBe(true);
  });

  it("cannot read audit logs", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data } = await caregiver.from("audit_logs").select("id");
    expect(data).toEqual([]);
  });

  it("can insert and delete their own favorite", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data: userInfo } = await caregiver.auth.getUser();
    const { data: clinic } = await caregiver
      .from("clinics")
      .select("id")
      .eq("slug", "bloom-developmental-services")
      .single();

    // Idempotent against leftovers from e2e runs sharing the demo account.
    await caregiver
      .from("favorites")
      .delete()
      .eq("user_id", userInfo.user!.id)
      .eq("clinic_id", clinic!.id);

    const { error: insertError } = await caregiver
      .from("favorites")
      .insert({ user_id: userInfo.user!.id, clinic_id: clinic!.id });
    expect(insertError).toBeNull();

    const { error: deleteError } = await caregiver
      .from("favorites")
      .delete()
      .eq("user_id", userInfo.user!.id)
      .eq("clinic_id", clinic!.id);
    expect(deleteError).toBeNull();
  });

  it("cannot favorite as another user", async () => {
    const caregiver = await signedInClient("caregiver@thrivemap.test");
    const { data: clinic } = await caregiver.from("clinics").select("id").limit(1).single();
    const { error } = await caregiver.from("favorites").insert({
      user_id: "00000000-0000-0000-0000-000000000001",
      clinic_id: clinic!.id,
    });
    expect(error).not.toBeNull();
  });
});

describe("RLS: moderator", () => {
  it("can read pending submissions", async () => {
    const moderator = await signedInClient("moderator@thrivemap.test");
    const { data } = await moderator.from("clinic_submissions").select("id");
    expect(data!.length).toBeGreaterThan(0);
  });

  it("can read all reports", async () => {
    const moderator = await signedInClient("moderator@thrivemap.test");
    const { data } = await moderator.from("clinic_reports").select("id");
    expect(data!.length).toBeGreaterThan(0);
  });
});

describe("RLS: administrator", () => {
  it("can read audit logs", async () => {
    const admin = await signedInClient("admin@thrivemap.test");
    const { data, error } = await admin.from("audit_logs").select("id").limit(5);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });
});
