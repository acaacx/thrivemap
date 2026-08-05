import { describe, expect, it } from "vitest";
import { FixturePlacesProvider } from "./fixtures";

describe("FixturePlacesProvider", () => {
  const provider = new FixturePlacesProvider();

  it("is named google (stand-in for the live provider)", () => {
    expect(provider.name).toBe("google");
  });

  it("serves the autism-therapy fixture for autism queries", async () => {
    const { places, skipped } = await provider.searchText(
      "Autism therapy in Quezon City, Philippines",
    );
    expect(skipped).toBe(0);
    expect(places.length).toBeGreaterThanOrEqual(3);
    expect(places.map((p) => p.name)).toContain("Fixture Autism Care Center");
    expect(places.every((p) => p.externalId.startsWith("fixture-"))).toBe(true);
  });

  it("is deterministic", async () => {
    const a = await provider.searchText(
      "Autism therapy in Quezon City, Philippines",
    );
    const b = await provider.searchText(
      "Autism therapy in Quezon City, Philippines",
    );
    expect(a).toEqual(b);
  });

  it("falls back to the generic fixture for unknown queries", async () => {
    const { places } = await provider.searchText(
      "Speech therapy in Davao City, Philippines",
    );
    expect(places.length).toBeGreaterThanOrEqual(1);
    expect(places.map((p) => p.name)).toContain("Fixture Developmental Clinic");
  });
});
