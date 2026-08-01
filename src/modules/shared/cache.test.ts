import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cachedClinicData,
  getCacheStore,
  invalidateClinicCaches,
  roundCoord,
  setCacheStoreForTesting,
} from "./cache";

describe("cache", () => {
  afterEach(() => {
    setCacheStoreForTesting(undefined);
    vi.useRealTimers();
  });

  it("rounds coordinates to ~110m buckets and handles missing values", () => {
    expect(roundCoord(14.55432)).toBe("14.554");
    expect(roundCoord(120.9999)).toBe("121.000");
    expect(roundCoord(undefined)).toBe("-");
  });

  it("serves the cached value within TTL and reloads after expiry", async () => {
    vi.useFakeTimers();
    const loader = vi.fn(async () => ({ hits: Math.random() }));

    const first = await cachedClinicData("k", 60, loader);
    const second = await cachedClinicData("k", 60, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);

    vi.advanceTimersByTime(61_000);
    await cachedClinicData("k", 60, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidation bumps the namespace so old entries are skipped", async () => {
    const loader = vi.fn(async () => "value");
    await cachedClinicData("k", 60, loader);
    await invalidateClinicCaches();
    await cachedClinicData("k", 60, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("falls back to the loader when the store throws", async () => {
    setCacheStoreForTesting({
      get: async () => {
        throw new Error("boom");
      },
      set: async () => {},
      delete: async () => {},
      increment: async () => 1,
    });
    const result = await cachedClinicData("k", 60, async () => "loaded");
    expect(result).toBe("loaded");
  });

  it("in-memory store expires entries and stores independently per key", async () => {
    const store = getCacheStore();
    await store.set("a", 1, 60);
    await store.set("b", 2, 60);
    expect(await store.get("a")).toBe(1);
    expect(await store.get("b")).toBe(2);
    await store.delete("a");
    expect(await store.get("a")).toBeNull();
  });
});
