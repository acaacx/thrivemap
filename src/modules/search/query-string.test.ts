import { describe, expect, it } from "vitest";
import {
  buildShellUrl,
  cameraKey,
  hasSearchIntent,
  paramsToQueryString,
} from "./query-string";
import { parseSearchParams } from "./schemas";

const base = parseSearchParams({});

describe("paramsToQueryString", () => {
  it("omits defaults", () => {
    expect(paramsToQueryString(base)).toBe("");
  });

  it("serialises location and filters", () => {
    const qs = paramsToQueryString(
      parseSearchParams({
        lat: "14.6",
        lng: "121.0",
        loc: "Quezon City",
        services: "speech-therapy",
        online: "1",
      }),
    );
    expect(qs).toContain("lat=14.60000");
    expect(qs).toContain("services=speech-therapy");
    expect(qs).toContain("online=1");
    expect(qs).toContain("loc=Quezon+City");
  });
});

describe("hasSearchIntent", () => {
  it("is false for the bare shell", () => {
    expect(hasSearchIntent(base)).toBe(false);
  });
  it("is true for any location, filter, or sort", () => {
    expect(hasSearchIntent(parseSearchParams({ sort: "alphabetical" }))).toBe(
      true,
    );
    expect(hasSearchIntent(parseSearchParams({ services: "ot" }))).toBe(true);
    expect(hasSearchIntent(parseSearchParams({ q: "bloom" }))).toBe(true);
  });
});

describe("cameraKey", () => {
  it("changes when the place changes, not when filters change", () => {
    const a = parseSearchParams({ lat: "14.6", lng: "121" });
    const b = parseSearchParams({ lat: "14.6", lng: "121", online: "1" });
    const c = parseSearchParams({ lat: "14.7", lng: "121" });
    expect(cameraKey(a)).toBe(cameraKey(b));
    expect(cameraKey(a)).not.toBe(cameraKey(c));
  });
  it("is null for a bounds search", () => {
    expect(
      cameraKey(
        parseSearchParams({
          lat: "14.6",
          lng: "121",
          north: "15",
          south: "14",
          east: "122",
          west: "120",
        }),
      ),
    ).toBeNull();
  });
});

describe("buildShellUrl", () => {
  it("writes to /clinics with view and selection appended", () => {
    expect(buildShellUrl({ params: base })).toBe("/clinics");
    expect(
      buildShellUrl({
        params: parseSearchParams({ loc: "Cebu" }),
        view: "list",
        selectedId: "abc",
      }),
    ).toBe("/clinics?loc=Cebu&view=list&sel=abc");
  });
});
