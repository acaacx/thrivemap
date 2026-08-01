import { describe, expect, it } from "vitest";
import { parseSearchParams } from "./schemas";

describe("parseSearchParams", () => {
  it("parses a full valid query", () => {
    const params = parseSearchParams({
      lat: "14.5995",
      lng: "120.9842",
      radius: "10",
      services: "speech-therapy,occupational-therapy",
      ages: "toddlers,preschool",
      verified: "1",
      open: "true",
      sort: "nearest",
    });
    expect(params.lat).toBeCloseTo(14.5995);
    expect(params.lng).toBeCloseTo(120.9842);
    expect(params.services).toEqual(["speech-therapy", "occupational-therapy"]);
    expect(params.ages).toEqual(["toddlers", "preschool"]);
    expect(params.verified).toBe(true);
    expect(params.open).toBe(true);
    expect(params.sort).toBe("nearest");
  });

  it("applies defaults for an empty query", () => {
    const params = parseSearchParams({});
    expect(params.radius).toBe(10);
    expect(params.sort).toBe("nearest");
    expect(params.lat).toBeUndefined();
  });

  it("drops invalid keys without nuking valid ones", () => {
    const params = parseSearchParams({
      lat: "not-a-number",
      services: "speech-therapy",
    });
    expect(params.lat).toBeUndefined();
    expect(params.services).toEqual(["speech-therapy"]);
  });

  it("rejects out-of-range coordinates", () => {
    const params = parseSearchParams({ lat: "999", lng: "120" });
    expect(params.lat).toBeUndefined();
    expect(params.lng).toBeCloseTo(120);
  });

  it("clamps unknown sort to default", () => {
    const params = parseSearchParams({ sort: "best" });
    expect(params.sort).toBe("nearest");
  });

  it("rejects invalid age groups", () => {
    const params = parseSearchParams({ ages: "toddlers,not-a-group" });
    expect(params.ages).toBeUndefined();
  });

  it("takes first value of repeated params", () => {
    const params = parseSearchParams({ radius: ["25", "50"] });
    expect(params.radius).toBe(25);
  });
});
