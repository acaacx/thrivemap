import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const anon = createClient<Database>(SUPABASE_URL, ANON_KEY);

beforeAll(async () => {
  const { error } = await anon.from("services").select("id").limit(1);
  if (error) {
    throw new Error(
      `Supabase local is not reachable (${error.message}). Run: pnpm exec supabase start && pnpm exec supabase db reset`,
    );
  }
});

describe("search_clinics RPC", () => {
  it("finds clinics within a radius, sorted by distance", async () => {
    const { data, error } = await anon.rpc("search_clinics", {
      p_lat: 14.5995,
      p_lng: 120.9842,
      p_radius_km: 10,
      p_limit: 20,
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(3);
    const distances = data!.map((r) => r.distance_km!);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    expect(distances.every((d) => d <= 10)).toBe(true);
  });

  it("finds clinics inside a bounding box", async () => {
    const { data, error } = await anon.rpc("search_clinics", {
      p_north: 14.8,
      p_south: 14.4,
      p_east: 121.2,
      p_west: 120.9,
      p_limit: 50,
    });
    expect(error).toBeNull();
    // Metro Manila seed clinics; Cebu/Davao must be excluded.
    expect(data!.length).toBeGreaterThanOrEqual(15);
    expect(data!.every((r) => r.latitude! > 14.4 && r.latitude! < 14.8)).toBe(
      true,
    );
  });

  it("filters by service slug", async () => {
    const { data, error } = await anon.rpc("search_clinics", {
      p_service_slugs: ["speech-therapy"],
      p_limit: 50,
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(
      data!.every((r) => r.service_slugs!.includes("speech-therapy")),
    ).toBe(true);
  });

  it("returns only verified clinics when requested", async () => {
    const { data, error } = await anon.rpc("search_clinics", {
      p_verified_only: true,
      p_limit: 50,
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((r) => r.status === "published_verified")).toBe(true);
  });

  it("supports typo-tolerant name search", async () => {
    const { data, error } = await anon.rpc("search_clinics", {
      p_query: "kaleidoscop",
      p_limit: 10,
    });
    expect(error).toBeNull();
    expect(data!.some((r) => r.name.includes("Kaleidoscope"))).toBe(true);
  });

  it("supports full-text search on services and location", async () => {
    const { data, error } = await anon.rpc("search_clinics", {
      p_query: "speech",
      p_limit: 50,
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("never returns suspended or pending clinics", async () => {
    const { data, error } = await anon.rpc("search_clinics", { p_limit: 50 });
    expect(error).toBeNull();
    expect(
      data!.every((r) =>
        [
          "published_verified",
          "published_unverified",
          "temporarily_closed",
        ].includes(r.status),
      ),
    ).toBe(true);
  });

  it("paginates with a keyset cursor without overlap", async () => {
    const page1 = await anon.rpc("search_clinics", {
      p_lat: 14.5995,
      p_lng: 120.9842,
      p_radius_km: 50,
      p_limit: 5,
    });
    const last = page1.data!.at(-1)!;
    const page2 = await anon.rpc("search_clinics", {
      p_lat: 14.5995,
      p_lng: 120.9842,
      p_radius_km: 50,
      p_cursor_value: last.distance_km!,
      p_cursor_id: last.clinic_id,
      p_limit: 5,
    });
    expect(page2.error).toBeNull();
    const ids1 = new Set(page1.data!.map((r) => r.clinic_id));
    expect(page2.data!.every((r) => !ids1.has(r.clinic_id))).toBe(true);
    expect(page2.data![0].distance_km!).toBeGreaterThanOrEqual(
      last.distance_km!,
    );
  });
});

describe("get_map_clinics RPC", () => {
  it("returns lightweight markers in bounds", async () => {
    const { data, error } = await anon.rpc("get_map_clinics", {
      p_north: 14.8,
      p_south: 14.4,
      p_east: 121.2,
      p_west: 120.9,
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(15);
    expect(data![0]).toHaveProperty("latitude");
    expect(data![0]).toHaveProperty("slug");
  });
});

describe("search_ph_locations RPC", () => {
  it("autocompletes city names", async () => {
    const { data, error } = await anon.rpc("search_ph_locations", {
      p_query: "quezon",
    });
    expect(error).toBeNull();
    expect(data!.some((r) => r.label.includes("Quezon City"))).toBe(true);
    expect(data![0].latitude).toBeTypeOf("number");
  });
});
