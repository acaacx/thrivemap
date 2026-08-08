# PWA — Design

**Date:** 2026-08-08
**Status:** Approved
**Phase 2 feature 6** ("Mobile/PWA" in the phase plan).

## Purpose

Make ThriveMap installable on caregivers' phones and keep their saved
clinics' contact details reachable with no signal. Scope is the phase
plan's sentence, no more: manifest + offline shell for saved favorites.

## Decisions (locked)

1. **Plan-faithful scope.** Installable app + offline fallback page +
   offline favorites snapshot. No offline search, no cached clinic pages
   (stale-data risk on a directory whose accuracy disclaimer matters).
2. **Hand-rolled service worker, no PWA build plugin.** The behavior is
   ~80 lines; Serwist/next-pwa add Turbopack/Next-16 compat risk for
   nothing this scope needs.
3. **The service worker never caches authenticated responses.** Offline
   favorites come from a `localStorage` snapshot written by the favorites
   page on the client — the user's own device holds the user's own data,
   and there is no HTML-cache privacy or invalidation problem.
4. **No custom install prompt in v1.** Browser default behavior.

## Components

### `src/app/manifest.ts` (Next metadata file convention)

`name`/`short_name` ThriveMap, description from site copy, `display:
"standalone"`, `start_url: "/"`, Warm Horizon `theme_color` (deep teal)
and `background_color` (warm cream) — take exact hex values from the CSS
variables in `src/app/globals.css`. Icons: `/icons/icon-192.png`,
`/icons/icon-512.png`, plus a 512 `purpose: "maskable"` variant.

### Icons (`public/icons/`)

Generated static PNGs (simple mark: deep-teal rounded square, warm-cream
map-pin/heart glyph consistent with the brand). Also
`apple-touch-icon.png` (180×180) wired through root layout metadata
(`icons.apple`). Generation is a build-time task artifact (script or
one-off), committed as static files.

### `public/sw.js`

Versioned cache name (`thrivemap-v1`). On `install`: precache `/offline`
and the icon files, `skipWaiting`. On `activate`: delete old caches,
`clients.claim`. On `fetch`: only handle `mode: "navigate"` requests —
network first, on failure serve cached `/offline`. All other requests
pass through untouched (no API/auth caching, decision 3).

### `SwRegister` (client component, root layout)

Registers `/sw.js` after load, only when `process.env.NODE_ENV ===
"production"` and `"serviceWorker" in navigator`. Silent no-op otherwise.

### `/offline` page (static route)

Warm Horizon-styled shell: "You're offline" heading, explanatory copy,
and a client component that renders the favorites snapshot (clinic name,
address, phone — phone as `tel:` link) from `localStorage`, or a "No
saved clinics on this device yet" empty state. Note under the list:
details may have changed; reconnect for current information.

### `FavoritesSnapshot` (client component on `/account/favorites`)

On mount, writes `localStorage["thrivemap.favorites-snapshot"]`:
`{ version: 1, savedAt: ISO string, items: [{ slug, name, address,
phone }] }`, from props the server-rendered favorites page already has.
Snapshot module `src/modules/favorites/snapshot.ts` owns the shape:
`writeSnapshot(items)`, `readSnapshot(): SnapshotItem[] | null`
(version-checked, corrupt JSON → null, never throws).

## Error handling

- SW registration failure: swallowed (console.warn); app works without.
- Corrupt/missing snapshot: offline page shows empty state.
- `localStorage` unavailable (private mode): snapshot writes wrapped in
  try/catch, no-op.

## Testing

- **Unit:** snapshot round-trip; corrupt JSON → null; version mismatch →
  null; localStorage-throw tolerated.
- **e2e (chromium):** manifest served at `/manifest.webmanifest` with
  correct name/icons; `/offline` renders empty state, then renders a
  seeded localStorage snapshot (page.addInitScript); favorites page visit
  writes the snapshot key for a signed-in caregiver with a favorite.
- **Prod smoke (manual, documented):** SW registration + install prompt
  checked on a production build; step added to
  `docs/operations/deployment.md` release checks. Dev e2e cannot exercise
  the SW (production-only registration) — accepted.

## Out of scope (explicit)

Offline search/clinic pages, background sync, push notifications, custom
install UI, Serwist/workbox adoption, precaching app JS/CSS bundles.
