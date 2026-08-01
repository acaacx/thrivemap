import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit (in-memory dev adapter)", () => {
  it("allows requests under the limit", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit("unit", key, 3, 60);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests over the limit", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 2; i++) await checkRateLimit("unit", key, 2, 60);
    const blocked = await checkRateLimit("unit", key, 2, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("scopes limits per identifier", async () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    await checkRateLimit("unit", a, 1, 60);
    const otherUser = await checkRateLimit("unit", b, 1, 60);
    expect(otherUser.allowed).toBe(true);
  });

  it("scopes limits per action scope", async () => {
    const key = `scoped-${Math.random()}`;
    await checkRateLimit("scope-one", key, 1, 60);
    const otherScope = await checkRateLimit("scope-two", key, 1, 60);
    expect(otherScope.allowed).toBe(true);
  });
});
