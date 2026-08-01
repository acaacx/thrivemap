# Handoff — ThriveMap (dir: ausomeapp)

## What we are trying to do

Build **ThriveMap** (renamed from "AuSome" mid-session — product name is ThriveMap everywhere; directory name stays `ausomeapp`): a Philippines-first, autism-focused clinic directory MVP. Phase 1 = clinic discovery only (no booking/therapist profiles/payments). Full spec lives in the first user message of the original session; condensed plan in `/Users/alaric/.claude/plans/review-this-prompt-and-dazzling-pelican.md`.

**Locked decisions (do not relitigate):**

- No external credentials — everything runs on local Supabase + `[DEV ADAPTER]`-marked fallbacks (maps, rate limit, email, analytics). Real providers env-gated; setup documented in `.env.example`.
- Staged build with user checkpoint between stages: 1) foundation+DB+public directory, 2) auth+contributions, 3) claims+rep portal+admin, 4) jobs+hardening+docs+CI.
- Background jobs = pg-based queue (`jobs` table + pg_cron + processor route; `claim_due_jobs`/`requeue_stuck_jobs` fns exist in migration 7). No Trigger.dev/Inngest.
- Single Next.js app, domain modules under `src/modules/` (auth, clinics, favorites, maps, reports, search, shared, submissions, users). No monorepo.
- Design: "Warm Horizon" — Fraunces (display, `--font-display`) + Nunito Sans (body), warm cream bg, deep teal primary, coral accent, `--verified` green token. Theme in `src/app/globals.css`.

## Finished and verified

- **Stage 1** (commits `07732f0`, `9c4e83a`): Next.js 16 app (TS strict, Tailwind v4, shadcn/ui on **Base UI**), 9 SQL migrations (`supabase/migrations/`) — full schema, PostGIS `search_clinics`/`get_map_clinics`/`find_duplicate_candidates`/`search_ph_locations` RPCs, RLS on all tables, explicit grants (migration 8), audit triggers, storage buckets, generated lat/lng columns on `clinic_locations` (migration 9). Seed: 30 fictional clinics, 8 services, `ph_locations`, 4 demo users. Public pages: landing, `/clinics` (split list+map, URL-as-state, filters/sorts, keyset cursor), `/clinics/[slug]` + JSON-LD, `/services/[slug]`, `/locations/[province]（/[city]）`, statics, sitemap/robots.
- **Stage 2** (commit `9f25ee8`): Auth (email/password + magic link, `src/middleware.ts` session refresh + protected-route redirect, `requireUser`/`requireRole` in `src/modules/auth/server.ts`), favorites (optimistic button + `/api/favorites`), account pages, suggest-clinic form with pre-submit duplicate review, change requests, anonymous reports, `RateLimiter` (in-memory + Upstash env-gated, `src/modules/shared/rate-limit.ts`).
- **Test state (all green at handoff):** 39 unit, 23 integration, 41 e2e passed + 1 intentionally skipped (favorites mutation is chromium-only — both Playwright projects share the demo caregiver account and race each other). Typecheck/lint/prod build clean.
- Demo logins (local, password `password123`): admin@ / moderator@ / caregiver@ / clinicrep@ `thrivemap.test`.

## Half-done / not started

- Nothing half-done. Stage 2 complete and committed; working tree clean except this file.
- **Stage 3 not started**: claim wizard + private docs (bucket `claim-documents` + storage RLS already exist in migration 7; `clinic_claims`/`clinic_claim_documents`/`clinic_managers` tables + `manages_clinic()` fn ready), `/clinic-portal/*`, `/admin/*` consoles. `/clinics/[slug]/claim` is currently an email-us placeholder page — replace with the real wizard.
- **Stage 4 not started**: job handlers, email templates (`EmailSender` interface not yet written), caching layer, CSP/security headers, health endpoints, PostHog/Sentry wiring, full docs set (`docs/` is empty), CI security jobs beyond skeleton in `.github/workflows/pr.yml`.

## Single next action

Start Stage 3: build the claim wizard (`src/modules/claims/`), starting with the multi-step form at `/clinics/[slug]/claim` writing to `clinic_claims`, uploads to the private `claim-documents` bucket (path `<user_id>/<claim_id>/...` — storage policy in migration 7 expects this), then `/admin` review workspaces.

## Traps / non-obvious facts

- **shadcn = Base UI now, not Radix.** No `asChild`; use `render={<Link …/>}`. `Button` was patched (src/components/ui/button.tsx) to infer `nativeButton` — rendered links get `role="button"` (e2e locators use `getByRole("button")` for them). `Accordion` uses `multiple={false}`; `Slider` `onValueChange` gives `number | number[]`; `CardTitle` is a plain div — nest real `<h2>` inside for headings.
- **MapLibre style needs `glyphs`** or any symbol layer throws inside `map.on("load")`, killing later `addLayer` calls. ClinicMap adds clinic-point layer FIRST and wraps the cluster-count symbol layer in try/catch. `window.__thrivemapMap` exposed in non-prod for tests/debug.
- **e2e map assertions**: never wait on `isStyleLoaded()`/`loaded()` (tile fetch keeps them false in CI); assert `getSource('clinics').getData()` feature count. Never `waitForLoadState("networkidle")` on map pages — tiles stream forever.
- **pnpm 11**: build-script approvals live in `pnpm-workspace.yaml` `allowBuilds:` map (not package.json).
- **Supabase hardened defaults**: new tables get NO grants to anon/authenticated — migration `20260801000008_grants.sql` adds them + default privileges; add grants for any new table.
- **Seeded auth users** need `confirmation_token/recovery_token/email_change_token_new/email_change = ''` AND an `auth.identities` row, or password sign-in fails with empty error.
- **Extensions live in `extensions` schema** — write `extensions.geography(point,4326)`, `extensions.st_setsrid(...)` etc. in migrations/seed.
- **e2e state leakage**: demo caregiver account is shared; tests must be idempotent (favorites test resets `aria-pressed` state first; rls.test.ts deletes before insert). If integration favorites test fails with 23505, an aborted e2e run left rows — it now self-heals.
- **Port 3000 squatter** sometimes present; `.claude/launch.json` has `autoPort: true`. `pkill -f next-server` kills the preview dev server too — restart via preview_start after.
- **Browser-pane flakiness**: map doesn't init while pane hidden (rAF throttled) — verify map behavior via Playwright, not the preview pane.
- Dev server can serve stale SSR chunks after component-level fixes — restart dev server if console errors reference old code.
- `search_clinics` keyset cursor only supports `nearest`/`relevance` sorts; other sorts limit-only (documented Stage 1 decision).
- Suggest-form zod schema must keep input==output types (no `.coerce`/`.default()`) or `zodResolver` type-errors.
