import { describe, expect, it } from "vitest";
import {
  adminClinicIdentitySchema,
  importCityTextSchema,
  placeLookupNameSchema,
  slugifyCity,
} from "./schemas";

describe("importCityTextSchema", () => {
  it("accepts ordinary PH city names", () => {
    for (const city of [
      "Iloilo City",
      "Cagayan de Oro",
      "General Santos",
      "Baguio",
    ]) {
      expect(importCityTextSchema.safeParse(city).success).toBe(true);
    }
  });

  it("trims and collapses whitespace", () => {
    expect(importCityTextSchema.parse("  Cagayan   de  Oro ")).toBe(
      "Cagayan de Oro",
    );
  });

  it("rejects digits, punctuation and empty input", () => {
    for (const bad of [
      "",
      " ",
      "Cebu, PH",
      "City123",
      "Cebu; drop",
      "x".repeat(61),
    ]) {
      expect(importCityTextSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("slugifyCity", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyCity("Cagayan de Oro")).toBe("cagayan-de-oro");
    expect(slugifyCity("Iloilo City")).toBe("iloilo-city");
    expect(slugifyCity("Sta. Rosa")).toBe("sta-rosa");
  });
});

describe("adminClinicIdentitySchema", () => {
  it("accepts a trimmed name and address", () => {
    const parsed = adminClinicIdentitySchema.parse({
      name: "  Bright Steps Therapy Center ",
      address_line1: " 12 Katipunan Ave ",
    });
    expect(parsed).toEqual({
      name: "Bright Steps Therapy Center",
      address_line1: "12 Katipunan Ave",
    });
  });

  it("rejects an empty name", () => {
    const result = adminClinicIdentitySchema.safeParse({
      name: "   ",
      address_line1: "12 Katipunan Ave",
    });
    expect(result.success).toBe(false);
  });

  it("allows an empty address line (clinic may have no location yet)", () => {
    const result = adminClinicIdentitySchema.safeParse({
      name: "Bright Steps",
      address_line1: "",
    });
    expect(result.success).toBe(true);
  });

  it("caps name length at 200", () => {
    const result = adminClinicIdentitySchema.safeParse({
      name: "x".repeat(201),
      address_line1: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("placeLookupNameSchema", () => {
  it("accepts real center names", () => {
    for (const name of [
      "Bright Steps Therapy Center",
      "St. Luke's Developmental Clinic",
      "ABC & Me Learning Hub",
      "TheraKids (Cebu)",
      "Kids' Corner - Makati",
    ]) {
      expect(placeLookupNameSchema.safeParse(name).success).toBe(true);
    }
  });

  it("trims and collapses whitespace", () => {
    expect(placeLookupNameSchema.parse("  Bright   Steps ")).toBe(
      "Bright Steps",
    );
  });

  it("rejects empty, too-short, too-long and shady input", () => {
    for (const bad of [
      "",
      " ",
      "A",
      "x".repeat(81),
      "name; drop table",
      "<script>",
      'a"quote',
    ]) {
      expect(placeLookupNameSchema.safeParse(bad).success).toBe(false);
    }
  });
});
