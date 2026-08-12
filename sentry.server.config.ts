import * as Sentry from "@sentry/nextjs";

/**
 * Node runtime Sentry init, loaded from `register()` in src/instrumentation.ts.
 *
 * Stays a no-op when SENTRY_DSN is unset — same dev-adapter contract as the
 * other optional providers (docs/architecture/dev-adapters.md).
 */

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  // Ratings carry no free text and inquiries are caregiver PII — never let the
  // SDK attach request bodies, headers, cookies or user identifiers by default.
  sendDefaultPii: false,
  // Server-only: attaches local variables to stack frames, which is most of the
  // value of a server stack trace. Safe here because sendDefaultPii is off.
  includeLocalVariables: true,
  debug: false,
});
