import { describe, expect, it } from "vitest";
import { reportClinicSchema, suggestClinicSchema } from "./schemas";

const validSuggestion = {
  clinic_name: "Harbor Lights Therapy Rooms",
  address: "88 Demo Lane, Barangay 12, Manila, Metro Manila",
  service_slugs: ["speech-therapy"],
  consent: true,
};

describe("suggestClinicSchema", () => {
  it("accepts a minimal valid suggestion", () => {
    expect(suggestClinicSchema.safeParse(validSuggestion).success).toBe(true);
  });

  it("requires consent", () => {
    const result = suggestClinicSchema.safeParse({
      ...validSuggestion,
      consent: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects coordinates outside the Philippines", () => {
    const result = suggestClinicSchema.safeParse({
      ...validSuggestion,
      latitude: 51.5,
      longitude: -0.12,
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed websites", () => {
    const result = suggestClinicSchema.safeParse({
      ...validSuggestion,
      website: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("allows empty optional strings", () => {
    const result = suggestClinicSchema.safeParse({
      ...validSuggestion,
      phone: "",
      email: "",
      website: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects too-short names", () => {
    const result = suggestClinicSchema.safeParse({
      ...validSuggestion,
      clinic_name: "ab",
    });
    expect(result.success).toBe(false);
  });
});

describe("reportClinicSchema", () => {
  it("accepts a valid report", () => {
    const result = reportClinicSchema.safeParse({
      clinic_id: "0b8f8a3e-1111-4222-8333-444455556666",
      report_type: "wrong_phone",
      details: "The number is out of service.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown report types", () => {
    const result = reportClinicSchema.safeParse({
      clinic_id: "0b8f8a3e-1111-4222-8333-444455556666",
      report_type: "spam",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-uuid clinic ids", () => {
    const result = reportClinicSchema.safeParse({
      clinic_id: "1; drop table clinics",
      report_type: "other",
    });
    expect(result.success).toBe(false);
  });
});
