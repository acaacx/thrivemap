import { describe, expect, it } from "vitest";
import { serviceIcon } from "./service-icons";

const SEEDED = [
  "hand",
  "message-circle",
  "activity",
  "blocks",
  "puzzle",
  "baby",
  "clipboard-list",
  "book-open",
];

describe("serviceIcon", () => {
  it("resolves every seeded services.icon value", () => {
    for (const name of SEEDED) {
      expect(serviceIcon(name)).toBeTruthy();
    }
  });

  it("never returns the fallback for a seeded value", () => {
    const fallback = serviceIcon("does-not-exist");
    for (const name of SEEDED) {
      expect(serviceIcon(name)).not.toBe(fallback);
    }
  });

  it("falls back for null and unknown values", () => {
    expect(serviceIcon(null)).toBe(serviceIcon(undefined));
    expect(serviceIcon("no-such-icon")).toBe(serviceIcon(null));
  });
});
