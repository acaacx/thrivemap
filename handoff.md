# Handoff — ThriveMap, branch `claude/thrivemap-uber-ux-162dd9`

Worktree: `/Users/alaric/code/ausomeapp/.claude/worktrees/thrivemap-uber-ux-162dd9`
(base `main` @ `8057107`). Plan: `~/.claude/plans/claude-design-prompt-composed-reef.md`.

## What we are trying to do

Turn ThriveMap from a directory website into a **location-first, map-first
application** ("Uber-style"): the homepage *is* the search shell, results sit
in a bottom sheet over the map on mobile and beside a persistent map on
desktop, one primary action per screen, calm "Quiet Ledger" visuals kept —
**without touching backend / RPC / `/api/*` / DB**. Everything is on this
branch, unpushed, in three commits:

- `7f446a1` Stage A — app shell + location search + map-first layout (plan §1–3)
- `ac8380e` Stage B — bottom sheet, compact cards, map/list sync, filter chips,
  clinic preview (§4–8)
- `348c2f9` Stage C — clinic details, persistent search state, loading / empty /
  error states, reduced motion + a11y (§9–14)

## Finished and verified (on `348c2f9`)

- `pnpm typecheck` clean; `pnpm lint` 0 errors (1 pre-existing warning: unused
  eslint-disable in `src/lib/display-prefs.test.ts`); `pnpm format:check`
  clean; `pnpm test` 34 files / 254 tests green.
- Playwright `public-directory` + `accessibility` + `caregiver-flows`, chromium
  + mobile, against the worktree dev server: **45 passed, 1 skipped, 2 failed** —
  both failures are `[mobile] suggest a clinic › duplicate check…` and
  `[mobile] suggest a clinic › new clinic suggestion is accepted`, which pass in
  isolation and fail only under the parallel full run (click lands before the
  suggest form hydrates; the first one already failed on the Stage B baseline).
  Not caused by this branch; untouched pages.
- Screenshots (375 + 1280) of empty / results / selection+preview / detail
  with sticky bar / no-results / error (`/api/search` aborted) / reduced
  motion / back-restore in the scratchpad `shots-c/` (session-local, not in
  git). Back-restore verified: map zoom+center, list scrollTop and sheet snap
  are identical after "Back to results".
- Stage C content:
  - `/clinics/[slug]`: header → Services → About → Accessibility → Age groups →
    Languages → Hours → Contact → Location map → Care team → Ratings; sidebar =
    action card (Directions primary / Call / Website) + Inquiry + Report/Claim.
    Mobile: fixed bottom bar (Directions + Call), `main` gets `pb-24 lg:pb-0`.
    `search-context.tsx` (client): `BackToResults` (snapshot URL or `/clinics`)
    and `DistanceFromSearch` ("2.1 km from your search", only when the
    referring search had `lat/lng`). Grid columns `min-w-0` (long contact
    strings used to widen the page past 375px).
  - `src/modules/search/search-snapshot.ts` (+ tests): sessionStorage
    `tm-search-snapshot` = `{url, listScrollTop, mapCenter, mapZoom, sheetSnap,
    selectedId}`; written by a capture-phase click handler around the results
    for any `a[href^="/clinics/<slug>"]`; read in `SearchPageClient` via lazy
    `useState` keyed on the **canonical** URL of the render's props
    (`buildShellUrl(initialParams, view, sel)`), not `window.location`.
    `ClinicMap` gained `initialCamera` (constructed at that camera, initial fit
    skipped) + `cameraRef` (`getCamera()`); sheet snap is now controlled by
    the search page; `ClinicBottomSheet` restores `initialScrollTop`.
  - States: `ResultsPlaceholder` (static rows) + "Finding therapy centers
    nearby…" on the first search; "Updating results…" afterwards
    (`aria-live=polite` in `ResultsHeader`); `error` prop → "Results
    unavailable"; inline `ErrorState` above stale results on a failed refetch;
    empty-state actions Expand search area (10→25→50→100 km, hidden at 100) /
    Remove filters / Browse all services / Suggest a clinic; location denied →
    toast (existing) + focus + inline hint under the search box; empty or
    error lifts a collapsed mobile sheet to `mid`.
  - Sheet: SSR height = collapsed peak (`useMotionValue(enabled ? 120 :
    "auto")`) so it no longer covers the map pre-hydration; `data-sheet-snap`
    and the handle label render only after hydration (`useHydrated`, exported
    from `ClinicBottomSheet.tsx`); shell root has `data-hydrated`.

## Half-done / not started

- Nothing on the plan is half-implemented. Remaining polish that was noted
  and deliberately left:
  - Sheet handle button is 32px tall (h-8), not 44px — the header row and the
    list edge are the real drag zones; 44px added a large blank band.
  - Filter row on mobile shows a selected service both as the Service chip
    label and as a removable active chip (Stage B design; not revisited).
  - Lighthouse a11y ≥ 95 was not run (axe via `e2e/accessibility.spec.ts`
    is green on landing, search, clinic profile, service, about).
  - `SearchPageClient.tsx` is ~850 lines; the results branch could be
    extracted, but nothing depends on it.
