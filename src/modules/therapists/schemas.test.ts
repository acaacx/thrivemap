import { describe, expect, it } from "vitest";
import { moveTherapistSchema, therapistInputSchema } from "./schemas";

describe("therapistInputSchema", () => {
  const valid = {
    full_name: "Maria Santos",
    credentials: "OTRP",
    profession: "Occupational Therapist",
    specialties: ["Sensory integration", "Fine motor skills"],
    bio: "Ten years of pediatric practice.",
  };

  it("accepts a full valid input and trims strings", () => {
    const parsed = therapistInputSchema.parse({
      ...valid,
      full_name: "  Maria Santos  ",
      specialties: [" Sensory integration "],
    });
    expect(parsed.full_name).toBe("Maria Santos");
    expect(parsed.specialties).toEqual(["Sensory integration"]);
  });

  it("accepts minimal input (name + profession only)", () => {
    const parsed = therapistInputSchema.parse({
      full_name: "Jo Cruz",
      profession: "Speech Therapist",
      specialties: [],
    });
    expect(parsed.credentials).toBeUndefined();
    expect(parsed.bio).toBeUndefined();
  });

  it("rejects a too-short name after trimming", () => {
    expect(
      therapistInputSchema.safeParse({
        ...valid,
        full_name: " A ",
      }).success,
    ).toBe(false);
  });

  it("rejects more than 10 specialties", () => {
    expect(
      therapistInputSchema.safeParse({
        ...valid,
        specialties: Array.from({ length: 11 }, (_, i) => `Specialty ${i}`),
      }).success,
    ).toBe(false);
  });

  it("dedupes repeated specialties", () => {
    const parsed = therapistInputSchema.parse({
      ...valid,
      specialties: ["Sensory integration", "Sensory integration", "Fine motor skills"],
    });
    expect(parsed.specialties).toEqual([
      "Sensory integration",
      "Fine motor skills",
    ]);
  });

  it("rejects an empty specialty chip", () => {
    expect(
      therapistInputSchema.safeParse({ ...valid, specialties: ["  "] }).success,
    ).toBe(false);
  });

  it("rejects a bio over 1000 characters", () => {
    expect(
      therapistInputSchema.safeParse({ ...valid, bio: "x".repeat(1001) })
        .success,
    ).toBe(false);
  });

  it("converts empty credentials and bio to undefined", () => {
    const parsed = therapistInputSchema.parse({
      ...valid,
      credentials: "",
      bio: "",
    });
    expect(parsed.credentials).toBeUndefined();
    expect(parsed.bio).toBeUndefined();
  });

  it("converts whitespace-only credentials and bio to undefined", () => {
    const parsed = therapistInputSchema.parse({
      ...valid,
      credentials: "  ",
      bio: "  ",
    });
    expect(parsed.credentials).toBeUndefined();
    expect(parsed.bio).toBeUndefined();
  });
});

describe("moveTherapistSchema", () => {
  it("accepts up/down with a uuid", () => {
    expect(
      moveTherapistSchema.safeParse({
        therapist_id: "6f0d8f6e-2f5b-4d5f-9b6a-0e6a2b1c3d4e",
        direction: "down",
      }).success,
    ).toBe(true);
  });

  it("rejects other directions", () => {
    expect(
      moveTherapistSchema.safeParse({
        therapist_id: "6f0d8f6e-2f5b-4d5f-9b6a-0e6a2b1c3d4e",
        direction: "sideways",
      }).success,
    ).toBe(false);
  });
});
