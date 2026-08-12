# Architecture overview

## System shape

One Next.js application (App Router) talking to one Supabase project. No
microservices, no separate API server, no external job runner. The
architecture is deliberately monolithic for Phase 1 but split into domain
modules so pieces can be extracted later.

```
Browser ──► Next.js (Vercel or any Node host)
              │  RSC / Server Actions / Route Handlers
              ▼
            Supabase ── Postgres (+PostGIS, pg_trgm, pg_cron)
                     ── Auth (email/password, magic link)
                     ── Storage (clinic-images public, claim-documents private)
```

## Rendering strategy

- **Public pages** (landing, clinic profiles, service and location landing
  pages) are server-rendered with ISR (`revalidate` 300–600 s) — they are the
  SEO surface.
- **Search** (`/clinics`) renders the first result page on the server; the
  client (TanStack Query) drives subsequent filter/map interactions. URL is
  the single source of truth for all search state.
- **Authenticated surfaces** (`/account`, `/clinic-portal`, `/admin`) are
  dynamic per-request; the middleware refreshes Supabase sessions and
  redirects unauthenticated visitors.

## Module layout

Routes under `src/app/` stay thin and delegate to `src/modules/<domain>`:
`actions.ts` (server actions), `queries.ts`, `schemas.ts` (zod),
`components/`, `server.ts` (server-only helpers). Modules expose a public
index; no cross-module deep imports.

## Authorization model

Three layers, all enforced server-side:

1. **Middleware** gates protected route groups (redirect to sign-in).
2. **`requireUser` / `requireRole`** (`src/modules/auth/server.ts`) guard
   every server action and admin query.
3. **Postgres RLS** is the last line of defense on every table — even a bug
   in the app layer cannot read private rows through the anon/authenticated
   keys. The service-role client is used only in server code, for
   infrastructure tables (jobs) and cross-user moderation writes.

## Key subsystems

- **Search**: PostGIS + full-text + trigram RPCs (`search_clinics`,
  `get_map_clinics`) — see [search.md](search.md) and
  [../api/search-api.md](../api/search-api.md).
- **Jobs**: Postgres queue with pg_cron enqueue + HTTP processor — see
  [jobs.md](jobs.md).
- **Caching**: versioned-namespace read-through cache (in-memory or Upstash)
  for search, map, profile, and autocomplete reads; invalidated on every
  clinic mutation.
- **Dev adapters**: every external provider sits behind an interface with a
  local fallback — see [dev-adapters.md](dev-adapters.md).

## Observability

- Structured logger (`src/lib/logger.ts`): JSON lines in production; never
  logs tokens, passwords, document contents, or precise user location.
- `src/instrumentation.ts` reports server errors (structured log always;
  `@sentry/nextjs` when `SENTRY_DSN` is set). Browser errors go through
  `src/instrumentation-client.ts` under `NEXT_PUBLIC_SENTRY_DSN`.
- `/api/health` reports app/db/jobs (+redis when configured) for uptime
  checks.
