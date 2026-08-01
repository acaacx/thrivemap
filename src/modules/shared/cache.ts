import "server-only";

/**
 * CacheStore behind an interface: in-memory locally, Upstash Redis when
 * configured. Clinic-derived entries live under a versioned namespace —
 * invalidation bumps the version instead of enumerating keys, which works
 * on both backends.
 */

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Atomic-enough counter used for namespace versioning. */
  increment(key: string): Promise<number>;
}

/** [DEV ADAPTER] Per-instance map with TTL. Fine for local dev. */
class InMemoryCacheStore implements CacheStore {
  private entries = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number) {
    if (this.entries.size > 5_000) {
      const now = Date.now();
      for (const [k, v] of this.entries) {
        if (v.expiresAt < now) this.entries.delete(k);
      }
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async delete(key: string) {
    this.entries.delete(key);
  }

  async increment(key: string) {
    const current = ((await this.get<number>(key)) ?? 0) + 1;
    // Versions must outlive every entry that embeds them.
    await this.set(key, current, 30 * 86_400);
    return current;
  }
}

class UpstashCacheStore implements CacheStore {
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async command<T>(cmd: (string | number)[]): Promise<T | null> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("Upstash cache error:", res.status);
      return null;
    }
    const json = (await res.json()) as { result: T };
    return json.result;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.command<string | null>(["GET", key]);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number) {
    await this.command(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
  }

  async delete(key: string) {
    await this.command(["DEL", key]);
  }

  async increment(key: string) {
    return (await this.command<number>(["INCR", key])) ?? 0;
  }
}

let store: CacheStore | undefined;

export function getCacheStore(): CacheStore {
  if (!store) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      store = new UpstashCacheStore(url, token);
    } else {
      console.info("[DEV ADAPTER] Upstash not configured — in-memory cache.");
      store = new InMemoryCacheStore();
    }
  }
  return store;
}

/** Test seam. */
export function setCacheStoreForTesting(next: CacheStore | undefined) {
  store = next;
}

const CLINIC_NS_VERSION_KEY = "ns:clinics:version";

async function clinicNamespace(): Promise<string> {
  const version =
    (await getCacheStore().get<number>(CLINIC_NS_VERSION_KEY)) ?? 0;
  return `clinics:v${version}`;
}

/**
 * Read-through cache for clinic-derived data. Failures fall back to the
 * loader — the cache must never take the page down.
 */
export async function cachedClinicData<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  try {
    const namespacedKey = `${await clinicNamespace()}:${key}`;
    const hit = await getCacheStore().get<T>(namespacedKey);
    if (hit != null) return hit;
    const value = await loader();
    if (value != null) {
      await getCacheStore().set(namespacedKey, value, ttlSeconds);
    }
    return value;
  } catch (cause) {
    console.error("cachedClinicData falling back to loader:", cause);
    return loader();
  }
}

/**
 * Invalidation hook for clinic mutations: bumps the namespace version so all
 * search/map/profile/autocomplete entries lapse at once.
 */
export async function invalidateClinicCaches(): Promise<void> {
  try {
    await getCacheStore().increment(CLINIC_NS_VERSION_KEY);
  } catch (cause) {
    console.error("invalidateClinicCaches failed:", cause);
  }
}

/** Rounds a coordinate for cache keys (~110 m at 3 decimals). */
export function roundCoord(value: number | undefined): string {
  return value == null ? "-" : value.toFixed(3);
}
