# Local development

## Prerequisites

Node 22+, pnpm 11, Docker (for Supabase local).

## Setup

```bash
pnpm install
pnpm exec supabase start        # Postgres + Auth + Storage + Mailpit
cp .env.example .env.local      # fill from `pnpm exec supabase status`
pnpm db:reset                   # migrations + seed
pnpm dev
```

`pnpm db:reset` recreates the database from `supabase/migrations/` and
`supabase/seed.sql`: 30 fictional clinics across 10 cities, the 8-service
taxonomy, `ph_locations`, and four demo users (password `password123`):

| Email                      | Role                                       |
| -------------------------- | ------------------------------------------ |
| `admin@thrivemap.test`     | administrator                              |
| `moderator@thrivemap.test` | moderator                                  |
| `caregiver@thrivemap.test` | caregiver                                  |
| `clinicrep@thrivemap.test` | clinic representative (manages one clinic) |

## Everything runs offline

No external keys are needed. Dev adapters announce themselves with
`[DEV ADAPTER]` log lines: MapLibre + OSM tiles for maps, seeded PH
locations for autocomplete, in-memory rate limiter and cache, emails to
console + `.dev-mail/`, no-op analytics. Supabase Auth's own emails
(confirmation, magic links) land in Mailpit: http://127.0.0.1:54324.

## Background jobs locally

pg_cron enqueues periodic jobs, but nothing processes them automatically in
dev. Either:

- Admin console → **Jobs** → "Run tick now", or
- `curl -X POST http://localhost:3000/api/internal/jobs/process` (add
  `-H "x-jobs-secret: …"` if you set `JOBS_PROCESSOR_SECRET`).

## Tests

```bash
pnpm test               # unit (Vitest)
pnpm test:integration   # needs `supabase start`
pnpm test:e2e           # Playwright; starts the dev server itself
```

E2e suites share the demo caregiver account, so they are written to be
idempotent; if an aborted run leaves state behind, the tests self-heal on
the next run.

## After changing the schema

```bash
pnpm db:reset && pnpm db:types
```

Gotchas:

- Postgres extensions live in the `extensions` schema — write
  `extensions.st_dwithin(...)` etc. in SQL.
- New tables need explicit grants (see migration 8) — hardened defaults
  give anon/authenticated nothing.
- Never wait on `isStyleLoaded()` or `networkidle` for map pages in tests —
  tiles stream forever; assert on map source data instead.
