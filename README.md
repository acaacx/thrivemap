# ThriveMap

A Philippines-first, autism-focused clinic directory. Families search a map of
therapy centers and developmental clinics — occupational therapy, speech
therapy, early intervention, behavioral support — filter by service, age
group, accessibility, and verification status, and contribute corrections,
suggestions, and reports. Clinic owners claim their listings and manage them
through a dedicated portal; moderators run every decision through an audited
admin console.

Phase 1 is clinic discovery only: no booking, therapist profiles, payments, or
medical records.

## Stack

- **Next.js 16** (App Router, RSC, Server Actions), TypeScript strict,
  Tailwind v4, shadcn/ui (Base UI), TanStack Query, React Hook Form, Zod.
- **Supabase** (Postgres + PostGIS + pg_trgm, Auth, Storage, RLS). SQL
  migrations in `supabase/migrations/` are the source of truth; generated
  types in `src/lib/database.types.ts`.
- **Background jobs**: Postgres-backed queue (`jobs` table + `pg_cron` +
  processor route). No external job vendor.
- **Dev adapters**: maps, rate limiting, cache, email, analytics, and error
  monitoring all run locally with `[DEV ADAPTER]`-marked fallbacks; real
  providers (Google Maps, Upstash, Resend, PostHog, Sentry) activate via env
  keys. See `.env.example`.

## Quick start

```bash
pnpm install
pnpm exec supabase start   # local Postgres + Auth + Storage (Docker)
cp .env.example .env.local # fill from `pnpm exec supabase status`
pnpm db:reset              # apply migrations + seed 30 fictional clinics
pnpm dev
```

Demo logins (password `password123`): `admin@thrivemap.test`,
`moderator@thrivemap.test`, `caregiver@thrivemap.test`,
`clinicrep@thrivemap.test`. Local emails land in Mailpit at
http://127.0.0.1:54324; app-sent emails are written to `.dev-mail/`.

## Commands

| Command                                        | What                                               |
| ---------------------------------------------- | -------------------------------------------------- |
| `pnpm dev` / `pnpm build`                      | Dev server / production build                      |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Static checks                                      |
| `pnpm test`                                    | Unit tests (Vitest)                                |
| `pnpm test:integration`                        | Integration tests against local Supabase           |
| `pnpm test:e2e`                                | Playwright e2e (starts the dev server itself)      |
| `pnpm db:reset`                                | Recreate the local database from migrations + seed |
| `pnpm db:types`                                | Regenerate `src/lib/database.types.ts`             |

## Repository layout

```
src/app/          # routes only — thin, delegate to modules
src/modules/      # auth, clinics, claims, favorites, jobs, maps, portal,
                  # reports, search, shared, submissions, users, admin
src/components/ui # shadcn/ui components
src/lib/          # env validation, supabase clients, logger, utils
supabase/         # migrations (source of truth) + seed
docs/             # architecture, security, operations, api
e2e/              # Playwright suites
```

## Documentation

- Architecture: [overview](docs/architecture/overview.md) ·
  [data model](docs/architecture/data-model.md) ·
  [search](docs/architecture/search.md) ·
  [jobs](docs/architecture/jobs.md) ·
  [dev adapters](docs/architecture/dev-adapters.md)
- Security: [threat model](docs/security/threat-model.md) ·
  [RLS policies](docs/security/rls-policies.md) ·
  [security posture](docs/security/security-posture.md) ·
  [data classification](docs/security/data-classification.md)
- Operations: [local development](docs/operations/local-development.md) ·
  [deployment](docs/operations/deployment.md) ·
  [runbook](docs/operations/runbook.md) ·
  [scaling triggers](docs/operations/scaling-triggers.md)
- API: [search API](docs/api/search-api.md)
- Roadmap: [Phase 2 extension plan](docs/phase-2-plan.md)

All clinic data in the seed is **fictional** and clearly labeled as such.
