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
      p_cursor_value: last.sort_value,
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

  // Every sort mode carries a keyset cursor. Paging through in small pages
  // must reproduce the single-shot ordering exactly: no gaps, no repeats.
  describe.each([
    "nearest",
    "relevance",
    "verified_first",
    "recently_verified",
    "alphabetical",
  ] as const)("keyset pagination for sort=%s", (sort) => {
    const baseArgs = {
      p_lat: 14.5995,
      p_lng: 120.9842,
      p_radius_km: 500,
      p_query: sort === "relevance" ? "therapy" : undefined,
      p_sort: sort,
    };

    it("walks the full ordering in pages", async () => {
      const whole = await anon.rpc("search_clinics", {
        ...baseArgs,
        p_limit: 50,
      });
      expect(whole.error).toBeNull();
      const expected = whole.data!.map((r) => r.clinic_id);
      expect(expected.length).toBeGreaterThan(6);

      const walked: string[] = [];
      let cursorValue: number | undefined;
      let cursorText: string | undefined;
      let cursorId: string | undefined;

      for (let page = 0; page < 20; page += 1) {
        const res = await anon.rpc("search_clinics", {
          ...baseArgs,
          p_limit: 3,
          p_cursor_value: cursorValue,
          p_cursor_text: cursorText,
          p_cursor_id: cursorId,
        });
        expect(res.error).toBeNull();
        const rows = res.data ?? [];
        if (rows.length === 0) break;
        walked.push(...rows.map((r) => r.clinic_id));
        const last = rows[rows.length - 1];
        cursorValue = last.sort_value ?? undefined;
        cursorText = last.sort_text ?? undefined;
        cursorId = last.clinic_id;
      }

      expect(walked).toEqual(expected);
      expect(new Set(walked).size).toBe(walked.length);
    });
  });

  it("orders alphabetically by name", async () => {
    const { data, error } = await anon.rpc("search_clinics", {
      p_sort: "alphabetical",
      p_limit: 50,
    });
    expect(error).toBeNull();
    const names = data!.map((r) => r.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    expect(data!.every((r) => r.sort_text === r.name)).toBe(true);
  });

  it("puts verified clinics first for verified_first", async () => {
    const { data, error } = await anon.rpc("search_clinics", {
      p_sort: "verified_first",
      p_limit: 50,
    });
    expect(error).toBeNull();
    const flags = data!.map((r) => (r.status === "published_verified" ? 1 : 0));
    expect([...flags].sort((a, b) => b - a)).toEqual(flags);
  });

  it("orders recently_verified newest first with unverified last", async () => {
    const { data, error } = await anon.rpc("search_clinics", {
      p_sort: "recently_verified",
      p_limit: 50,
    });
    expect(error).toBeNull();
    const keys = data!.map((r) => r.sort_value!);
    expect([...keys].sort((a, b) => b - a)).toEqual(keys);
    // Never-verified rows sort last via the sentinel key.
    const nulls = data!.filter((r) => r.last_verified_at === null);
    expect(nulls.every((r) => r.sort_value === -1)).toBe(true);
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
