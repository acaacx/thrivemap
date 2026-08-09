import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSnapshot, writeSnapshot, SNAPSHOT_KEY } from "./snapshot";

const item = {
  slug: "a-clinic",
  name: "A Clinic",
  address: "1 St, Manila",
  phone: "+63 2 1234",
};

// Mock localStorage that preserves spy capability
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] || null,
  };
})();

vi.stubGlobal("localStorage", mockLocalStorage);

describe("favorites snapshot", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips items", () => {
    writeSnapshot([item]);
    expect(readSnapshot()).toEqual([item]);
  });
  it("returns null when absent", () => {
    expect(readSnapshot()).toBeNull();
  });
  it("returns null on corrupt JSON", () => {
    localStorage.setItem(SNAPSHOT_KEY, "{not json");
    expect(readSnapshot()).toBeNull();
  });
  it("returns null on version mismatch", () => {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ version: 2, savedAt: "", items: [item] }),
    );
    expect(readSnapshot()).toBeNull();
  });
  it("write tolerates localStorage throwing", () => {
    const spy = vi.spyOn(mockLocalStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => writeSnapshot([item])).not.toThrow();
    spy.mockRestore();
  });
});
