import { describe, expect, it } from "vitest";
import {
  distanceKm,
  parseSnapshot,
  snapshotMatches,
  snapshotOrigin,
  snapshotSearch,
  type SearchSnapshot,
} from "./search-snapshot";

const base: SearchSnapshot = {
  url: "/clinics?lat=14.59950&lng=120.98420&sel=abc",
  listScrollTop: 240,
  mapCenter: { latitude: 14.6, longitude: 121 },
  mapZoom: 13.5,
  sheetSnap: "mid",
  selectedId: "abc",
};

describe("parseSnapshot", () => {
  it("round-trips a valid snapshot", () => {
    expect(parseSnapshot(JSON.stringify(base))).toEqual(base);
  });

  it("returns null for garbage, non-objects and missing url", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot("")).toBeNull();
    expect(parseSnapshot("not json")).toBeNull();
    expect(parseSnapshot("42")).toBeNull();
    expect(parseSnapshot(JSON.stringify({ listScrollTop: 3 }))).toBeNull();
  });

  it("falls back field by field on malformed values", () => {
    const parsed = parseSnapshot(
      JSON.stringify({
        url: "/clinics?loc=Cebu",
        listScrollTop: -10,
        mapCenter: { latitude: "x", longitude: 1 },
        mapZoom: "far",
        sheetSnap: "huge",
        selectedId: 12,
      }),
    );
    expect(parsed).toEqual({
      url: "/clinics?loc=Cebu",
      listScrollTop: 0,
      mapCenter: null,
      mapZoom: null,
      sheetSnap: "collapsed",
      selectedId: null,
    });
  });
});

describe("snapshotSearch / snapshotMatches", () => {
  it("extracts the query string", () => {
    expect(snapshotSearch("/clinics?lat=1&lng=2")).toBe("?lat=1&lng=2");
    expect(snapshotSearch("/clinics")).toBe("");
    expect(snapshotSearch("/clinics?")).toBe("");
  });

  it("matches on the query string only", () => {
    expect(snapshotMatches(base, "?lat=14.59950&lng=120.98420&sel=abc")).toBe(
      true,
    );
    expect(snapshotMatches(base, "?lat=14.59950&lng=120.98420")).toBe(false);
    expect(snapshotMatches(null, "?lat=1")).toBe(false);
    expect(snapshotMatches({ ...base, url: "/clinics" }, "")).toBe(true);
    expect(snapshotMatches({ ...base, url: "/" }, "?")).toBe(true);
  });
});

describe("snapshotOrigin", () => {
  it("reads lat/lng from the snapshot URL", () => {
    expect(snapshotOrigin(base)).toEqual({
      latitude: 14.5995,
      longitude: 120.9842,
    });
  });
  it("is null without coordinates", () => {
    expect(snapshotOrigin({ ...base, url: "/clinics?loc=Cebu" })).toBeNull();
    expect(snapshotOrigin(null)).toBeNull();
  });
});

describe("distanceKm", () => {
  it("is zero for the same point and symmetric", () => {
    const a = { latitude: 14.5995, longitude: 120.9842 };
    const b = { latitude: 14.676, longitude: 121.0437 };
    expect(distanceKm(a, a)).toBe(0);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 10);
  });
  it("Manila → Quezon City is about 10 km", () => {
    const d = distanceKm(
      { latitude: 14.5995, longitude: 120.9842 },
      { latitude: 14.676, longitude: 121.0437 },
    );
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(12);
  });
});
