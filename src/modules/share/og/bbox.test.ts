// @vitest-environment node
// queries.ts is "server-only"; the alias stub only behaves under node.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchParamsSchema } from "@/modules/search/schemas";
import { PH_BOUNDS } from "./projection";

const getMapClinics = vi.fn();
vi.mock("@/modules/clinics/queries", () => ({
  getMapClinics: (...args: unknown[]) => getMapClinics(...args),
}));

const { MAP_CLINIC_CAP, resolveCardData } = await import("./bbox");

const params = (raw: Record<string, string>) => searchParamsSchema.parse(raw);

const pin = (latitude: number, longitude: number, i = 0) => ({
  clinic_id: `id-${i}`,
  latitude,
  longitude,
  name: `Clinic ${i}`,
  slug: `clinic-${i}`,
  status: "published" as const,
});

beforeEach(() => {
  getMapClinics.mockReset();
});

describe("rung 1 — explicit bounds", () => {
  it("uses north/south/east/west directly", async () => {
    getMapClinics.mockResolvedValue([pin(14.5, 121)]);
    const result = await resolveCardData(
      params({ north: "15", south: "14", east: "121.5", west: "120.5" }),
    );
    expect(getMapClinics).toHaveBeenCalledTimes(1);
    const call = getMapClinics.mock.calls[0]![0];
    expect(call.north).toBeCloseTo(15, 5);
    expect(call.south).toBeCloseTo(14, 5);
    expect(result?.bbox.north).toBeCloseTo(15, 5);
  });

  it("passes service and verified filters through", async () => {
    getMapClinics.mockResolvedValue([pin(14.5, 121)]);
    await resolveCardData(
      params({
        north: "15",
        south: "14",
        east: "121.5",
        west: "120.5",
        services: "speech-therapy,occupational-therapy",
        verified: "1",
      }),
    );
    const call = getMapClinics.mock.calls[0]![0];
    expect(call.services).toEqual(["speech-therapy", "occupational-therapy"]);
    expect(call.verifiedOnly).toBe(true);
  });
});

describe("rung 2 — centre and radius", () => {
  it("derives a bbox from lat/lng/radius", async () => {
    getMapClinics.mockResolvedValue([pin(14.6, 121)]);
    const result = await resolveCardData(
      params({ lat: "14.5995", lng: "120.9842", radius: "10" }),
    );
    expect(getMapClinics).toHaveBeenCalledTimes(1);
    const box = result!.bbox;
    expect(box.north).toBeGreaterThan(14.5995);
    expect(box.south).toBeLessThan(14.5995);
    expect(box.east).toBeGreaterThan(120.9842);
    expect(box.west).toBeLessThan(120.9842);
    // 10km is well under a degree; padding and the min-span clamp widen it,
    // but it must not have become a country-wide box.
    expect(box.north - box.south).toBeLessThan(2);
  });

  it("prefers explicit bounds over lat/lng when both are present", async () => {
    getMapClinics.mockResolvedValue([pin(14.5, 121)]);
    await resolveCardData(
      params({
        north: "15",
        south: "14",
        east: "121.5",
        west: "120.5",
        lat: "7",
        lng: "125",
      }),
    );
    const call = getMapClinics.mock.calls[0]![0];
    expect(call.north).toBeCloseTo(15, 5);
  });
});

describe("rung 3 — country-wide, then fit to pins", () => {
  it("queries PH-wide and refits to the pins", async () => {
    getMapClinics
      .mockResolvedValueOnce([pin(10.3, 123.9, 1), pin(10.4, 124.0, 2)])
      .mockResolvedValueOnce([pin(10.3, 123.9, 1), pin(10.4, 124.0, 2)]);
    const result = await resolveCardData(params({}));
    expect(getMapClinics).toHaveBeenCalledTimes(2);
    expect(getMapClinics.mock.calls[0]![0].north).toBeCloseTo(
      PH_BOUNDS.north,
      5,
    );
    // Refitted around the two pins, not still country-wide.
    expect(result!.bbox.north).toBeLessThan(PH_BOUNDS.north);
    expect(result!.bbox.south).toBeGreaterThan(PH_BOUNDS.south);
  });

  it("returns the refit pins, not the country-wide set", async () => {
    getMapClinics
      .mockResolvedValueOnce([pin(10.3, 123.9, 1), pin(18.0, 120.6, 2)])
      .mockResolvedValueOnce([pin(10.3, 123.9, 1)]);
    const result = await resolveCardData(params({}));
    expect(result!.pins).toHaveLength(1);
  });

  it("keeps the country-wide pins when the refit query returns nothing", async () => {
    getMapClinics
      .mockResolvedValueOnce([pin(10.3, 123.9, 1)])
      .mockResolvedValueOnce([]);
    const result = await resolveCardData(params({}));
    expect(result!.pins).toHaveLength(1);
  });
});

describe("rung 4 — no pins", () => {
  it("returns null when nothing matches", async () => {
    getMapClinics.mockResolvedValue([]);
    expect(await resolveCardData(params({}))).toBeNull();
  });

  it("returns null when nothing matches inside explicit bounds", async () => {
    getMapClinics.mockResolvedValue([]);
    const result = await resolveCardData(
      params({ north: "15", south: "14", east: "121.5", west: "120.5" }),
    );
    expect(result).toBeNull();
  });
});

describe("clamping and the cap", () => {
  it("clamps a hostile world-spanning bbox to the PH bounds", async () => {
    getMapClinics.mockResolvedValue([pin(14.5, 121)]);
    await resolveCardData(
      params({ north: "89", south: "-89", east: "179", west: "-179" }),
    );
    const call = getMapClinics.mock.calls[0]![0];
    expect(call.north).toBeLessThanOrEqual(PH_BOUNDS.north);
    expect(call.south).toBeGreaterThanOrEqual(PH_BOUNDS.south);
  });

  it("flags atCap when the RPC returns its row cap", async () => {
    const pins = Array.from({ length: MAP_CLINIC_CAP }, (_, i) =>
      pin(10 + (i % 10) * 0.1, 122 + (i % 10) * 0.1, i),
    );
    getMapClinics.mockResolvedValue(pins);
    const result = await resolveCardData(
      params({ north: "15", south: "14", east: "121.5", west: "120.5" }),
    );
    expect(result!.atCap).toBe(true);
  });

  it("does not flag atCap below the cap", async () => {
    getMapClinics.mockResolvedValue([pin(14.5, 121)]);
    const result = await resolveCardData(
      params({ north: "15", south: "14", east: "121.5", west: "120.5" }),
    );
    expect(result!.atCap).toBe(false);
  });
});

describe("failure", () => {
  it("propagates a query failure so the route can fall back", async () => {
    getMapClinics.mockRejectedValue(new Error("boom"));
    await expect(resolveCardData(params({}))).rejects.toThrow("boom");
  });
});
