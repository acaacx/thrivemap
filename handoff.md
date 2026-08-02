# Handoff — ThriveMap (dir: ausomeapp)

## What we are trying to do

Build **ThriveMap** (renamed from "AuSome" mid-session — product name is ThriveMap everywhere; directory name stays `ausomeapp`): a Philippines-first, autism-focused clinic directory MVP. Phase 1 = clinic discovery only (no booking/therapist profiles/payments). Condensed plan in `/Users/alaric/.claude/plans/review-this-prompt-and-dazzling-pelican.md`; Phase 2 candidates in `docs/phase-2-plan.md`.

**Locked decisions (do not relitigate):**

- No external credentials — everything runs on local Supabase + `[DEV ADAPTER]`-marked fallbacks (maps, rate limit, email, analytics, Sentry/PostHog). Real providers env-gated; setup documented in `.env.example`.
- Staged build with user checkpoint between stages: 1) foundation+DB+public directory, 2) auth+contributions, 3) claims+rep portal+admin, 4) jobs+hardening+docs+CI. **All four stages are done.**
- Background jobs = pg-based queue (`jobs` table + pg_cron + processor route at `/api/internal/jobs/process`, secret-protected). No Trigger.dev/Inngest.
- Single Next.js app, domain modules under `src/modules/` (admin, auth, claims, clinics, favorites, jobs, maps, portal, reports, search, shared, submissions, users). No monorepo.
- Design: "Warm Horizon" — Fraunces (display, `--font-display`) + Nunito Sans (body), warm cream bg, deep teal primary, coral accent, `--verified` green token. Theme in `src/app/globals.css`.

## Finished and verified

Phase 1 MVP is feature-complete. Working tree clean; `main` at `83b0734`.

- **Stage 1** (`07732f0`, `9c4e83a`): Next.js 16 app (TS strict, Tailwind v4, shadcn/ui on **Base UI**), migrations 1–9 — schema, PostGIS `search_clinics`/`get_map_clinics`/`find_duplicate_candidates`/`search_ph_locations`, RLS everywhere, explicit grants (mig 8), audit triggers, storage buckets, generated lat/lng (mig 9). Seed: 30 fictional clinics, 8 services, `ph_locations`, 4 demo users. Public pages: landing, `/clinics` (split list+map, URL-as-state, keyset cursor), `/clinics/[slug]` + JSON-LD, `/services/[slug]`, `/locations/[province]（/[city]）`, statics, sitemap/robots.
- **Stage 2** (`9f25ee8`): auth (password + magic link, `src/middleware.ts` session refresh, `requireUser`/`requireRole` in `src/modules/auth/server.ts`), favorites, account pages, suggest-clinic with pre-submit duplicate review, change requests, anonymous reports, `RateLimiter`.
- **Stage 3** (`73979d8`): claim wizard at `/clinics/[slug]/claim` (multi-step, private `claim-documents` uploads, resubmission on request-more-info) + `/account/claims`; clinic portal `/clinic-portal/*` (verified clinics edit directly and audited, unverified edits become change requests); admin console `/admin/*` (dashboard, submissions/claims/change-requests/reports/candidates/duplicates workspaces, user roles, audit log — reasons required on destructive decisions, all logged to `admin_actions`); lifecycle state machine (`modules/clinics/lifecycle.ts`) mirrored by a DB transition trigger; `merge_clinics` RPC; set-based `scan_duplicate_candidates`. Migrations 10–13.
- **Stage 4** (`83b0734`): job handlers (email delivery, submission intake, verification reminders, stale-listing scan, search-doc refresh, candidate-import stub) + pg_cron enqueues (mig 14) + admin dead-letter view/retry; `EmailSender` (console/`.dev-mail` dev adapter, Resend env-gated) with 12 transactional templates; `CacheStore` (in-memory/Upstash) with versioned-namespace invalidation on clinic mutations; CSP + secure headers, `/api/health`, redacting structured logger, Sentry + PostHog env-gated; map bundle dynamic-imported on search page; CI (Semgrep, db lint/migration validation, axe, inert main deploy workflow); full `docs/` set.

