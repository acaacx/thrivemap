# Shareable search cards (Open Graph) — design

Date: 2026-08-12
Status: reviewed and approved (all sections), ready for an implementation plan

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

| File                         | Purpose                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `og/palette.ts`              | Warm Horizon as sRGB hex, each value commented with its oklch source |
| `og/projection.ts`           | Web Mercator; bbox → viewport fit, padding, min/max span clamp       |
| `og/bbox.ts`                 | The derivation ladder (Section 2)                                    |
| `og/basemap.ts`              | Load + decode PH geometry → SVG path `d` strings                     |
| `og/label.ts`                | `SearchParams` → headline + description strings                      |
| `og/card.tsx`                | Satori JSX: map layer, pin layer, caption plate                      |
| `og/fallback.tsx`            | Abstract pin-field card for every failure path                       |
| `components/ShareButton.tsx` | Web Share API with clipboard fallback                                |

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
  its HTTP `Cache-Control` header, matching existing routes. The _data_ behind
  it still goes through `cachedClinicData`.
- **Absolute URLs are manual.** No `absoluteUrl()` helper exists; canonicals
  are relative strings resolved against `metadataBase` (`src/app/layout.tsx:20`
  ← `NEXT_PUBLIC_SITE_URL` via `src/lib/site-config.ts`). Social crawlers need
  a fully-qualified `og:image`, so build it from `siteConfig.url` explicitly.
- **Runtime assets must be traced explicitly.** `readFile(join(process.cwd(),
…))` is a dynamic path the output tracer cannot follow, so the fonts and the
  geometry would be omitted from the serverless bundle — the route works in dev
  and throws `ENOENT` in production.
  `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md:80`
  names `outputFileTracingIncludes` as the fix. `next.config.ts` has no tracing
  config today, so this is new:

  ```ts
  outputFileTracingIncludes: {
    "/api/og/search": ["assets/fonts/**/*", "assets/geo/**/*"],
  }
  ```

  Nothing proves this worked until it runs on Vercel — see the deploy smoke
  check in Section 6.

- **All runtime assets live in `assets/`, never `public/`.** Fonts and geometry
  are read from disk by the route and are not resources the site serves. One
  location means one tracing rule and no public URL implying they are a
  supported asset.

### Response headers

`Content-Type: image/png`, and a cache lifetime that depends on which card was
rendered:

| Card     | `Cache-Control`                                         |
| -------- | ------------------------------------------------------- |
| Full     | `public, s-maxage=86400, stale-while-revalidate=604800` |
| Fallback | `public, s-maxage=60, stale-while-revalidate=300`       |

**The split is load-bearing.** A fallback is a transient failure, but the day
long TTL would pin it at the CDN — and Facebook caches on top of that, so a
thirty-second database blip would otherwise become a broken-looking card that
outlives the incident by days. Both cards return **200**; a non-200 teaches the
crawler to treat the URL as broken.

The route also sets `x-og-card: full | fallback`, which is what makes the
deploy smoke check in Section 6 able to tell a working card from a
silently-degraded one.

The route must not error on an HTTP Range request.

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
(`src/modules/clinics/queries.ts:13`), `search_clinics` caps at 50, pages at 20. Rather than add a count RPC, **the card counts the pins it drew**: "12
clinics on this map." That statement describes the image and cannot be wrong.
`get_map_clinics` caps at `least(coalesce(p_limit, 400), 1000)`
(`supabase/migrations/20260801000005_search.sql:301`), so at the cap the card
reads "400+ clinics."

### The label

`og/label.ts` degrades gracefully:

| Params                                         | Headline                               |
| ---------------------------------------------- | -------------------------------------- |
| `services=occupational-therapy&loc=Davao City` | Occupational therapy in Davao City     |
| `services=speech,ot&loc=Cebu City`             | Speech therapy + 1 more in Cebu City   |
| `q=sensory gym`                                | "sensory gym" — therapy clinics        |
| `verified=1` only                              | Verified clinics in the Philippines    |
| none                                           | Therapy clinics across the Philippines |

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

## Section 3 — Rendering

Next 16.2.12 vendors satori 0.25.0 and `@resvg/resvg-wasm` 2.4.0 inside
`@vercel/og` 0.11.1 (`node_modules/next/dist/compiled/@vercel/og/index.node.js`)
— there is no separate top-level satori package to check.

### Inline SVG, not a data URI

Satori has a real tag registry for `svg`, `path`, `circle`, `rect`, `ellipse`,
`polygon`, `line`, and gradients, and reads `viewBox` for aspect ratio. The
basemap is therefore emitted as **inline `<svg>` JSX children**, not a
base64 `data:image/svg+xml` `<img>`. Same support level, no encoding overhead,
and — the real win — pins share one coordinate space with the land paths
instead of being positioned against an opaque image.

