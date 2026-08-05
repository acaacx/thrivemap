import { describe, expect, it } from "vitest";
import { normalizeGooglePlace } from "./normalize";

describe("normalizeGooglePlace", () => {
  it("normalizes a full Google place", () => {
    const raw = {
      id: "abc123",
      displayName: { text: "Bright Steps Therapy" },
      formattedAddress: "1 Example St, Quezon City",
      location: { latitude: 14.676, longitude: 121.0437 },
      internationalPhoneNumber: "+63 2 8123 4567",
      websiteUri: "https://example.ph",
    };
    expect(normalizeGooglePlace(raw)).toEqual({
      externalId: "abc123",
      name: "Bright Steps Therapy",
      address: "1 Example St, Quezon City",
      latitude: 14.676,
      longitude: 121.0437,
      rawPayload: raw,
    });
  });

  it("tolerates missing optional fields", () => {
    const place = normalizeGooglePlace({ id: "min1" });
    expect(place).toMatchObject({
      externalId: "min1",
      name: "Unnamed place",
      address: null,
      latitude: null,
      longitude: null,
    });
  });

  it("returns null when id is missing", () => {
    expect(normalizeGooglePlace({ displayName: { text: "No id" } })).toBeNull();
  });

  it("returns null for non-objects", () => {
    expect(normalizeGooglePlace("garbage")).toBeNull();
  });
});
