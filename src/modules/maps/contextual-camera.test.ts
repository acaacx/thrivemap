import { describe, expect, it } from "vitest";
import { contextualSelectionZoom } from "./contextual-camera";

describe("contextualSelectionZoom", () => {
  it("zooms a country-level map into the selected clinic area", () => {
    expect(contextualSelectionZoom(5)).toBe(11);
  });

  it("preserves a closer camera chosen by the visitor", () => {
    expect(contextualSelectionZoom(13)).toBe(13);
  });
});
