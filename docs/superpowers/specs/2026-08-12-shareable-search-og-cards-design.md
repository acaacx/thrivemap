# Shareable search cards (Open Graph) — design

Date: 2026-08-12
Status: sections 1–2 approved; section 3 (rendering) provisional pending research

## Why

ThriveMap is live but undiscovered. The chosen growth bet is **demand via
Facebook groups and Messenger** — Philippine caregivers ask for
recommendations in group threads, and someone answers with a link. The link is
the product's front door.

Today every filtered search link previews identically. `src/app/clinics/page.tsx`
exports static metadata with `title: "Find clinics"` and
`alternates.canonical: "/clinics"`, and the repo has no `og:image` anywhere. A
link to "occupational therapy in Davao City" looks exactly like a link to the
bare search page: no image, no place, no count.

**Goal:** pasting a filtered `/clinics` URL into a Facebook group produces a
1200×630 card showing a Philippines map with the matching clinics as pins, the
filter stated in words, and the count.

## Scope

In scope: filtered `/clinics` search links only.

Out of scope (deliberate): clinic-profile cards, location/service page cards,
curated shareable lists, editorial content, any change to search behaviour
itself. Those are separate specs; this one ships the share loop end to end for
one URL shape.

## Decisions already made

- **Share unit is a filtered search result**, not a clinic and not a curated
  list. The URL is already the source of truth for search state, so a filtered
  link is shareable today — only the preview is missing.
- **Self-hosted SVG basemap.** No static-map provider. OpenFreeMap is
  vector-only and cannot serve a raster; a paid provider (MapTiler/Geoapify)
  would meter spend against an aggressive social crawler and add a fifth
  external provider to gate and monitor. Rejected.
- **Route handler, not the `opengraph-image` file convention.** The convention
  receives `params` only, never `searchParams`
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md`),
  so it structurally cannot see filters.
- **Fallback card is a designed state**, not an error. Any failure renders an
  abstract pin field rather than a broken image.

## Section 1 — Architecture

```
GET /api/og/search?<same params as /clinics>  →  ImageResponse (PNG 1200×630)
```

`src/app/clinics/page.tsx` converts its static `metadata` export to
`generateMetadata({ searchParams })`, which:

- builds a human title and description from the filters,
- points `openGraph.images` at an **absolute** `/api/og/search?…` URL,
- sets `openGraph.url` to the **full filtered URL**,
- keeps `alternates.canonical: "/clinics"`.

The canonical and `og:url` diverge on purpose — see Section 4.

New module `src/modules/share/`:

| File | Purpose |
| --- | --- |
| `og/palette.ts` | Warm Horizon as sRGB hex, each value commented with its oklch source |
| `og/projection.ts` | Web Mercator; bbox → viewport fit, padding, min/max span clamp |
| `og/bbox.ts` | The derivation ladder (Section 2) |
| `og/basemap.ts` | Decode PH geometry → SVG path data |
| `og/label.ts` | `SearchParams` → headline + description strings |
| `og/card.tsx` | Satori JSX: map layer, pin layer, caption plate |
| `og/fallback.tsx` | Abstract pin-field card for every failure path |
| `components/ShareButton.tsx` | Web Share API with clipboard fallback |

### Verified integration constraints

- **Middleware never runs on the route.** `src/middleware.ts:50-54` matcher
  excludes `api/` via negative lookahead. No session refresh, no redirect.
- **CSP is irrelevant to satori.** `next.config.ts` applies a CSP to `/(.*)`,
  but CSP is a browser mechanism; satori renders server-side, and the crawler
  fetching `og:image` is not a browser under our policy.
- **Fonts must be vendored.** Fraunces and Nunito Sans come from
  `next/font/google` and exist nowhere as files — no `public/fonts/`, nothing
  readable in `node_modules`. Next's docs require ttf/otf/woff ArrayBuffers via
  `readFile(join(process.cwd(), …))`. Add subset TTFs (display weight for
  Fraunces, regular + semibold for Nunito Sans) and read them from disk. Disk
  reads do not count against the 500KB bundle cap.
- **Runtime is `nodejs`** (required by `fs`). Existing public API routes set no
  `runtime` export at all; this one is explicit and the reason is commented.
- **No server-side PNG caching.** `cachedClinicData`
  (`src/modules/shared/cache.ts`) stores JSON, not binary. The image relies on
  its HTTP `Cache-Control` header, matching existing routes. The *data* behind
  it still goes through `cachedClinicData`.
- **Absolute URLs are manual.** No `absoluteUrl()` helper exists; canonicals
  are relative strings resolved against `metadataBase` (`src/app/layout.tsx:20`
  ← `NEXT_PUBLIC_SITE_URL` via `src/lib/site-config.ts`). Social crawlers need
  a fully-qualified `og:image`, so build it from `siteConfig.url` explicitly.

Response headers: `Cache-Control: public, s-maxage=86400,
stale-while-revalidate=604800`, `Content-Type: image/png`. The route must not
error on an HTTP Range request.

## Section 2 — Data flow

### Bbox derivation ladder

First match wins:

1. `north/south/east/west` present → use directly (shared after panning).
2. `lat/lng` + `radius` → compute the bbox of that circle.
3. Neither → query PH-wide bounds, then fit the bbox to the returned pins.
   Two `getMapClinics` calls, both cached at 60s.
4. No pins → fallback card.

Every bbox is padded, then clamped to a **minimum span** so a single result
does not zoom to one street with no recognisable landmass, and to a **maximum
span** of the Philippines bounding box so a hostile param cannot render the
globe.

### The count

There is no total anywhere. `ClinicSearchResult` is `{clinics, nextCursor}`
(`src/modules/clinics/queries.ts:13`), `search_clinics` caps at 50, pages at
20. Rather than add a count RPC, **the card counts the pins it drew**: "12
clinics on this map." That statement describes the image and cannot be wrong.
`get_map_clinics` caps at `least(coalesce(p_limit, 400), 1000)`
(`supabase/migrations/20260801000005_search.sql:301`), so at the cap the card
reads "400+ clinics."

### The label

`og/label.ts` degrades gracefully:

| Params | Headline |
| --- | --- |
| `services=occupational-therapy&loc=Davao City` | Occupational therapy in Davao City |
| `services=speech,ot&loc=Cebu City` | Speech therapy + 1 more in Cebu City |
| `q=sensory gym` | "sensory gym" — therapy clinics |
| `verified=1` only | Verified clinics in the Philippines |
| none | Therapy clinics across the Philippines |

Service slugs resolve through the existing `getServices()`. `loc` is already a
human label (`src/modules/search/schemas.ts:62`, max 120 chars) so it needs
escaping, not lookup.

### Safety

Params parse through the existing tolerant `parseSearchParams`, which drops
invalid keys and retries rather than throwing
(`src/modules/search/schemas.ts:67-87`). All user-supplied text is XML-escaped
before entering SVG, clamped in length, and the pin array is capped before
drawing.

Rate limiting: `checkRateLimit(scope, identifier, limit, windowSeconds)` exists
(`src/modules/shared/rate-limit.ts`) and fails open, but **no public GET route
currently uses it** — it is only called from mutation server actions. Adding it
here sets a new precedent. Decision: ship without it, rely on
`s-maxage=86400` at the CDN, and revisit if the endpoint shows abuse. Recorded
so the omission is a choice, not an oversight.

## Section 3 — Rendering (PROVISIONAL)

Pending two research reports (satori SVG capability, PH geometry format).
Known so far:

- Satori supports flexbox only — no grid — and a subset of CSS
  (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md`).
