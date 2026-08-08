# Handoff — ThriveMap (dir: ausomeapp)

## What we are trying to do

Build **ThriveMap** (product name everywhere; directory stays `ausomeapp`): a Philippines-first, autism-focused clinic directory. Phase 1 (clinic discovery MVP) complete. Phase 2 (`docs/phase-2-plan.md`) **complete**: 1 Places import, 2 Therapist profiles, 3 Inquiries, 4 Ratings (shipped 2026-08-08), 6 PWA (shipped 2026-08-08). Feature 5 (Multilingual) deferred to v2.0 (decision 2026-08-07). Feature 7 (job runner upgrade) conditional-only — skip unless pg queue outgrows.

**Locked decisions (do not relitigate):**

- No external credentials — local Supabase + `[DEV ADAPTER]` fallbacks (maps, rate limit, email, analytics, Sentry/PostHog, Places fixture provider). Real providers env-gated; documented in `.env.example`.
- Background jobs = pg queue (`jobs` table + pg_cron + `/api/internal/jobs/process`, `x-jobs-secret` header — NOT Bearer).
- Single Next.js app, domain modules under `src/modules/` (now incl. `therapists`, `ratings`, `favorites`, `maps`). No monorepo.
- Design: "Warm Horizon" — Fraunces + Nunito Sans, warm cream, deep teal, coral. Theme in `src/app/globals.css`.
- Inquiries: inquiry + requested date only; signed-in caregivers; claimed clinics; RPCs only for writes; moderators see threads only via reports.
- Therapist profiles: per-clinic `clinic_therapists` satellite; direct writes under RLS; search weights B (names) / C (professions/specialties).
- Ratings (spec `docs/superpowers/specs/2026-08-08-clinic-ratings-design.md`): **structured only, NO free text anywhere** (anti-defamation policy enforced by schema, not moderation — RA 10175 cyberlibel). Four required 1–5 dimensions (communication, sensory_friendliness, affirming_approach, scheduling); one rating per clinic per user, author-editable; managers can't rate own clinic; aggregates shown only at ≥3 non-voided ratings; moderation = admin void/unvoid (audited, reversible, no hard delete); direct writes under RLS; trigger-maintained stats table.
- PWA (spec `docs/superpowers/specs/2026-08-08-pwa-design.md`): manifest + offline shell + offline favorites snapshot ONLY. Hand-rolled `public/sw.js` (no Serwist/next-pwa); SW never caches authenticated responses; favorites snapshot in `localStorage`, written when `/account/favorites` loads, cleared on sign-out; `/offline` renders snapshot via inline `<style>/<script>` (its JS chunks aren't precached — inline script is the only zero-network path); SW re-fetches `/offline` shell on every `activate`; no push, no background sync, no custom install prompt.

## Finished and verified

`main` = `5d19e49`. All suites green on exactly this commit (2026-08-08 evening session): typecheck clean, lint 0 errors (1 pre-existing warning), unit 113, integration 73, e2e 64 passed / 22 skipped.

Since previous handoff (therapist-profiles session end, `080aee8`):

- `65c1651` docs: multilingual deferral committed (the previously-uncommitted edit).
- `0b7092d` **all therapist-profiles follow-ups resolved**: migration 20 (search trigger scoped to vector columns + photo_path CHECK), demo care-team seeds (3 public clinics; rep-managed clinic left empty for e2e), portal success feedback, bio line-clamp + expand, `z.uuid()` sweep, `PW_WORKERS` env override, search.md docs.
- **Ratings** (`cf9160a`..`59f2524` + `a176baa` docs): migration 21 `clinic_ratings` + stats trigger + RLS, `src/modules/ratings/`, caregiver ratings section on clinic page, admin void/unvoid panel, seeds + e2e `e2e/ratings.spec.ts`, hardening wave (void-bypass closed, stats trigger hardened, select RLS aligned).
- `d57c65b` **ISR restored on `/clinics/[slug]`** — viewer state resolved client-side (closes the old SiteHeader `getCurrentUser()` ISR-defeat follow-up).
- `d493c2a` admin clinic search filter escapes comma/paren.
- **PWA** (`f75679c`..`7123f5f`): manifest + icons, `public/sw.js`, `/offline` page, `src/modules/favorites/snapshot.*`, e2e `e2e/pwa.spec.ts`; final fix wave `7123f5f` (offline page truly works offline via inline script + `dangerouslySetInnerHTML`; precache refresh on activate; snapshot cleared on sign-out; tel: href char stripping; deterministic `is_primary` location pick on favorites).
- `5d19e49` (this session) **maps error boundary** — was orphaned on branch `claude/goofy-kapitsa-86365d` (written mid-ratings-session, never merged), cherry-picked onto main. maplibre-gl throws during init when WebGL2 unavailable (headless browsers, some VMs), crashing whole pages; `MapErrorBoundary` degrades to address text (clinic profile), results-list notice (search), skip-the-pin notice (suggest form). Local branch + stale worktree `.claude/worktrees/goofy-kapitsa-86365d` deleted.

## Half-done / not started

- Nothing half-done in code.
- **Deployment dry-run DONE 2026-08-08** — local rehearsal all green, record in `docs/operations/deployment.md` ("Dry-run record" section). Remaining deploy work needs real accounts: hosted Supabase project + `db push`, dashboard auth settings, Vercel env/cron, GH Actions `production` environment. User's call when to go live.
- Live Google imports still need real `GOOGLE_MAPS_SERVER_API_KEY` (user's call).
- Remote branch `claude/goofy-kapitsa-86365d` on origin redundant (content = `5d19e49`) — `git push origin --delete claude/goofy-kapitsa-86365d` when convenient.
- Cosmetic: unused `_drop` lint warning in `src/modules/ratings/schemas.test.ts:21`.

## Single next action

Ask user: go live (needs their hosted Supabase/Vercel accounts — see deployment.md one-time setup), v2.0 planning (multilingual), or backlog. Phase 2 done; dry-run done.

## Traps / non-obvious facts

- **e2e timing**: `playwright.config.ts` `expect.timeout: 15_000`, local `workers: 2` (override via `PW_WORKERS` env) — DO NOT revert; Turbopack lazy first-compile + 4-vCPU Docker Supabase exceeded old 5s default under parallel workers. Standalone-spec green ≠ full-suite green for specs hitting brand-new routes.
- **In-memory rate limiter accumulates** on long-lived dev server — restart between full e2e runs if sign-ins time out. e2e caregiver sessions now established without consuming login rate budget (`9742212`, pattern in `e2e/pwa.spec.ts`).
- **Port 3000 squatter** ("Verified VA Jobs") appears intermittently. No `PLAYWRIGHT_BASE_URL` → Playwright self-starts `pnpm dev` on 3000 (`reuseExistingServer`); if squatted, dev on another port + `PLAYWRIGHT_BASE_URL`.
- **`/offline` page**: renders via inline `<style>/<script>` + `dangerouslySetInnerHTML` — do NOT convert to React-hydrated components; its chunks aren't precached so hydration never happens offline. SW PRECACHE is just `["/offline"]` deliberately.
- **MapErrorBoundary**: wrap ALL `ClinicMap` renders (dynamic import, ssr:false) — maplibre-gl throws without WebGL2.
- **zod 4 + @hookform/resolvers 5 + transforms**: `.transform()` schema needs 3-generic `useForm<z.input<S>, unknown, z.output<S>>`. `.optional().or(z.literal("").transform(...))` is DEAD CODE — use `.optional().transform(v => v === "" ? undefined : v)`. No `.coerce`/`.default()` with zodResolver. `z.uuid()` not `z.string().uuid()`.
- **`pnpm test:integration -- <pattern>` does NOT filter** (runs full suite silently) — use `npx vitest run --config vitest.integration.config.ts <pattern>`.
- **supabase CLI not on PATH** — use `pnpm db:reset` / `pnpm db:types`.
- **RLS policy subqueries run as the caller** — wrap cross-table checks in security-definer functions.
- **`is_active_clinic_manager` pattern**: clinic_managers RLS own-rows-only — "does clinic have managers?" for other users needs admin client or security-definer helper.
- **Supabase hardened defaults**: new tables/functions need explicit grants (migrations 8/17/18/19/21 precedent). `create or replace function` preserves existing ACL.
- **shadcn = Base UI, not Radix.** No `asChild`; `render={<Link/>}`; `CardTitle` plain div; `DropdownMenuLabel` needs `DropdownMenuGroup` ancestor.
- **e2e chromium-skip**: `testInfo.project.name !== "chromium"` NOT `browserName` (mobile project also chromium).
- **Test markers**: `[e2e]%` / `[itest]%` prefixes; clean own rows up front; therapists: remove storage objects (photo_path) BEFORE deleting rows.
- **Supabase RPC codegen**: optional RPC params need SQL `default null`.
- **e2e photo-upload selector contract**: file inputs `id="photo-<therapistId>"`, aria-labels `Move <name> up/down` / `Edit <name>` / `Remove <name>` — don't rename.
- **Extensions in `extensions` schema**; float8 doesn't round-trip PostgREST; claim uploads `<user_id>/<claim_id>/...`; seeded auth users need empty-string token columns + `auth.identities` row; fetch-mock Responses single-read; `external_place_candidates.raw_payload` NOT NULL.
- **Stashes**: `stash@{1}` (on `c5bd966`) pre-existing, NOT ours, untouched. `stash@{0}` = 2026-08-08 session's superseded handoff draft — droppable once this handoff is committed.
- **Jobs processor**: `curl -X POST -H "x-jobs-secret: $SECRET" http://localhost:<port>/api/internal/jobs/process` (secret in `.env.local`).
- Demo logins (password `password123`): admin@ / moderator@ / caregiver@ / clinicrep@ `thrivemap.test`.
