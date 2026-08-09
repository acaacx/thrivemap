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
  `connect-src 'self' ${supabaseOrigin} ${posthogOrigin} https://tiles.openfreemap.org${isDev ? " ws:" : ""}`,
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

export default nextConfig;
