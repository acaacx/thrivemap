import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

interface RateLimiter {
  /** Sliding-window limit: `limit` hits per `windowSeconds` per key. */
  limit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult>;
}

/** [DEV ADAPTER] In-memory limiter — per-instance only, fine for local dev. */
class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  async limit(key: string, limit: number, windowSeconds: number) {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const timestamps = (this.hits.get(key) ?? []).filter(
      (t) => t > windowStart,
    );
    if (timestamps.length >= limit) {
      this.hits.set(key, timestamps);
      return { allowed: false, remaining: 0 };
    }
    timestamps.push(now);
    this.hits.set(key, timestamps);
    // Opportunistic cleanup to bound memory.
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (v.every((t) => t <= windowStart)) this.hits.delete(k);
      }
    }
    return { allowed: true, remaining: limit - timestamps.length };
  }
}

/** Upstash Redis limiter (fixed window via INCR/EXPIRE pipeline). */
class UpstashRateLimiter implements RateLimiter {
  constructor(
    private url: string,
    private token: string,
  ) {}

  async limit(key: string, limit: number, windowSeconds: number) {
    const redisKey = `rl:${key}`;
    const res = await fetch(`${this.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, String(windowSeconds), "NX"],
      ]),
      cache: "no-store",
    });
    if (!res.ok) {
      // Fail open: availability over strictness for a public directory.
      console.error("Upstash rate limit error:", res.status);
      return { allowed: true, remaining: 1 };
    }
    const json = (await res.json()) as Array<{ result: number }>;
    const count = json[0]?.result ?? 0;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }
}

let limiter: RateLimiter | undefined;

function getRateLimiter(): RateLimiter {
  if (!limiter) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      limiter = new UpstashRateLimiter(url, token);
    } else {
      console.info(
        "[DEV ADAPTER] Upstash not configured — in-memory rate limiter.",
      );
      limiter = new InMemoryRateLimiter();
    }
  }
  return limiter;
}

/** Hash identifiers so raw emails/IPs never sit in the store. */
function hashIdentifier(value: string): string {
  return createHash("sha256")
    .update(value.toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

/** Client IP for anonymous rate limiting (best effort behind proxies). */
export async function getClientIp(): Promise<string> {
  const headerStore = await headers();
  return (
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    "unknown"
  );
}

export async function checkRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  return getRateLimiter().limit(
    `${scope}:${hashIdentifier(identifier)}`,
    limit,
    windowSeconds,
  );
}
