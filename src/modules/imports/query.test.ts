import { describe, expect, it } from "vitest";
import { buildImportQuery, IMPORT_SERVICE_TERMS } from "./query";

describe("buildImportQuery", () => {
  it("builds the templated query from a known term", () => {
    expect(buildImportQuery("autism-therapy", "Quezon City")).toBe(
      "Autism therapy in Quezon City, Philippines",
    );
  });

  it("throws on unknown term slugs", () => {
    expect(() => buildImportQuery("free-text-injection", "Manila")).toThrow(
      /unknown service term/i,
    );
  });

  it("exposes exactly the five approved terms", () => {
    expect(IMPORT_SERVICE_TERMS.map((t) => t.slug)).toEqual([
      "autism-therapy",
      "occupational-therapy",
      "speech-therapy",
      "developmental-pediatrician",
      "aba-therapy",
    ]);
  });
});
