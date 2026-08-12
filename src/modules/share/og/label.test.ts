import { describe, expect, it } from "vitest";
import { searchParamsSchema } from "@/modules/search/schemas";
import { buildFallbackLabels, buildLabels } from "./label";

const SERVICE_NAMES = {
  "occupational-therapy": "Occupational therapy",
  "speech-therapy": "Speech therapy",
  "early-intervention": "Early intervention",
};

const params = (raw: Record<string, string>) => searchParamsSchema.parse(raw);

describe("buildLabels headlines", () => {
  it("names one service and the place", () => {
    const labels = buildLabels({
      params: params({ services: "occupational-therapy", loc: "Davao City" }),
      pinCount: 12,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Occupational therapy in Davao City");
  });

  it("summarises multiple services as '+ N more'", () => {
    const labels = buildLabels({
      params: params({
        services: "speech-therapy,occupational-therapy",
        loc: "Cebu City",
      }),
      pinCount: 8,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Speech therapy + 1 more in Cebu City");
  });

  it("quotes a free-text query", () => {
    const labels = buildLabels({
      params: params({ q: "sensory gym" }),
      pinCount: 4,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe('"sensory gym" — therapy clinics');
  });

  it("describes a verified-only filter", () => {
    const labels = buildLabels({
      params: params({ verified: "1" }),
      pinCount: 30,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Verified clinics in the Philippines");
  });

  it("falls back to the country-wide headline with no filters", () => {
    const labels = buildLabels({
      params: params({}),
      pinCount: 120,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Therapy clinics across the Philippines");
  });

  it("uses the slug when a service name is unknown", () => {
    const labels = buildLabels({
      params: params({ services: "hippotherapy", loc: "Baguio" }),
      pinCount: 2,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Hippotherapy in Baguio");
  });
});

describe("buildLabels counts", () => {
  it("counts the pins it drew", () => {
    const labels = buildLabels({
      params: params({}),
      pinCount: 12,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.count).toBe("12 clinics on this map");
  });

  it("singularises one clinic", () => {
    const labels = buildLabels({
      params: params({}),
      pinCount: 1,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.count).toBe("1 clinic on this map");
  });

  it("reports the cap as a floor, not a total", () => {
    const labels = buildLabels({
      params: params({}),
      pinCount: 400,
      atCap: true,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.count).toBe("400+ clinics on this map");
  });
});

describe("buildLabels safety", () => {
  it("strips XML-significant characters from loc", () => {
    const labels = buildLabels({
      params: params({ loc: "</text><script>alert(1)</script>" }),
      pinCount: 3,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).not.toContain("<");
    expect(labels.headline).not.toContain(">");
    expect(labels.alt).not.toContain("<");
  });

  it("strips XML-significant characters from q", () => {
    const labels = buildLabels({
      params: params({ q: "a & b <c>" }),
      pinCount: 3,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).not.toContain("<");
    expect(labels.headline).not.toContain("&");
  });

  it("clamps a long headline so it cannot overflow the card", () => {
    const labels = buildLabels({
      params: params({ loc: "A".repeat(120) }),
      pinCount: 3,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline.length).toBeLessThanOrEqual(80);
    expect(labels.headline.endsWith("…")).toBe(true);
  });

  it("collapses newlines and tabs into single spaces", () => {
    const labels = buildLabels({
      params: params({ loc: "Cebu\n\tCity" }),
      pinCount: 3,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Therapy clinics in Cebu City");
  });
});

describe("buildLabels alt and description", () => {
  it("describes the image for screen readers", () => {
    const labels = buildLabels({
      params: params({ services: "speech-therapy", loc: "Cebu City" }),
      pinCount: 7,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.alt).toContain("map of the Philippines");
    expect(labels.alt).toContain("7");
    expect(labels.alt).toContain("Cebu City");
  });

  it("writes a description that names the filter", () => {
    const labels = buildLabels({
      params: params({ services: "speech-therapy", loc: "Cebu City" }),
      pinCount: 7,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.description).toContain("Speech therapy");
    expect(labels.description).toContain("Cebu City");
  });
});

describe("buildFallbackLabels", () => {
  it("frames zero results without claiming a count", () => {
    const labels = buildFallbackLabels(
      params({ services: "speech-therapy", loc: "Batanes" }),
      SERVICE_NAMES,
    );
    expect(labels.headline).toBe("Speech therapy in Batanes");
    expect(labels.count).toBe("No clinics match yet");
    expect(labels.count).not.toMatch(/\d/);
  });

  it("still produces alt text", () => {
    const labels = buildFallbackLabels(params({}), SERVICE_NAMES);
    expect(labels.alt.length).toBeGreaterThan(10);
  });
});
