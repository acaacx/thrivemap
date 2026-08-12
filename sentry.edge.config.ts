import * as Sentry from "@sentry/nextjs";

/**
 * Edge runtime Sentry init (middleware + edge routes), loaded from `register()`
 * in src/instrumentation.ts. No-op when SENTRY_DSN is unset.
 */

// Trimmed so a row holding only whitespace disables the SDK instead of
// handing Sentry.init a blank DSN.
const dsn = process.env.SENTRY_DSN?.trim() || undefined;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  sendDefaultPii: false,
  debug: false,
});