- Satori cannot parse `oklch()`, and the entire Warm Horizon palette is oklch
  (`src/app/globals.css:56+`). Hence `og/palette.ts` with hand-converted hex.
- 500KB bundle cap covers JSX, CSS, fonts, and images; runtime disk reads and
  fetches are the documented escape hatch.

Open questions this section must answer: whether a `data:image/svg+xml` `<img>`
is the right vehicle for the basemap, the geometry source and encoding, the
island-simplification threshold that keeps Palawan and Mindoro without turning
the archipelago into confetti, and pin de-collision at low zoom.

## Section 4 — Metadata contract

Emitted on every filtered `/clinics` URL:

```
og:url          <full filtered URL, query string included>
og:type         website
og:title        <headline> | ThriveMap
og:description  <dynamic summary of the filtered set>
og:image        <absolute /api/og/search?… URL>
og:image:width  1200
og:image:height 630
og:locale       en_PH
twitter:card    summary_large_image
```

**The `og:url` rule is load-bearing.** Facebook's cache key is the shared URL
unless `og:url` says otherwise; setting `og:url` to a stripped base URL
collapses every filter variant into a single shared preview. `og:url` takes
precedence over `rel=canonical` for the crawler, which is why the SEO canonical
can safely stay `/clinics`.

Crawler facts that constrain us: `facebookexternalhit/1.1` does not execute
JavaScript (tags must be in the server-rendered HTML — they are, via
`generateMetadata`), expects a response within a few seconds, and reads OG tags
from early in `<head>`. Image limits: ≤8MB, JPEG/GIF/PNG, 1.91:1, ≥200px.

Unverified and flagged: whether Facebook caps the number of distinct cached
URLs per domain for combinatorial query patterns. No documented cap; faceted
search previews are a common pattern elsewhere.

## Section 5 — Failure modes

Every path below renders a valid 1200×630 PNG. The route never returns a
non-image response for a request it can parse.

| Failure | Behaviour |
| --- | --- |
| Geometry asset missing or malformed | Fallback card (abstract pin field) |
| Font read fails | Fallback card with satori's default font |
| `getMapClinics` throws | Fallback card, brand + headline only |
| Zero pins | Fallback card, "No clinics match yet" framing |
| Bbox outside the Philippines | Clamp to PH bounds; if still empty, fallback |
| Unparseable params | `parseSearchParams` drops them; renders PH-wide |

## Section 6 — Testing

The repo has **zero route-handler tests** and no SEO/metadata e2e test, so this
sets a small precedent. Following the co-located `*.test.ts` convention
(`src/modules/search/schemas.test.ts` as the model):

- `og/projection.test.ts` — Mercator round-trips, bbox fitting, span clamps,
  a pin at each corner of the PH bounds landing inside the viewport.
- `og/bbox.test.ts` — each rung of the ladder, in order, including the fall
  through to PH-wide and the no-pins exit.
- `og/label.test.ts` — the table in Section 2, plus escaping of hostile `loc`
  and `q` values.
- `og/basemap.test.ts` — decoder output shape; path data is well-formed.
- e2e: one spec asserting `/api/og/search?...` returns `image/png` with a PNG
  magic-number prefix and non-trivial length, and one asserting a filtered
  `/clinics` URL emits `og:url` carrying the query string.

Manual QA gate before calling it done: representative filter combinations run
through the Facebook Sharing Debugger, confirming distinct previews per filter.

## Success criteria

1. Three different filtered URLs produce three visibly different preview cards
   in the Sharing Debugger.
2. The card names the filter and the place in words a caregiver would use.
3. Cold-cache image generation stays comfortably inside the crawler's
   few-second window.
4. Every failure mode above yields a designed card, never a broken image.
