import { describe, expect, it } from "vitest";
import {
  formatCountChip,
  formatDistanceChip,
  formatServiceChip,
} from "./filter-chip-labels";

const services = [
  { slug: "speech-therapy", name: "Speech & Language Therapy" },
  { slug: "ot", name: "Occupational Therapy" },
  { slug: "aba", name: "ABA Therapy" },
];

describe("formatServiceChip", () => {
  it("is the plain category when nothing is chosen", () => {
    expect(formatServiceChip([], services)).toBe("Service");
  });
  it("names a single choice", () => {
    expect(formatServiceChip(["ot"], services)).toBe("Occupational Therapy");
  });
  it("names the first choice and counts the rest", () => {
    expect(formatServiceChip(["ot", "aba"], services)).toBe(
      "Occupational Therapy +1",
    );
  });
  it("falls back to the slug for an unknown service", () => {
    expect(formatServiceChip(["mystery"], services)).toBe("mystery");
  });
});

describe("formatCountChip", () => {
  it("appends a count only when something is chosen", () => {
    expect(formatCountChip("Age group", 0)).toBe("Age group");
    expect(formatCountChip("Age group", 2)).toBe("Age group · 2");
  });
});

describe("formatDistanceChip", () => {
  it("shows the radius", () => {
    expect(formatDistanceChip(10)).toBe("Within 10 km");
    expect(formatDistanceChip(1)).toBe("Within 1 km");
  });
});
