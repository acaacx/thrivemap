# Handoff — ThriveMap, `main` @ `6cfb855`

Repo root `/Users/alaric/code/ausomeapp`, branch `main`, clean, no linked
worktrees, no open PRs. Context of the last session was ~136% full — start
fresh.

## What we were trying to do

Two rounds of the "Uber-style" map-first search shell, both merged:

- PR #4 (`ff3bb8c`) — the shell itself: homepage `/` renders the same
  `SearchShell` as `/clinics`, bottom sheet over the map on mobile, persistent
  map on desktop, URL as source of truth, snapshot restore, loading / empty /
  error states, reduced motion + a11y. Backend / RPC / `/api/*` / DB untouched.
- PR #5 (`6cfb855`) — leftover polish: 44px sheet-handle hit target
  (`::before` 12px above the sheet edge, visual still 32px), active-filter row
  reduced to sheet-only filters (`sheetOnlyChips()` → verified / in-person)
  plus "Clear all" whenever any filter is active, "N clinics found" is an `h2`
  (h1 → h2 → h3 cards), `SearchPageClient.tsx` 933 → 727 lines
  (`SearchResultsPanel.tsx`: `SearchResults` / `NoResultsState` /
  `LoadMoreButton`; `SearchLanding.tsx`: pre-search panel), and
  `pnpm lighthouse:a11y` (`scripts/lighthouse-a11y.mjs`).

## Finished and verified (on `6cfb855`)

- `pnpm typecheck` clean; `pnpm lint` 0 errors (1 pre-existing warning:
  unused eslint-disable in `src/lib/display-prefs.test.ts`); `pnpm
  format:check` clean; `pnpm test` 258 tests green.
- Playwright `public-directory` + `accessibility` + `caregiver-flows` +
  `mobile-map-lazy`, chromium + mobile: 48 passed, 2 skipped.
- Lighthouse accessibility, prod build, home / search / search-list / clinic /
  service / about × mobile + desktop: **100 on all 12 runs**.
- 375px manual check: Service chip active once; active row = "Verified
  clinics only ×" + Clear all; tap 6px above the sheet edge lands on the
  handle button.

## Half-done / not started

Nothing. Every item from the PR #4 handoff's "remaining polish" list shipped
in PR #5. Not wired into CI on purpose: `lighthouse:a11y` needs a running
server + Chrome (`BASE_URL=http://localhost:<port> pnpm lighthouse:a11y`;
`LIGHTHOUSE_BIN=<path>` skips `npx`).

## Single next action

None pending. Next work starts from a fresh worktree off `main`
(`EnterWorktree`), e.g. new features or the empty-prod-DB Places import
(see memory `classifier-blocks-and-prod-data`).

## Decisions already made (do not relitigate)

- `/` and `/clinics` are the same shell; URL written via
  `history.replaceState` (never `router.replace` — remounts the map). URL keys:
  `loc lat lng radius services ages verified online inperson open accessible
  sort` + UI-only `view=list|map`, `sel=<clinicId>`.
- Mobile shell is **map-first** (`resolveInitialView` → `"map"` when no
  `?view=` and no stored pref). Tests asserting list-first must pass
  `?view=list`.
- Map mounts lazily but never unmounts (`AppShell` `mapRevealed` latch). Don't
  flatten it to `desktop || mapView`.
- Motion = `motion` (motion.dev) + `LazyMotion` + `MotionConfig
  reducedMotion="always"` under OS setting or `<html data-reduce-motion>`.
  Vaul not used. Sheet snap math pure (`sheet-snap.ts`).
- Snapshot restore matches on query string only, canonical serialization,
  never cleared; matched on props-derived URL, not `window.location`.
- Active-filter row shows only what the FilterBar can't (sheet-only filters);
  services / ages / toggles live in the bar chips. Sheet handle stays 32px
  visually — hit area extends upward, not downward (header must keep its own
  clicks).
- One primary CTA per surface: card = View clinic; preview = View clinic;
  detail = Directions (Call secondary). Marketing at `/about`.
- e2e contract kept: combobox `/search by city/i`, `/more filters/i`,
  `[data-clinic-id]`, `/clinics? found/`, `window.__thrivemapMap` (dev only),
  "Verified", "Clear all", clinic-page headings / JSON-LD / unverified banner.
- All of `main`'s locked product decisions still hold (local Supabase + dev
  adapters, pg job queue, Quiet Ledger tokens in `globals.css`, OpenFreeMap
  tiles, candidate pipeline is the only way clinics enter prod, Sentry wizard
  config accepted, repo public).

## Traps

- **Port 3000 = main repo's dev server.** Worktree servers must use another
  port; run Playwright with `PLAYWRIGHT_BASE_URL=http://localhost:<port> pnpm
  exec playwright test …` (default `webServer` targets 3000).
- **Browser preview tool reads the MAIN repo's `.claude/launch.json`**, not
  the worktree's — from a worktree, start servers with Bash (`pnpm dev -p
  3112`, `pnpm start -p 3111`) and `preview_start {url}`.
- The worktree-isolated Bash hook rejects compound commands with redirects /
  heredocs / `&&` chains it can't verify — split into plain commands; use the
  Edit tool instead of `sed -i` / python heredocs.
- `gh pr merge --delete-branch` errors locally ("'main' is already used by
  worktree") but the merge still lands remotely — verify with `gh pr view`,
  then delete the branch by hand. `ExitWorktree remove` needs
  `discard_changes: true` even when the commit is already merged.
- `npx lighthouse` via `execFileSync(..., {shell:true})` mangles flags (runs
  all categories, dumps HTML in cwd) — script calls the binary without a
  shell. `.lighthouse/` is git- and prettier-ignored.
- Clicks before hydration are lost — wait for
  `[data-slot=app-shell][data-hydrated]`. The two `[mobile] suggest a clinic`
  tests are flaky under parallel load, not broken.
- `useIsDesktop()` is `false` on server / during hydration; mobile markup is
  the SSR default (`md:h-auto!` on the sheet overrides its SSR height).
  Reloading a page after `resize_window` is required for `enabled` to settle.
- `react-hooks` lint forbids reading `ref.current` during render and sync
  `setState` in effects; accepted pattern is set-state-during-render latches.
- Base UI buttons with `render={<Link/>}` expose `role="button"`.
- Root `pnpm format` rewrites files inside `.claude/worktrees/*`; root `pnpm
  lint` picks up worktree `.next` output — prettier only touched files.
- Headless Chromium WebGL / OpenFreeMap style warnings on map pages are noise.
- `handoff.md` is in `.prettierignore` (regenerated by the PreCompact hook).
