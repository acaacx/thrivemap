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
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

/**
 * SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN are deliberately absent from
 * both schemas: they are read by the build plugin in next.config.ts and are
 * never present at runtime, so validating them here would fail every boot.
 */

/**
 * Trims string values and drops the ones that are empty, so they read as
 * "unset".
 *
 * `.env.example` ships optional provider keys blank, and hosting dashboards
 * (Vercel included) store a variable you leave blank as `""` rather than
 * omitting it. Zod treats `""` as a present value, so `.optional()` and
 * `.default()` do not apply and validation fails on a config that is meant to
 * be valid — which took down every route calling serverEnv(), /api/health
 * among them.
 *
 * The trim covers the same mistake with whitespace in it: piping a value into
 * `vercel env add` without `printf %s` stores the trailing newline, so a row
 * meant to be blank arrives as `"\n"` and reads as present. Note this is not
 * what `z.url()` rejects — the WHATWG parser strips surrounding whitespace, so
 * a padded but otherwise valid URL already passed.
 */
function withoutEmpty<T extends Record<string, unknown>>(source: T) {
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) =>
        typeof value === "string" ? [key, value.trim()] : [key, value],
      )
      .filter(([, value]) => value !== ""),
  );
}

function parseServerEnv() {
  const parsed = serverSchema.safeParse(withoutEmpty(process.env));
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${JSON.stringify(z.treeifyError(parsed.error), null, 2)}`,
    );
  }
  return parsed.data;
}

function parseClientEnv() {
  // Each value is read as an explicit property so Next inlines it at build time.
  const parsed = clientSchema.safeParse(
    withoutEmpty({
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY:
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY,
      NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    }),
  );
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

/**
 * A variable counts as set only when it holds something after trimming — these
 * read `process.env` directly, so they do not get the sanitising the schemas
 * above apply. A blank dashboard row would otherwise flip a provider "on" and
 * silently disable its dev adapter.
 */
function isSet(value: string | undefined) {
  return typeof value === "string" && value.trim() !== "";
}

/** True when the given real provider is configured; otherwise dev adapter. */
export const providerFlags = {
  get googleMaps() {
    return isSet(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY);
  },
  get upstash() {
    return (
      isSet(process.env.UPSTASH_REDIS_REST_URL) &&
      isSet(process.env.UPSTASH_REDIS_REST_TOKEN)
    );
  },
  get resend() {
    return isSet(process.env.RESEND_API_KEY);
  },
  get posthog() {
    return isSet(process.env.NEXT_PUBLIC_POSTHOG_KEY);
  },
  /** Server-side capture. The browser has its own DSN — see `sentryClient`. */
  get sentry() {
    return isSet(process.env.SENTRY_DSN);
  },
  get sentryClient() {
    return isSet(process.env.NEXT_PUBLIC_SENTRY_DSN);
  },
};
