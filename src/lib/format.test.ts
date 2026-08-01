import { describe, expect, it } from "vitest";
import { dayName, formatDistanceKm, formatTime, slugToTitle, statusLabel } from "./format";

describe("formatDistanceKm", () => {
  it("formats sub-100m", () => expect(formatDistanceKm(0.05)).toBe("less than 100 m"));
  it("formats meters", () => expect(formatDistanceKm(0.55)).toBe("550 m"));
  it("formats small km with decimal", () => expect(formatDistanceKm(4.26)).toBe("4.3 km"));
  it("rounds large km", () => expect(formatDistanceKm(12.7)).toBe("13 km"));
  it("handles null", () => expect(formatDistanceKm(null)).toBeNull());
  it("handles NaN", () => expect(formatDistanceKm(Number.NaN)).toBeNull());
});

describe("formatTime", () => {
  it("formats morning", () => expect(formatTime("08:30:00")).toBe("8:30 AM"));
  it("formats afternoon", () => expect(formatTime("17:00:00")).toBe("5:00 PM"));
  it("formats midnight", () => expect(formatTime("00:15:00")).toBe("12:15 AM"));
  it("formats noon", () => expect(formatTime("12:00:00")).toBe("12:00 PM"));
});

describe("dayName", () => {
  it("maps Sunday", () => expect(dayName(0)).toBe("Sunday"));
  it("maps Saturday", () => expect(dayName(6)).toBe("Saturday"));
});

describe("statusLabel", () => {
  it("labels verified", () => expect(statusLabel("published_verified")).toBe("Verified"));
  it("labels unverified", () => expect(statusLabel("published_unverified")).toBe("Unverified"));
});

describe("slugToTitle", () => {
  it("titles slugs", () => expect(slugToTitle("quezon-city")).toBe("Quezon City"));
});
