# Security posture

## Transport & headers (`next.config.ts`)

- **CSP**: `default-src 'self'`; script-src keeps `'unsafe-inline'` (Next.js
  inline bootstrap — a nonce pipeline is a known upgrade) and `'unsafe-eval'`
  only in dev; connect/img allow the configured Supabase origin and OSM
  tiles; `worker-src blob:` for MapLibre; `frame-ancestors 'none'`.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` (geolocation self-only, camera/mic/payment denied),
  HSTS (2 years, includeSubDomains) in production.

## CSRF

State changes happen only through Next.js **server actions** (same-origin
enforced by the framework via Origin/Host comparison on the POST) and the
secret-protected jobs route. Auth cookies are httpOnly + SameSite=Lax. There
are no state-changing GET handlers. No additional CSRF token layer is
needed under this posture; revisit if any cross-origin POST surface is
added.

## Cookies & sessions

Supabase SSR cookies (httpOnly, Secure in production, SameSite=Lax),
refreshed in `src/middleware.ts`. No session data in localStorage.

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY`, `JOBS_PROCESSOR_SECRET`, provider keys —
  server env only, validated by zod (`src/lib/env.ts`), never sent to the
  client (client env is an explicit allowlist).
- CI: gitleaks (secret scan), `pnpm audit` (dependency audit), Semgrep
  (SAST), migration validation on a clean database.

## Logging discipline

`src/lib/logger.ts` redacts token/password/secret/authorization/cookie/
api-key and lat/lng-shaped keys as a backstop; the rule remains "never pass
them". Claim-document contents and signed URLs are never logged; document
_access_ is audited (who, which document, when).

## Storage

- `clinic-images`: public read, writes restricted to managers/moderators by
  path (`<clinic_id>/...`).
- `claim-documents`: private; uploads path-scoped to the authenticated
  user; reads exclusively via 60-second signed URLs issued server-side to
  moderators, one audit row per issuance.