**Test state (re-verified 2026-08-02, all green):** typecheck clean; lint 0 errors / 4 known warnings (unused eslint-disable in `ClinicMap.tsx:254`, React-Compiler `form.watch` bailouts); 52 unit, 23 integration, 45 e2e passed + 5 skipped by design (stage-3 flows and favorites mutation are chromium-only — both Playwright projects share demo accounts and would race); prod build clean.

Demo logins (local, password `password123`): admin@ / moderator@ / caregiver@ / clinicrep@ `thrivemap.test`.

## Half-done / not started

Nothing half-done. Phase 1 scope is closed. Everything remaining is Phase 2 (see `docs/phase-2-plan.md`) or optional polish:

- Real Google Places import (handler is a stub), therapist profiles, inquiries/booking, reviews, i18n, PWA.

**Polish pass (uncommitted at time of writing, all tests green):** lint is now
0 warnings (`form.watch` → `useWatch` in ClaimWizard/SuggestClinicForm, dead
`slugToTitle` import, stale eslint-disable); migration 15 gives every sort mode
a keyset cursor and fixes the relevance tie-break bug; `loadMore` in
SearchPageClient no longer reuses page one's cursor forever.

## Single next action

Nothing is queued — ask the user which direction to take before writing code. Default suggestion: pick a Phase 2 item from `docs/phase-2-plan.md` (Places import is the most staged: tables, admin candidates workspace, and `candidate_import` job stub all exist), or do a deployment dry-run against a real Supabase project per `docs/operations/deployment.md`.

## Traps / non-obvious facts

- **shadcn = Base UI now, not Radix.** No `asChild`; use `render={<Link …/>}`. `Button` patched (`src/components/ui/button.tsx`) to infer `nativeButton` — rendered links get `role="button"` (e2e locators rely on this). `Accordion` uses `multiple={false}`; `Slider` `onValueChange` gives `number | number[]`; `CardTitle` is a plain div — nest a real `<h2>` inside.
- **MapLibre style needs `glyphs`** or any symbol layer throws inside `map.on("load")`, killing later `addLayer` calls. ClinicMap adds the clinic-point layer FIRST and wraps the cluster-count symbol layer in try/catch. `window.__thrivemapMap` exposed in non-prod.
- **e2e map assertions**: never wait on `isStyleLoaded()`/`loaded()`; assert `getSource('clinics').getData()` feature count. Never `waitForLoadState("networkidle")` on map pages. `AJAXError: Failed to fetch … tile.openstreetmap.org` noise during e2e is expected (sandbox has no tile access) and is not a failure.
- **pnpm 11**: build-script approvals live in `pnpm-workspace.yaml` `allowBuilds:` (not package.json).
- **Supabase hardened defaults**: new tables get NO grants to anon/authenticated — `20260801000008_grants.sql` adds them + default privileges; add grants for any new table.
- **Seeded auth users** need `confirmation_token/recovery_token/email_change_token_new/email_change = ''` AND an `auth.identities` row, or password sign-in fails with an empty error.
- **Extensions live in the `extensions` schema** — write `extensions.geography(point,4326)`, `extensions.st_setsrid(...)` in migrations/seed.
- **e2e state leakage**: demo accounts are shared; tests must be idempotent (favorites test resets `aria-pressed` first; `rls.test.ts` deletes before insert). Integration favorites 23505 = leftovers from an aborted e2e run; it self-heals.
- **Port 3000 squatter** sometimes present; `.claude/launch.json` has `autoPort: true`. `pkill -f next-server` also kills the preview dev server — restart via preview_start.
- **Browser-pane flakiness**: map doesn't init while the pane is hidden (rAF throttled) — verify map behavior via Playwright, not the preview pane.
- Dev server can serve stale SSR chunks after component fixes — restart if console errors reference old code.
- Suggest-form zod schema must keep input==output types (no `.coerce`/`.default()`) or `zodResolver` type-errors.
- Claim document uploads must use path `<user_id>/<claim_id>/...` — storage policy in migration 7 depends on it.
- **float8 does not round-trip through PostgREST**: Postgres renders it with 15 significant digits, a double needs 17. Any value a client sends back for an equality/keyset comparison must be rounded in SQL first (see migration 15's `sort_value`), or the boundary row repeats.
- Re-running migration 15 by hand fails with "function already exists" — its `drop` targets the pre-migration signature. Drop the new one explicitly or `pnpm db:reset`.