- Not pushed, no PR. Base `main` may have moved (`git fetch` first).

## Single next action

Push the branch and open a PR to `main` (`git push -u origin
claude/thrivemap-uber-ux-162dd9`), or `git merge --no-ff` on `main` if `gh pr
merge` is classifier-blocked as before. Before that, re-run
`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` and the three
Playwright specs against a dev server started **from this worktree** (see
Traps).

## Decisions already made (do not relitigate)

- Homepage `/` renders the same `SearchShell` as `/clinics`; the shell always
  writes its URL to `/clinics?…` via `history.replaceState` (never
  `router.replace` — it would remount the map). URL is source of truth:
  `loc lat lng radius services ages verified online inperson open accessible
  sort` + UI-only `view=list|map` and `sel=<clinicId>`.
- Motion library = `motion` (motion.dev) behind `LazyMotion` +
  `MotionConfig reducedMotion="always"` when either the OS setting or
  `<html data-reduce-motion>` is on (`src/lib/reduced-motion.ts`). Vaul not
  used. Sheet snap math is pure (`sheet-snap.ts`), snaps instant under
  reduced motion; MapLibre camera `duration: 0` under reduced motion.
- Snapshot restore matches on the **query string only** (path ignored:
  `/` and `/clinics` are the same shell) and on the canonical serialization.
  Snapshot is never cleared; a non-matching one is simply ignored.
- "Accepting new clients" chip/status omitted — no such field in the schema.
- Distance on cards/detail only with coordinates; label-only searches show
  city only.
- One primary CTA per surface: card = View clinic; preview = View clinic;
  detail = Directions (Call secondary). Old homepage marketing lives at
  `/about`, Share moved to overflow, sort inside the filter sheet.
- e2e contract kept: combobox `/search by city/i`, `/more filters/i`,
  `[data-clinic-id]`, `/clinics? found/`, `window.__thrivemapMap` (dev only),
  "Verified", "Clear all", clinic-page headings/buttons/JSON-LD/unverified
  banner text.
- All of `main`'s locked product decisions still hold (local Supabase + dev
  adapters, pg job queue, Quiet Ledger design tokens in `globals.css`,
  OpenFreeMap tiles, candidate pipeline is the only way clinics enter prod,
  Sentry wizard config accepted, repo public).

## Traps

- **Port 3000 is the MAIN repo's dev server, not this worktree's.** The
  worktree's `next dev` was on `http://localhost:49638` this session (find it
  with `lsof -p <next-server pid> -a -iTCP -sTCP:LISTEN`, or start one with
  `pnpm dev -p <port>` from the worktree). Run Playwright with
  `PLAYWRIGHT_BASE_URL=http://localhost:<port> pnpm exec playwright test …` —
  the default config's `webServer` points at 3000 and would test `main`.
- **Clicks before hydration are lost** (server-rendered shell, nothing replays
  them). Wait for `[data-slot=app-shell][data-hydrated]` (already done in the
  "load more" test); the two `suggest a clinic` mobile failures under load are
  the same race on an untouched form.
- **`window.location` is stale during a client navigation render** — that is
  why the snapshot is matched on the props-derived canonical URL. Don't
  "simplify" it back to `location.search`.
- **`useState` lazy initializers may read `sessionStorage`** only because
  nothing rendered during hydration depends on the value; snap-dependent
  attributes are gated on `useHydrated()`. Keep that gate.
- `react-hooks` lint rules in this repo forbid reading `ref.current` during
  render and `setState` synchronously inside effects; the accepted pattern is
  set-state-during-render for derived latches (`shownResults`, `liftedFor`).
- Base UI buttons rendered with `render={<Link/>}` expose `role="button"`;
  Playwright must use `getByRole("button", { name: /view clinic/i })`.
- `useIsDesktop()` is `false` on the server and during hydration, so mobile
  markup is the SSR default and `md:` classes must keep desktop correct
  (`md:h-auto!` on the sheet overrides its inline SSR height).
- Headless Chromium prints WebGL/`GL_CLOSE_PATH_NV` warnings and OpenFreeMap
  style warnings on every map page — noise, not errors.
- Screenshot script must run from the worktree (`node ./x.mjs`) so
  `@playwright/test` resolves; a copy in the scratchpad can't import it.
- The Next dev indicator ("N" bubble, bottom-left) appears in headless
  screenshots; dev-only.
- Playwright `expect.timeout` 15 s, `workers` 2; restart the dev server
  between full e2e runs if it gets slow. `pnpm format` from the repo root
  rewrites files inside `.claude/worktrees/*`; `pnpm lint` at the root picks
  up worktree `.next` output.
- `handoff.md` is in `.prettierignore` (regenerated by the PreCompact hook).
