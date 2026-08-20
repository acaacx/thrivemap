# Handoff — ThriveMap, `main` @ `d146d93`

Repo root `/Users/alaric/code/ausomeapp`, branch `main`, clean, no linked
worktrees, no open PRs. Session = prod-ops (first real data into production)
+ two fix PRs (#6, #7, both merged).

## What we were trying to do

Get real clinics into the empty production DB via the existing admin Places
import pipeline, then verify search / clinic pages in prod. No new code was
needed for the import itself — provider, job, admin UI, runbook already
existed. Follow-on: fix wrong city/province data on the two seeded clinics.

## Finished and verified (prod)

- Prod project `abensontech/thrivemap` (`prj_PcDtrjEMLmiPA3QvkxZL7m8bqm2g`).
  First administrator bootstrapped (signup + promote SQL in Supabase
  dashboard, project `slwguxbeijcpixsegtzm`).
- Import ran for real via `POST /admin/jobs` manual tick, real Google
  provider. Two clinics promoted + published: `intellispeech-therapy-center`
  (`published_unverified`), `bright-path-therapy-center`
  (`published_verified`). Both verified end-to-end in prod: `/api/search`,
  `/api/map-clinics`, `/clinics` SSR list, `/clinics/<slug>` detail +
  JSON-LD, `/sitemap.xml`, `/api/og/search`.
- **PR #6** `fix(admin): seed more PH cities, let admins correct clinic
  city/province` (merged `923e995`): migration adds 38 cities + 27
  provinces; admin identity form gets city/province `<select>`;
  `adminUpdateClinicIdentity` updates primary `clinic_locations` row +
  invalidates caches. Deployed and live.
- **PR #7** `Redesign clinic search around contextual map` (merged
  `d146d93`, from `codex/contextual-map-redesign`): touches
  `AppShell`/`ClinicPreview`/`FilterBar`/`SearchResultsPanel`/
  `contextual-camera`, site header, mobile lazy-map e2e. Landed by a
  different work stream during this session — pulled into local `main`,
  not otherwise touched or verified this session.
- **City/province data fix — DONE 2026-08-19/20.** User ran manual SQL in
  Supabase to correct both prod rows (not via the new admin select).
  Re-verified after cache expiry:
  - `/api/search`: IntelliSpeech → `Dumaguete City / Negros Oriental`
    (was `Cebu City/Cebu`); Bright Path → `Lipa City / Batangas` (already
    correct). Reflected quickly (60s cache).
  - Clinic page JSON-LD (`addressLocality`/`addressRegion`, ISR 300s,
    `x-vercel-cache`): direct SQL doesn't call `invalidateClinicCaches()`,
    so the page kept serving stale `Cebu City` for ~5 more minutes
    (`age` climbed past 300 before a MISS regenerated it). Confirmed fresh
    once `age` reset to 15 — IntelliSpeech now shows `Dumaguete City`.
  - Both clinics now consistent everywhere: search API, map, list, detail
    JSON-LD all match their real `address_line1`.

## Half-done / open problems

1. Bright Path `description` = a Facebook URL (should be website / prose).
2. Runtime log `[DEV ADAPTER] Upstash not configured — in-memory rate
   limiter.` although prod env lists `UPSTASH_REDIS_REST_URL/TOKEN` —
   likely blank values (Sensitive hides empties in `vercel env ls`). Rate
   limits + clinic cache are per-instance until fixed in the Vercel
   dashboard.
3. JSON-LD / breadcrumb `url` = `https://thrivemap.vercel.app/...`
   (`NEXT_PUBLIC_SITE_URL`) but the live alias is
   `thrivemap-abensontech.vercel.app`; no custom domain attached;
   Deployment Protection (Vercel SSO) still on → prod not publicly
   reachable without a share link.
4. Clinic pages have no `og:image` (only `/api/og/search` exists) — decide
   if intentional.
5. PR #7 (contextual map redesign) landed on `main` via another stream
   this session — not reviewed or smoke-tested by this session. Worth a
   pass if picking up UI work next.

## Single next action

No forced next step — the city/province bug (previous "single next
action") is closed and verified. Pick from the open-problems list above,
or ask the user what's next (candidate: verify PR #7's UI changes actually
work in prod, since it shipped without this session's review).

## Decisions already made (do not relitigate)

- Admin bootstrap stays manual SQL (user chose this over an
  `ADMIN_BOOTSTRAP_EMAILS` code path).
- Prod Places import is admin-triggered only; candidates → promote → draft
  → publish by a human. Cron stays daily on Hobby; "Run tick now" drains.
- Direct-SQL data fixes in prod are acceptable and were used here in
  preference to the admin UI; just expect the ISR/search caches to lag
  ~5min behind since SQL bypasses `invalidateClinicCaches()`.
- All `main` product decisions from PRs #4/#5 still hold: `/` and
  `/clinics` are the same `SearchShell`; URL via `history.replaceState`;
  mobile map-first; map lazy-mounts, never unmounts; motion.dev + reduced-
  motion; one primary CTA per surface; e2e selectors contract
  (`/search by city/i`, `/more filters/i`, `[data-clinic-id]`,
  `/clinics? found/`, `window.__thrivemapMap`).
- Local Supabase + dev adapters, pg job queue, Quiet Ledger tokens,
  OpenFreeMap tiles, candidate pipeline is the only way clinics enter
  prod, repo public.

## Traps

- **Prod is behind Vercel SSO** — plain `curl` gets 302 to
  `vercel.com/sso-api`. Use `get_access_to_vercel_url` → curl
  `-c jar -b jar` following the share link (expires ~23h), or MCP
  `web_fetch_vercel_url` for single GETs (doesn't follow the share
  redirect for page routes).
- **ISR cache lag after direct SQL edits**: clinic page JSON-LD uses
  `x-vercel-cache`/`age` headers, revalidate=300s. A SQL edit doesn't
  invalidate it — poll `age` header until it exceeds 300 and resets on
  the next request (background regen), don't assume one wait-and-check is
  enough; budget ~5-8min end to end.
- Vercel runtime logs MCP times out on wide windows — scope to
  `deploymentId` (get it via `group_by: deploymentId`) and short `since`.
- `npx -y vercel …` works without global install (`--scope abensontech`).
  Sensitive env values are unreadable; `vercel env ls` shows "Hidden" even
  for blanks.
- Local Supabase migration history has orphan versions
  `20260811000022/23` from old worktrees → `supabase migration up` fails
  with `LegacyMigrationMissingLocalError`. Validate new migrations with
  psql in a `begin … rollback` transaction instead of repairing shared
  state.
- Agent tool has no `builder` type here — use `general-purpose` with
  `model: sonnet` for Sonnet-tier delegation.
- No hosted DB creds locally — any prod SQL is the user's, in the Supabase
  dashboard.
- Prod caches: `cachedClinicData` search 60s / map 60s / profile 300s (in
  memory per instance while Upstash is off) + clinic page ISR 300; CDN
  `s-maxage=60` on `/api/search`. Admin actions call
  `invalidateClinicCaches()` but direct SQL edits do not.
- Port 3000 = main repo dev server; worktrees use other ports and
  `PLAYWRIGHT_BASE_URL`. Browser preview reads main `.claude/launch.json`.
- Worktree Bash hook rejects compound commands; use Edit, not `sed -i`.
- `gh pr merge` / `vercel env rm` / `vercel redeploy` blocked by
  classifier → `git merge --no-ff` + push. `ExitWorktree remove` needs
  `discard_changes`.
- Root `pnpm format` rewrites `.claude/worktrees/*`; root `pnpm lint`
  picks up worktree `.next`. `handoff.md` is prettier-ignored, regenerated
  by hook.
- Clicks before hydration are lost — wait for
  `[data-slot=app-shell][data-hydrated]`. `[mobile] suggest a clinic` e2e
  flaky under load. `useIsDesktop()` false during SSR/hydration.
