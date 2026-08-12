import * as Sentry from "@sentry/nextjs";

/**
 * Browser Sentry init. Runs after the document loads and before hydration, so
 * it captures errors thrown during the first render.
 *
 * No-op when NEXT_PUBLIC_SENTRY_DSN is unset. Note the browser needs its own
 * public DSN — the server's SENTRY_DSN must never gain a NEXT_PUBLIC_ prefix,
 * since that inlines it into the client bundle.
 */

// Trimmed so a row holding only whitespace disables the SDK instead of
// handing Sentry.init a blank DSN.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: Number(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1",
  ),
  // Session Replay is deliberately not enabled: it records caregiver sessions
  // over clinic inquiry forms. Adding it is a privacy decision, not a config one.
  sendDefaultPii: false,
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
