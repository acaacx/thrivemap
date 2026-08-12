import * as Sentry from "@sentry/nextjs";

/**
 * Edge runtime Sentry init (middleware + edge routes), loaded from `register()`
 * in src/instrumentation.ts. No-op when SENTRY_DSN is unset.
 */

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  sendDefaultPii: false,
  debug: false,
});
