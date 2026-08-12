import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const posthogOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "").origin;
  } catch {
    return "";
  }
})();

// Sentry ingest host, derived from the browser DSN (https://<key>@<host>/<id>).
// Events normally go through the same-origin tunnel below, so this is the
// fallback path for when the tunnel is bypassed.
const sentryOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").origin;
  } catch {
    return "";
  }
})();

/**
 * CSP notes:
 * - script-src keeps 'unsafe-inline' (Next.js inline bootstrap without a nonce
 *   pipeline) and adds 'unsafe-eval' only in dev (react-refresh).
 * - MapLibre needs blob: workers plus the OpenFreeMap origin (style JSON,
 *   vector/raster tiles, sprites, glyphs — all fetched via XHR → connect-src;
 *   sprite/raster also rendered → img-src).
 * - Supabase/PostHog origins come from env so the policy follows deployment.
 */
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://tiles.openfreemap.org ${supabaseOrigin}`,
  `font-src 'self' data:`,
  `connect-src 'self' ${supabaseOrigin} ${posthogOrigin} ${sentryOrigin} https://tiles.openfreemap.org${isDev ? " ws:" : ""}`,
  `worker-src 'self' blob:`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
]
  .map((directive) => directive.replace(/\s+/g, " ").trim())
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), camera=(), microphone=(), payment=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

/**
 * Sentry build plugin. Source maps upload only when SENTRY_AUTH_TOKEN /
 * SENTRY_ORG / SENTRY_PROJECT are all set — without them the build still
 * succeeds, it just ships unmapped stack traces (that is the local/CI default).
 */
export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "abenson-tech",

  project: "thrivemap",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
