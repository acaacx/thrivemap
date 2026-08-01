import { z } from "zod";

/**
 * Environment validation. Server env is only parsed on the server;
 * NEXT_PUBLIC_* values are inlined at build time.
 *
 * Provider keys are optional: when absent, the app runs with clearly
 * marked dev adapters (see docs/operations/local-development.md).
 */

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url().optional(),
  // Optional real providers — dev adapters used when unset
  GOOGLE_MAPS_SERVER_API_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default("no-reply@thrivemap.local"),
  JOBS_PROCESSOR_SECRET: z.string().min(16).optional(),
  SENTRY_DSN: z.string().url().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
});

function parseServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${JSON.stringify(z.treeifyError(parsed.error), null, 2)}`,
    );
  }
  return parsed.data;
}

function parseClientEnv() {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid client environment variables:\n${JSON.stringify(z.treeifyError(parsed.error), null, 2)}`,
    );
  }
  return parsed.data;
}

export const clientEnv = parseClientEnv();

let cachedServerEnv: z.infer<typeof serverSchema> | undefined;

export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must not be called in the browser");
  }
  cachedServerEnv ??= parseServerEnv();
  return cachedServerEnv;
}

/** True when the given real provider is configured; otherwise dev adapter. */
export const providerFlags = {
  get googleMaps() {
    return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY);
  },
  get upstash() {
    return Boolean(
      process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN,
    );
  },
  get resend() {
    return Boolean(process.env.RESEND_API_KEY);
  },
  get posthog() {
    return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
  },
  get sentry() {
    return Boolean(process.env.SENTRY_DSN);
  },
};