### Geometry

**Natural Earth 1:50m admin-0, Philippines feature only.** Public domain, no
attribution required (GADM is non-commercial and disqualified; geoBoundaries
and OSM carry attribution/share-alike obligations Natural Earth does not).
Measured raw size for the PH feature at 1:50m: 34.5 KB.

**Province boundaries are cut from v1.** Natural Earth's 1:50m admin-1 layer
has _zero_ Philippines coverage, so provinces would force the 1:10m layer
(668 KB raw, 118 features) — twenty times the weight of the outline, for
internal lines nobody can read on a 1200×630 card that already has a text
plate over it. The outline alone reads as "the Philippines."

Prepared once, offline, and committed as a static asset at
`assets/geo/ph-outline.geojson`. Source:
`https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip`
(Natural Earth 1:50m admin-0, public domain). `mapshaper` is not installed —
run it through `npx`:

```
npx -y mapshaper@0.6 ne_50m_admin_0_countries.shp \
  -filter 'ADMIN=="Philippines"' \
  -filter-islands min-area=10km2 \
  -simplify 15% weighted visvalingam keep-shapes \
  -clean \
  -o format=geojson precision=0.0001 assets/geo/ph-outline.geojson
```

Expected output 8–14 KB, well under any limit and gzip-served on top.
`-filter-islands` runs **before** `-simplify` so tiny islets are dropped
cleanly rather than being reduced to degenerate slivers. The 10 km² threshold
sits safely below Mindoro (~9,735 km²) and Palawan (~14,650 km²) — the
smallest islands that must survive — while stripping the ~7,600-island tail
that would otherwise render as confetti.

Format is plain quantized GeoJSON, `JSON.parse`d in the route. TopoJSON's
shared-arc win applies to adjacent polygons, which a single dissolved outline
does not have, and it would cost a `topojson-client` dependency plus a decode
step on every cold start. Revisit only if the asset ever passes ~50 KB gzip.

### Projection

Web Mercator, matching the MapLibre map the card depicts. Land geometry and
pins pass through the same transform, so the card is self-consistent either
way; Mercator is a few lines and keeps the country's silhouette identical to
the one users see in-app. No `d3-geo` dependency.

### Colors

Satori's vendored parser (`parse-css-color` 0.2.1) accepts hex (3/4/6/8-digit),
`rgb()`/`rgba()`, `hsl()`/`hsla()`, and named colors — and **nothing else**.
No `oklch()`, `oklab()`, `lab()`, `lch()`, `hwb()`, or `color-mix()`. The
entire Warm Horizon palette is oklch (`src/app/globals.css:56+`), so
`og/palette.ts` hand-converts every token used on the card to hex, each
annotated with the oklch source it came from so drift is visible in review.

### Fonts

`readFile(join(process.cwd(), "assets/fonts/<file>.ttf"))` under the default
Node runtime, per the current Next docs. The self-fetch-your-own-origin
pattern is stale Next 13-era advice and is not used. Only ttf/otf/woff are
supported; ttf is preferred for parse speed. Subset files live in `assets/`,
not `public/` — they are read from disk, never served.

**Fraunces is a variable font and satori wants a static instance.**
`src/app/layout.tsx:8-12` loads it through `next/font/google` with the `SOFT`,
`WONK`, and `opsz` axes live. Handing satori a variable TTF is not the
supported path, so the axes must be frozen at the values the card uses and the
result subset. Prepared once, offline, from the upstream Google Fonts sources,
and committed:

```
# Fraunces — freeze the axes, then subset
pyftsubset Fraunces[SOFT,WONK,opsz,wght].ttf \
  --instance-features --variations='opsz=32:SOFT=0:WONK=1:wght=600' \
  --unicodes=U+0020-007E,U+00A0-00FF,U+2010-2027 \
  --output-file=assets/fonts/fraunces-display.ttf

# Nunito Sans — two static weights, same unicode range
pyftsubset NunitoSans[YTLC,opsz,wdth,wght].ttf \
  --instance-features --variations='opsz=12:wdth=100:wght=400' \
  --unicodes=U+0020-007E,U+00A0-00FF,U+2010-2027 \
  --output-file=assets/fonts/nunito-sans-regular.ttf
# …and again with wght=600 → nunito-sans-semibold.ttf
```

The unicode range is Latin plus the punctuation the labels actually use;
Filipino place names stay inside it. Both families are OFL, so `OFL.txt` ships
alongside them in `assets/fonts/`.

Exact upstream URLs and the tool version go in the commit that adds the
binaries, so the assets stay reproducible.

### Layers

Confirmed present in satori's render code: absolute positioning, `opacity`,
`transform` (2D only), `borderRadius`, `boxShadow`. Flexbox only — no grid.
The card is three stacked absolutely-positioned layers: land, pins, caption
plate.

