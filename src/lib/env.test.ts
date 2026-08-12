// @vitest-environment node
// Node environment: serverEnv() refuses to run when `window` exists.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * env.ts validates at module scope, so every case needs a fresh module
 * registry with the environment already stubbed.
 */
async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) {
    vi.stubEnv(key, value);
  }
  return import("./env");
}

const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const DSN = "https://abc123@o1.ingest.sentry.io/42";

describe("environment sanitising", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.stubEnv("SENTRY_DSN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // z.url() already tolerates padding (the WHATWG parser strips it); what
  // matters is that consumers read the trimmed value, not the padded one.
  it("normalises a DSN padded by `vercel env add` without `printf %s`", async () => {
    const { clientEnv, serverEnv } = await loadEnv({
      ...REQUIRED,
      NEXT_PUBLIC_SENTRY_DSN: `${DSN}\n`,
      SENTRY_DSN: `  ${DSN}  `,
    });

    expect(clientEnv.NEXT_PUBLIC_SENTRY_DSN).toBe(DSN);
    expect(serverEnv().SENTRY_DSN).toBe(DSN);
  });

  // providerFlags reads process.env directly, so before the trim a row holding
  // only a newline reported Sentry as configured and disabled the dev adapter.
  it("reads a whitespace-only value as unset, not as a configured provider", async () => {
    const { clientEnv, providerFlags } = await loadEnv({
      ...REQUIRED,
      NEXT_PUBLIC_SENTRY_DSN: "\n",
      SENTRY_DSN: "   ",
    });

    expect(clientEnv.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
    expect(providerFlags.sentry).toBe(false);
  });

  it("still rejects a value that is malformed for reasons other than whitespace", async () => {
    await expect(
      loadEnv({
        ...REQUIRED,
        NEXT_PUBLIC_SENTRY_DSN: "abc123@o1.sentry.io/42",
      }),
    ).rejects.toThrow(/Invalid client environment variables/);
  });
});
