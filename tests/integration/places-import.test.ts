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
