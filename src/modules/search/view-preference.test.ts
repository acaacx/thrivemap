import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  VIEW_STORAGE_KEY,
  readStoredView,
  resolveInitialView,
  withViewParam,
  writeStoredView,
} from "./view-preference";

describe("resolveInitialView", () => {
  it("prefers the URL, then storage, then the fallback", () => {
    expect(resolveInitialView("list", "map")).toBe("list");
    expect(resolveInitialView(null, "list")).toBe("list");
    expect(resolveInitialView("bogus", "nope")).toBe("map");
    expect(resolveInitialView(undefined, undefined, "list")).toBe("list");
  });
});

// jsdom's localStorage is not writable in this setup; stub a minimal one.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

describe("stored view", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips through localStorage", () => {
    expect(readStoredView()).toBeNull();
    writeStoredView("list");
    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBe("list");
    expect(readStoredView()).toBe("list");
  });

  it("ignores garbage", () => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, "sideways");
    expect(readStoredView()).toBeNull();
  });
});

describe("withViewParam", () => {
  it("adds, replaces, and removes view without touching other keys", () => {
    expect(withViewParam("loc=Manila", "map")).toBe("loc=Manila&view=map");
    expect(withViewParam("loc=Manila&view=map", "list")).toBe(
      "loc=Manila&view=list",
    );
    expect(withViewParam("loc=Manila&view=map", null)).toBe("loc=Manila");
  });
});
