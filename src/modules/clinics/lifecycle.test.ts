import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  LISTING_TRANSITIONS,
  nextStatuses,
  type ListingStatus,
} from "./lifecycle";

const ALL_STATUSES = Object.keys(LISTING_TRANSITIONS) as ListingStatus[];

describe("clinic lifecycle", () => {
  it("covers every listing status", () => {
    expect(ALL_STATUSES).toHaveLength(10);
  });

  it("allows self-transitions (no-op writes)", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });

  it("allows the standard publish path", () => {
    expect(canTransition("draft", "pending_review")).toBe(true);
    expect(canTransition("pending_review", "published_unverified")).toBe(true);
    expect(canTransition("published_unverified", "published_verified")).toBe(true);
  });

  it("rejects jumps that skip review", () => {
    expect(canTransition("draft", "published_verified")).toBe(false);
    expect(canTransition("draft", "published_unverified")).toBe(false);
    expect(canTransition("candidate", "published_verified")).toBe(false);
  });

  it("supports verification revocation and suspension", () => {
    expect(canTransition("published_verified", "published_unverified")).toBe(true);
    expect(canTransition("published_verified", "suspended")).toBe(true);
    expect(canTransition("suspended", "published_verified")).toBe(true);
  });

  it("lets any reviewable or published state be archived (merge path)", () => {
    for (const status of [
      "draft",
      "candidate",
      "pending_review",
      "published_unverified",
      "published_verified",
      "temporarily_closed",
      "suspended",
      "rejected",
      "permanently_closed",
    ] as ListingStatus[]) {
      expect(canTransition(status, "archived")).toBe(true);
    }
  });

  it("treats archived as restore-to-draft only", () => {
    expect(nextStatuses("archived")).toEqual(["draft"]);
    expect(canTransition("archived", "published_unverified")).toBe(false);
  });

  it("assertTransition throws with a readable message", () => {
    expect(() => assertTransition("draft", "published_verified")).toThrow(
      /draft → published_verified/,
    );
    expect(() => assertTransition("draft", "pending_review")).not.toThrow();
  });
});