Pins are circles with a coral fill and a cream halo stroke so overlapping pins
stay countable. At low zoom, pins closer than a fixed pixel distance collapse
into a single larger pin — the count in the caption always reflects the pins
_found_, not the circles _drawn_.

### Performance

`@resvg/resvg-wasm` is the WASM build, slower than native, and render time
scales with path complexity. The simplified outline (thousands of points, not
tens of thousands) is the mitigation. No hard point-count limit or truncation
exists in the bundle, but this is unverified by measurement:
**the implementation plan must include a timing spike on the real asset before
this ships**, against the crawler's few-second budget.

### Wall-clock budget

Section 5 covers `getMapClinics` _throwing_. It hanging is the worse case: the
crawler gives up with nothing, and because Facebook caches the miss there is no
second chance for a while. So the whole data-fetch-and-render path races a
**2-second timer**, and losing the race renders the fallback card — which, per
the split TTL above, expires in 60 seconds rather than a day.

2s leaves headroom inside the crawler's few-second window for TLS, cold start,
and transfer. The timing spike may argue for a different number; it may not
argue for removing the race.

## Section 4 — Metadata contract

`src/app/layout.tsx:19-35` already emits `og:type`, `og:site_name`,
`og:locale: en_PH`, and `twitter:card: summary_large_image` for every route.
**The page does not re-declare them.** What `generateMetadata` adds:

```
og:url          <full filtered URL, query string included>
og:title        <headline>
og:description  <dynamic summary of the filtered set>
og:image        <absolute /api/og/search?… URL>
og:image:width  1200
og:image:height 630
og:image:alt    <sentence describing the card>
```

**`og:title` is the bare headline — no site-name suffix.** The root template is
`%s — ThriveMap` (`src/app/layout.tsx:23`), and per
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:343`
a page's `title` string augments that template, so `<title>` renders as
"Occupational therapy in Davao City — ThriveMap". Nothing in the docs says
`openGraph.title` inherits from `title`, so it is set explicitly — and set
without the suffix, because `og:site_name` already carries the brand and card
width is scarce.

`og:image:alt` is not decoration: Facebook surfaces it and screen readers
depend on it, and the card is otherwise a wall of unreadable pixels.

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

| Failure                             | Behaviour                                       |
| ----------------------------------- | ----------------------------------------------- |
| Geometry asset missing or malformed | Fallback card (abstract pin field)              |
| Font read fails                     | Fallback card with satori's default font        |
| `getMapClinics` throws              | Fallback card, brand + headline only            |
| `getMapClinics` hangs               | 2s race expires → fallback card                 |
| Zero pins                           | Fallback card, "No clinics match yet" framing   |
| Bbox outside the Philippines        | Clamp to PH bounds; if still empty, fallback    |
| Unparseable params                  | `parseSearchParams` drops them; renders PH-wide |

Every fallback answers 200 with the 60-second TTL and `x-og-card: fallback`.

**One failure the route cannot catch:** `siteConfig.url` falls back to
`http://localhost:3000` when `NEXT_PUBLIC_SITE_URL` is unset
(`src/lib/site-config.ts:3`). That breaks every `og:image` on the site at once,
from the metadata side, with nothing in the logs and a perfectly healthy route.
Vercel environment rows have gone empty here before, so the deploy smoke check
asserts the emitted `og:image` is absolute and on the production origin.

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
- `og/card.test.tsx` — runs satori for real and asserts a PNG magic-number
  prefix. Satori ignores unsupported CSS **silently**, so without this a
  property that renders nothing looks identical to a property that works. It is
  also the same harness as the timing spike, so it costs nothing extra.
- e2e: one spec asserting `/api/og/search?...` returns `image/png` with a PNG
  magic-number prefix and non-trivial length, one asserting the route answers
  200 with `x-og-card` set for hostile and nonsense params, and one asserting a
  filtered `/clinics` URL emits `og:url` carrying the query string.

**Deploy smoke check**, because `outputFileTracingIncludes` is only ever proven
in production: hit the deployed `/api/og/search`, assert `image/png` **and
`x-og-card: full`**. Without the header this check passes on a fallback card,
which is exactly what a tracing miss produces — the header is what turns an
unfalsifiable assertion into a real one. It also asserts the `og:image` on a
filtered `/clinics` URL is absolute and on the production origin.

Manual QA gate before calling it done: representative filter combinations run
through the Facebook Sharing Debugger, confirming distinct previews per filter.

## Success criteria

1. Three different filtered URLs produce three visibly different preview cards
   in the Sharing Debugger.
2. The card names the filter and the place in words a caregiver would use.
3. Cold-cache image generation stays comfortably inside the crawler's
   few-second window.
4. Every failure mode above yields a designed card, never a broken image.
