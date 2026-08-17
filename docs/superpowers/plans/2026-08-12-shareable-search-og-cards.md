# Shareable Search OG Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasting a filtered `/clinics` URL into a Facebook group produces a 1200×630 preview card showing a Philippines map with the matching clinics as pins, the filter stated in words, and the count.

**Architecture:** A `nodejs`-runtime route handler at `/api/og/search` takes the same query params as `/clinics`, resolves a bounding box and pins from the existing `getMapClinics`, projects both the country outline and the pins through one shared Web Mercator transform, and renders inline SVG through satori (vendored inside Next's `@vercel/og`). `src/app/clinics/page.tsx` swaps its static `metadata` export for `generateMetadata({ searchParams })`, which points `og:image` at that route. Every failure path renders a designed fallback card, never an error.

**Tech Stack:** Next.js 16.2.12 (App Router), `next/og` (`ImageResponse` — satori 0.25.0 + `@resvg/resvg-wasm` 2.4.0, already vendored), TypeScript, zod 4, Supabase RPC, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-12-shareable-search-og-cards-design.md` — read it before starting. Every decision below traces to a section there.

## Global Constraints

- **Card size is exactly 1200×630.** Facebook requires 1.91:1, ≥200px, ≤8MB, PNG/JPEG/GIF.
- **The route always returns 200 with `Content-Type: image/png`** for any request it can parse. A non-200 teaches the crawler the URL is broken.
- **Every response sets `x-og-card: full` or `x-og-card: fallback`.** The deploy smoke check depends on it.
- **Cache-Control depends on which card rendered:** full → `public, s-maxage=86400, stale-while-revalidate=604800`; fallback → `public, s-maxage=60, stale-while-revalidate=300`.
- **Satori's color parser accepts hex, `rgb()`, `hsl()`, and named colors only.** No `oklch()`, `oklab()`, `lab()`, `lch()`, `hwb()`, `color-mix()`. Every color on the card comes from `og/palette.ts` as hex.
- **Satori is flexbox-only.** No CSS grid. Layers are absolutely positioned.
- **All runtime assets live in `assets/`, never `public/`.** They are read from disk, never served.
- **`readFile(join(process.cwd(), …))` paths must be declared in `outputFileTracingIncludes`** or they vanish from the serverless bundle.
- **Runtime is `nodejs`** (`fs` is required). Declare it explicitly with a comment.
- **The whole data+render path races a 2000ms timer.** Losing renders the fallback.
- **Vitest defaults to `jsdom`** (`vitest.config.ts:15`). Any test touching `fs`, `server-only`, or satori needs `// @vitest-environment node` on line 1 — see `src/lib/env.test.ts:1` for the convention.
- **Tests are co-located** as `*.test.ts` / `*.test.tsx` beside the module. Model: `src/modules/search/schemas.test.ts`.
- **Run `pnpm format` before every commit.** Prettier is enforced by `pnpm format:check` in CI.

## File Structure

**New module `src/modules/share/`:**

| File                         | Responsibility                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `og/palette.ts`              | Warm Horizon tokens as sRGB hex, each annotated with its oklch source               |
| `og/projection.ts`           | Web Mercator, bbox padding/clamping, viewport fit, pin clustering. Pure, no I/O     |
| `og/basemap.ts`              | Read + parse `assets/geo/ph-outline.geojson`, project rings to SVG path `d` strings |
| `og/fonts.ts`                | Read the three TTFs from `assets/fonts/`, cache the buffers at module scope         |
| `og/bbox.ts`                 | The derivation ladder — params → `{bbox, pins, atCap}` or `null`                    |
| `og/label.ts`                | `SearchParams` + count → headline, description, alt text. Pure                      |
| `og/card.tsx`                | Satori JSX for the full card: land layer, pin layer, caption plate                  |
| `og/fallback.tsx`            | Satori JSX for the abstract pin-field card                                          |
| `components/ShareButton.tsx` | Client component: Web Share API with clipboard fallback                             |

`og/fonts.ts` is not in the spec's table — it exists because three call sites need the same buffers and re-reading them per request is waste.

**New assets (binary, committed):** `assets/geo/ph-outline.geojson`, `assets/fonts/fraunces-display.ttf`, `assets/fonts/nunito-sans-regular.ttf`, `assets/fonts/nunito-sans-semibold.ttf`, `assets/fonts/OFL.txt`.

**New route:** `src/app/api/og/search/route.ts`.

**Modified:** `next.config.ts` (tracing), `src/app/clinics/page.tsx` (`generateMetadata`), `.github/workflows/main.yml` (smoke check).

**New tests:** `og/projection.test.ts`, `og/basemap.test.ts`, `og/label.test.ts`, `og/bbox.test.ts`, `og/card.test.tsx`, `e2e/og-cards.spec.ts`.

---

### Task 1: Assets and the timing gate

Everything else builds on the assumption that WASM rasterisation of the real outline fits inside a crawler's patience. That is unmeasured. This task produces the assets and proves the assumption before any card code exists.

**Files:**

- Create: `assets/geo/ph-outline.geojson` (generated)
- Create: `assets/fonts/fraunces-display.ttf`, `assets/fonts/nunito-sans-regular.ttf`, `assets/fonts/nunito-sans-semibold.ttf`, `assets/fonts/OFL.txt` (generated)
- Create: `assets/README.md`
- Create: `scripts/bench-og-render.mjs`
- Modify: `next.config.ts:75-79`

- [ ] **Step 1: Generate the Philippines outline**

> **Superseded 2026-08-18:** the committed asset is now built from Natural Earth
> **1:10m** at 15% retention (78 islands vs 18 — 1:50m looked faceted on zoomed
> cards). The current pipeline lives in `assets/README.md`; the 1:50m commands
> below are kept for history only.

Natural Earth 1:50m admin-0 is public domain — no attribution required. `mapshaper` is not installed; use `npx`. Run from the repo root:

```bash
mkdir -p assets/geo /tmp/ne
curl -fsSL -o /tmp/ne/ne_50m_admin_0_countries.zip \
  https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip
unzip -o /tmp/ne/ne_50m_admin_0_countries.zip -d /tmp/ne

npx -y mapshaper@0.6 /tmp/ne/ne_50m_admin_0_countries.shp \
  -filter 'ADMIN=="Philippines"' \
  -filter-islands min-area=10km2 \
  -simplify 15% weighted visvalingam keep-shapes \
  -clean \
  -o format=geojson precision=0.0001 assets/geo/ph-outline.geojson
```

`-filter-islands` runs **before** `-simplify` on purpose: simplifying first would reduce tiny islets to degenerate slivers instead of dropping them cleanly. The 10 km² threshold sits below Mindoro (~9,735 km²) and Palawan (~14,650 km²) — the smallest islands that must survive — while stripping the ~7,600-island tail that would render as confetti.

- [ ] **Step 2: Verify the outline**

```bash
ls -la assets/geo/ph-outline.geojson
node -e "const g=require('./assets/geo/ph-outline.geojson');const f=g.features[0];console.log(f.geometry.type, JSON.stringify(f.geometry.coordinates).split('],[').length+' points')"
```

Expected: 8–14 KB, geometry type `MultiPolygon`, a few thousand points. If it is over 50 KB, raise the simplify percentage and re-run — do not proceed with a heavier asset.

- [ ] **Step 3: Generate the fonts**

Fraunces is loaded as a **variable** font with live `SOFT`, `WONK`, and `opsz` axes (`src/app/layout.tsx:8-12`). Satori wants a static instance, so freeze the axes and subset. Requires `fonttools` (`pipx install fonttools` or `pip install fonttools[woff]`).

```bash
mkdir -p assets/fonts /tmp/fonts
curl -fsSL -o /tmp/fonts/Fraunces.ttf \
  "https://github.com/google/fonts/raw/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
curl -fsSL -o /tmp/fonts/NunitoSans.ttf \
  "https://github.com/google/fonts/raw/main/ofl/nunitosans/NunitoSans%5BYTLC%2Copsz%2Cwdth%2Cwght%5D.ttf"
curl -fsSL -o assets/fonts/OFL.txt \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt"

RANGE="U+0020-007E,U+00A0-00FF,U+2010-2027"

pyftsubset /tmp/fonts/Fraunces.ttf \
  --instance-features --variations='opsz=32:SOFT=0:WONK=1:wght=600' \
  --unicodes=$RANGE --output-file=assets/fonts/fraunces-display.ttf

pyftsubset /tmp/fonts/NunitoSans.ttf \
  --instance-features --variations='opsz=12:wdth=100:wght=400' \
  --unicodes=$RANGE --output-file=assets/fonts/nunito-sans-regular.ttf

pyftsubset /tmp/fonts/NunitoSans.ttf \
  --instance-features --variations='opsz=12:wdth=100:wght=600' \
  --unicodes=$RANGE --output-file=assets/fonts/nunito-sans-semibold.ttf
```

The unicode range is Latin-1 plus general punctuation. Filipino place names ("Parañaque", "Cebu City", "Davao") stay inside it. Both families are OFL — `OFL.txt` must ship.

- [ ] **Step 4: Record provenance**

Create `assets/README.md`:

```markdown
# Runtime assets

Read from disk by `/api/og/search` via `readFile(join(process.cwd(), …))`.
**Never served** — these are not in `public/` on purpose, and they are only in
the serverless bundle because `outputFileTracingIncludes` in `next.config.ts`
names them. If you move or rename anything here, update that config or the
route will throw ENOENT in production while working fine in dev.

## geo/ph-outline.geojson

Natural Earth 1:50m admin-0, Philippines feature only. Public domain, no
attribution required. Regenerate with the commands in
`docs/superpowers/plans/2026-08-12-shareable-search-og-cards.md`, Task 1.

## fonts/

Fraunces and Nunito Sans, both OFL (see `OFL.txt`). Fraunces upstream is a
variable font; these are static instances frozen at the card's axis values,
then subset to Latin-1 + general punctuation. Regeneration commands are in the
same plan section.
```

- [ ] **Step 5: Declare the assets in file tracing**

`readFile(join(process.cwd(), …))` is a dynamic path the output tracer cannot follow (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md:80`). Without this the route works in dev and throws `ENOENT` in production.

In `next.config.ts`, replace:

```ts
const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
```

with:

```ts
const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  /**
   * The OG card route reads fonts and geometry with
   * readFile(join(process.cwd(), …)). Those paths are computed at runtime, so
   * the output tracer cannot see them and would omit the files from the
   * serverless bundle — the route works in dev and 500s in production. Only a
   * real deploy proves this works; the smoke check in main.yml is the guard.
   */
  outputFileTracingIncludes: {
    "/api/og/search": ["assets/fonts/**/*", "assets/geo/**/*"],
  },
};
```

- [ ] **Step 6: Write the timing bench**

This is the gate, not a test — it stays in the repo as a re-runnable measurement. Create `scripts/bench-og-render.mjs`:

```js
// Measures satori + resvg on the real assets, at the worst case the card can
// reach: full outline, 400 pins (get_map_clinics caps there), three fonts.
// Run: node scripts/bench-og-render.mjs
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

const root = process.cwd();
const geo = JSON.parse(
  await readFile(join(root, "assets/geo/ph-outline.geojson"), "utf8"),
);

// Crude equirectangular projection — the bench measures rasterisation cost,
// not projection accuracy, and real Mercator lands in Task 2.
const W = 1200,
  H = 630;
const project = ([lng, lat]) => [
  ((lng - 116.7) / (127.0 - 116.7)) * W,
  ((21.5 - lat) / (21.5 - 4.2)) * H,
];

const paths = [];
for (const feature of geo.features) {
  const polys =
    feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates];
  for (const poly of polys) {
    for (const ring of poly) {
      const pts = ring.map(project);
      paths.push(
        "M" +
          pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") +
          "Z",
      );
    }
  }
}
const points = paths.reduce((n, d) => n + d.split("L").length, 0);
console.log(`${paths.length} rings, ~${points} points`);

const fonts = [
  { name: "Fraunces", file: "fraunces-display.ttf", weight: 600 },
  { name: "Nunito Sans", file: "nunito-sans-regular.ttf", weight: 400 },
  { name: "Nunito Sans", file: "nunito-sans-semibold.ttf", weight: 600 },
];
const loaded = await Promise.all(
  fonts.map(async (f) => ({
    name: f.name,
    weight: f.weight,
    style: "normal",
    data: await readFile(join(root, "assets/fonts", f.file)),
  })),
);

const pins = Array.from({ length: 400 }, (_, i) => ({
  x: 200 + ((i * 37) % 800),
  y: 100 + ((i * 53) % 400),
}));

function scene() {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        width: W,
        height: H,
        background: "#fdfaf4",
        position: "relative",
      },
      children: [
        {
          type: "svg",
          props: {
            width: W,
            height: H,
            viewBox: `0 0 ${W} ${H}`,
            style: { position: "absolute", top: 0, left: 0 },
            children: [
              ...paths.map((d, i) => ({
                type: "path",
                key: `p${i}`,
                props: { d, fill: "#f0ebdc", stroke: "#e5dfd5" },
              })),
              ...pins.map((p, i) => ({
                type: "circle",
                key: `c${i}`,
                props: {
                  cx: p.x,
                  cy: p.y,
                  r: 7,
                  fill: "#dc855d",
                  stroke: "#fdfaf4",
                  strokeWidth: 2,
                },
              })),
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: 56,
              bottom: 56,
              display: "flex",
              flexDirection: "column",
            },
            children: [
              {
                type: "div",
                props: {
                  style: { fontFamily: "Fraunces", fontSize: 56 },
                  children: "Occupational therapy in Davao City",
                },
              },
              {
                type: "div",
                props: {
                  style: { fontFamily: "Nunito Sans", fontSize: 28 },
                  children: "400+ clinics on this map",
                },
              },
            ],
          },
        },
      ],
    },
  };
}

for (let i = 0; i < 5; i++) {
  const t = performance.now();
  const res = new ImageResponse(scene(), {
    width: W,
    height: H,
    fonts: loaded,
  });
  const buf = await res.arrayBuffer();
  console.log(
    `run ${i + 1}: ${Math.round(performance.now() - t)}ms, ${(buf.byteLength / 1024).toFixed(0)}KB`,
  );
}
```

- [ ] **Step 7: Run the bench — this is the gate**

```bash
node scripts/bench-og-render.mjs
```

Expected: five timings and a PNG size. **Judge against the 2000ms budget from the spec, and read the first run, not the average** — a crawler on a cold serverless instance never gets a warm one.

- If run 1 is comfortably under ~1200ms: proceed.
- If run 1 is between 1200ms and 2000ms: proceed, but raise the simplify percentage in Step 1 first and re-measure.
- **If run 1 exceeds 2000ms: stop and report before writing any card code.** The mitigations, in order, are a coarser outline, dropping the outline stroke, or capping drawn pins harder — all of them change the spec, so they are the user's call, not the implementer's.

Also confirm the PNG is well under Facebook's 8MB ceiling (it will be — expect double-digit KB).

- [ ] **Step 8: Commit**

```bash
pnpm format
git add assets next.config.ts scripts/bench-og-render.mjs
git commit -m "feat(share): add OG card assets and timing bench

Natural Earth 1:50m PH outline (public domain) and static, subset
instances of Fraunces and Nunito Sans. Fraunces upstream is variable
with live axes; satori wants a static instance, so the axes are frozen
at the card's values.

Assets live in assets/, not public/ — they are read from disk, never
served — which means outputFileTracingIncludes has to name them or they
are dropped from the serverless bundle and the route ENOENTs in prod
while working fine in dev.

bench-og-render.mjs measures satori+resvg on the real outline at 400
pins, the cap get_map_clinics enforces. Kept in the repo so the number
can be re-checked when the geometry or the card changes."
```

---

### Task 2: Projection

**Files:**

- Create: `src/modules/share/og/projection.ts`
- Test: `src/modules/share/og/projection.test.ts`

**Interfaces:**

- Consumes: nothing. Pure module, no I/O, no imports outside `node:`.
- Produces:
  - `interface BBox { north: number; south: number; east: number; west: number }`
  - `interface Point { x: number; y: number }`
  - `interface Cluster { x: number; y: number; count: number }`
  - `const PH_BOUNDS: BBox`
  - `const CARD_WIDTH = 1200`, `CARD_HEIGHT = 630`
  - `function padBBox(box: BBox, ratio: number): BBox`
  - `function clampBBox(box: BBox): BBox`
  - `function fitBBox(box: BBox, width: number, height: number): BBox`
  - `function createProjector(box: BBox, width: number, height: number): (lng: number, lat: number) => Point`
  - `function clusterPins(points: Point[], minDistancePx: number): Cluster[]`

- [ ] **Step 1: Write the failing tests**

Create `src/modules/share/og/projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  PH_BOUNDS,
  clampBBox,
  clusterPins,
  createProjector,
  fitBBox,
  padBBox,
} from "./projection";

describe("createProjector", () => {
  it("maps the bbox corners to the viewport corners", () => {
    const project = createProjector(PH_BOUNDS, CARD_WIDTH, CARD_HEIGHT);
    const topLeft = project(PH_BOUNDS.west, PH_BOUNDS.north);
    const bottomRight = project(PH_BOUNDS.east, PH_BOUNDS.south);
    expect(topLeft.x).toBeCloseTo(0, 5);
    expect(topLeft.y).toBeCloseTo(0, 5);
    expect(bottomRight.x).toBeCloseTo(CARD_WIDTH, 5);
    expect(bottomRight.y).toBeCloseTo(CARD_HEIGHT, 5);
  });

  it("puts every corner of the PH bounds inside the viewport", () => {
    const project = createProjector(PH_BOUNDS, CARD_WIDTH, CARD_HEIGHT);
    const corners = [
      [PH_BOUNDS.west, PH_BOUNDS.north],
      [PH_BOUNDS.east, PH_BOUNDS.north],
      [PH_BOUNDS.west, PH_BOUNDS.south],
      [PH_BOUNDS.east, PH_BOUNDS.south],
    ] as const;
    for (const [lng, lat] of corners) {
      const p = project(lng, lat);
      expect(p.x).toBeGreaterThanOrEqual(-0.001);
      expect(p.x).toBeLessThanOrEqual(CARD_WIDTH + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(-0.001);
      expect(p.y).toBeLessThanOrEqual(CARD_HEIGHT + 0.001);
    }
  });

  it("is Mercator, not linear, in latitude", () => {
    // Mercator stretches toward the poles, so the northern half of a
    // symmetric box occupies fewer pixels than the southern half.
    const box = { north: 20, south: 0, east: 10, west: 0 };
    const project = createProjector(box, 100, 100);
    const middle = project(0, 10);
    expect(middle.y).toBeGreaterThan(50);
  });

  it("increases x with longitude and decreases y with latitude", () => {
    const project = createProjector(PH_BOUNDS, CARD_WIDTH, CARD_HEIGHT);
    expect(project(122, 12).x).toBeGreaterThan(project(118, 12).x);
    expect(project(122, 16).y).toBeLessThan(project(122, 8).y);
  });
});

describe("padBBox", () => {
  it("grows the box by the ratio on each axis", () => {
    const padded = padBBox({ north: 11, south: 9, east: 11, west: 9 }, 0.1);
    expect(padded.north).toBeCloseTo(11.2, 5);
    expect(padded.south).toBeCloseTo(8.8, 5);
    expect(padded.east).toBeCloseTo(11.2, 5);
    expect(padded.west).toBeCloseTo(8.8, 5);
  });
});

describe("clampBBox", () => {
  it("expands a degenerate box to the minimum span", () => {
    const clamped = clampBBox({
      north: 14.5,
      south: 14.5,
      east: 121,
      west: 121,
    });
    expect(clamped.north - clamped.south).toBeGreaterThanOrEqual(0.6);
    expect(clamped.east - clamped.west).toBeGreaterThanOrEqual(0.6);
  });

  it("keeps the centre when expanding to the minimum span", () => {
    const clamped = clampBBox({
      north: 14.5,
      south: 14.5,
      east: 121,
      west: 121,
    });
    expect((clamped.north + clamped.south) / 2).toBeCloseTo(14.5, 5);
    expect((clamped.east + clamped.west) / 2).toBeCloseTo(121, 5);
  });

  it("clamps a hostile world-spanning box to the PH bounds", () => {
    const clamped = clampBBox({
      north: 85,
      south: -85,
      east: 179,
      west: -179,
    });
    expect(clamped.north).toBeLessThanOrEqual(PH_BOUNDS.north);
    expect(clamped.south).toBeGreaterThanOrEqual(PH_BOUNDS.south);
    expect(clamped.east).toBeLessThanOrEqual(PH_BOUNDS.east);
    expect(clamped.west).toBeGreaterThanOrEqual(PH_BOUNDS.west);
  });

  it("leaves a sane box alone", () => {
    const box = { north: 15, south: 14, east: 121.5, west: 120.5 };
    expect(clampBBox(box)).toEqual(box);
  });
});

describe("fitBBox", () => {
  it("widens a tall box to the viewport aspect ratio", () => {
    const fitted = fitBBox(
      { north: 15, south: 13, east: 121, west: 120.9 },
      CARD_WIDTH,
      CARD_HEIGHT,
    );
    // Only grows — the requested area must stay visible.
    expect(fitted.east - fitted.west).toBeGreaterThan(0.1);
    expect(fitted.north).toBeCloseTo(15, 5);
    expect(fitted.south).toBeCloseTo(13, 5);
  });

  it("produces a box that projects without distortion", () => {
    const fitted = fitBBox(
      { north: 15, south: 13, east: 121, west: 120.9 },
      CARD_WIDTH,
      CARD_HEIGHT,
    );
    const project = createProjector(fitted, CARD_WIDTH, CARD_HEIGHT);
    // A square in projected space must stay square on the card.
    const a = project(fitted.west, fitted.north);
    const b = project(fitted.east, fitted.north);
    const c = project(fitted.west, fitted.south);
    expect(b.x - a.x).toBeCloseTo(CARD_WIDTH, 5);
    expect(c.y - a.y).toBeCloseTo(CARD_HEIGHT, 5);
  });
});

describe("clusterPins", () => {
  it("collapses pins closer than the threshold and keeps the count", () => {
    const clusters = clusterPins(
      [
        { x: 100, y: 100 },
        { x: 104, y: 103 },
        { x: 400, y: 400 },
      ],
      12,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters.find((c) => c.x < 200)?.count).toBe(2);
    expect(clusters.find((c) => c.x > 200)?.count).toBe(1);
  });

  it("leaves well-separated pins untouched", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ];
    expect(clusterPins(points, 12)).toHaveLength(3);
  });

  it("preserves the total count across clusters", () => {
    const points = Array.from({ length: 50 }, (_, i) => ({
      x: (i % 5) * 2,
      y: Math.floor(i / 5) * 2,
    }));
    const total = clusterPins(points, 12).reduce((n, c) => n + c.count, 0);
    expect(total).toBe(50);
  });

  it("returns an empty array for no pins", () => {
    expect(clusterPins([], 12)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/modules/share/og/projection.test.ts
```

Expected: FAIL — `Failed to resolve import "./projection"`.

- [ ] **Step 3: Implement**

Create `src/modules/share/og/projection.ts`:

```ts
/**
 * Web Mercator projection for the OG card. Matches the MapLibre map the card
 * depicts, so the country silhouette is the one users already know. Land
 * geometry and pins pass through the same transform, which is the whole reason
 * the basemap is inline SVG rather than an opaque image.
 *
 * Pure module — no I/O, no dependencies. d3-geo would be a dependency for
 * fifteen lines of arithmetic.
 */

export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Cluster {
  x: number;
  y: number;
  count: number;
}

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** Philippines bounding box. The maximum span any card may show. */
export const PH_BOUNDS: BBox = {
  north: 21.5,
  south: 4.2,
  east: 127.0,
  west: 116.7,
};

/**
 * Smallest span a card may zoom to. Without it a single result fills the frame
 * with one street and no recognisable landmass — roughly 66km, enough that a
 * coastline is visible.
 */
export const MIN_SPAN_DEG = 0.6;

/** Mercator latitude, normalised so the maths stays in degree-ish units. */
function mercatorY(latDeg: number): number {
  // Clamp before tan() — the poles are infinite and a hostile param can ask.
  const lat = Math.max(-85.05, Math.min(85.05, latDeg));
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

/** Grows a box by `ratio` of its span on each axis, keeping the centre. */
export function padBBox(box: BBox, ratio: number): BBox {
  const padLat = (box.north - box.south) * ratio;
  const padLng = (box.east - box.west) * ratio;
  return {
    north: box.north + padLat,
    south: box.south - padLat,
    east: box.east + padLng,
    west: box.west - padLng,
  };
}

/**
 * Enforces the minimum span, then the maximum. Order matters: a degenerate box
 * must grow before it can be tested against the country bounds, and the final
 * clamp is what stops a hostile param from rendering the globe.
 */
export function clampBBox(box: BBox): BBox {
  let { north, south, east, west } = box;

  const latSpan = north - south;
  if (latSpan < MIN_SPAN_DEG) {
    const centre = (north + south) / 2;
    north = centre + MIN_SPAN_DEG / 2;
    south = centre - MIN_SPAN_DEG / 2;
  }

  const lngSpan = east - west;
  if (lngSpan < MIN_SPAN_DEG) {
    const centre = (east + west) / 2;
    east = centre + MIN_SPAN_DEG / 2;
    west = centre - MIN_SPAN_DEG / 2;
  }

  return {
    north: Math.min(north, PH_BOUNDS.north),
    south: Math.max(south, PH_BOUNDS.south),
    east: Math.min(east, PH_BOUNDS.east),
    west: Math.max(west, PH_BOUNDS.west),
  };
}

/**
 * Expands a box so its projected aspect ratio matches the viewport. Only ever
 * grows — shrinking would crop results the card promised to show.
 */
export function fitBBox(box: BBox, width: number, height: number): BBox {
  const lngSpan = box.east - box.west;
  const ySpan = mercatorY(box.north) - mercatorY(box.south);
  if (lngSpan <= 0 || ySpan <= 0) return box;

  const boxAspect = lngSpan / ySpan;
  const viewAspect = width / height;

  if (boxAspect < viewAspect) {
    // Too tall: widen.
    const target = ySpan * viewAspect;
    const centre = (box.east + box.west) / 2;
    return {
      ...box,
      east: centre + target / 2,
      west: centre - target / 2,
    };
  }

  // Too wide: heighten, in Mercator space so the growth is symmetric on screen.
  const targetY = lngSpan / viewAspect;
  const centreY = (mercatorY(box.north) + mercatorY(box.south)) / 2;
  const toLat = (y: number) =>
    ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
  return {
    ...box,
    north: toLat(centreY + targetY / 2),
    south: toLat(centreY - targetY / 2),
  };
}

/** Returns a lng/lat → pixel function for the given box and viewport. */
export function createProjector(
  box: BBox,
  width: number,
  height: number,
): (lng: number, lat: number) => Point {
  const lngSpan = box.east - box.west || 1e-9;
  const yNorth = mercatorY(box.north);
  const ySpan = yNorth - mercatorY(box.south) || 1e-9;

  return (lng, lat) => ({
    x: ((lng - box.west) / lngSpan) * width,
    y: ((yNorth - mercatorY(lat)) / ySpan) * height,
  });
}

/**
 * Greedy single-pass clustering in pixel space. At PH-wide zoom, Metro Manila
 * is a solid blob of overlapping circles; collapsing them keeps the pins
 * countable. The caption always reports pins *found*, never circles *drawn* —
 * see og/label.ts.
 */
export function clusterPins(points: Point[], minDistancePx: number): Cluster[] {
  const clusters: Cluster[] = [];
  const threshold = minDistancePx * minDistancePx;

  for (const point of points) {
    const near = clusters.find((c) => {
      const dx = c.x - point.x;
      const dy = c.y - point.y;
      return dx * dx + dy * dy < threshold;
    });
    if (near) {
      // Running mean, so the cluster sits at the centroid of its members.
      near.x = (near.x * near.count + point.x) / (near.count + 1);
      near.y = (near.y * near.count + point.y) / (near.count + 1);
      near.count += 1;
    } else {
      clusters.push({ x: point.x, y: point.y, count: 1 });
    }
  }

  return clusters;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/modules/share/og/projection.test.ts
```

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/modules/share/og/projection.ts src/modules/share/og/projection.test.ts
git commit -m "feat(share): Web Mercator projection and pin clustering for OG cards

Matches the MapLibre projection so the card's silhouette is the one
users see in the app. Land and pins share one transform, which is why
the basemap is inline SVG rather than an image.

clampBBox enforces a minimum span (one result must not zoom to a single
street with no landmass) before a maximum of the PH bounds (a hostile
bbox param must not render the globe). fitBBox only ever grows the box —
shrinking would crop results the card promised to show."
```

---

### Task 3: Basemap decoding

**Files:**

- Create: `src/modules/share/og/basemap.ts`
- Test: `src/modules/share/og/basemap.test.ts`

**Interfaces:**

- Consumes: `Point`, `BBox` and `createProjector` from `./projection`; `assets/geo/ph-outline.geojson` from Task 1.
- Produces:
  - `function loadPhOutline(): Promise<number[][][]>` — rings of `[lng, lat]` pairs, read once and cached at module scope
  - `function ringsToPaths(rings: number[][][], project: (lng: number, lat: number) => Point): string[]`

- [ ] **Step 1: Write the failing test**

Create `src/modules/share/og/basemap.test.ts`:

```ts
// @vitest-environment node
// Reads the geometry asset from disk.

import { describe, expect, it } from "vitest";
import { loadPhOutline, ringsToPaths } from "./basemap";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  PH_BOUNDS,
  createProjector,
} from "./projection";

describe("loadPhOutline", () => {
  it("returns rings of coordinate pairs", async () => {
    const rings = await loadPhOutline();
    expect(rings.length).toBeGreaterThan(0);
    for (const ring of rings.slice(0, 5)) {
      expect(ring.length).toBeGreaterThanOrEqual(4);
      for (const point of ring.slice(0, 5)) {
        expect(point).toHaveLength(2);
        expect(typeof point[0]).toBe("number");
        expect(typeof point[1]).toBe("number");
      }
    }
  });

  it("returns coordinates inside the Philippines bounds", async () => {
    const rings = await loadPhOutline();
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        expect(lng).toBeGreaterThan(PH_BOUNDS.west - 1);
        expect(lng).toBeLessThan(PH_BOUNDS.east + 1);
        expect(lat).toBeGreaterThan(PH_BOUNDS.south - 1);
        expect(lat).toBeLessThan(PH_BOUNDS.north + 1);
      }
    }
  });

  it("kept the major islands and dropped the islet tail", async () => {
    const rings = await loadPhOutline();
    // ~7,600 islands upstream; -filter-islands min-area=10km2 leaves dozens.
    expect(rings.length).toBeLessThan(200);
    expect(rings.length).toBeGreaterThan(5);
  });

  it("caches the parse across calls", async () => {
    const first = await loadPhOutline();
    const second = await loadPhOutline();
    expect(second).toBe(first);
  });
});

describe("ringsToPaths", () => {
  const project = createProjector(PH_BOUNDS, CARD_WIDTH, CARD_HEIGHT);

  it("emits one closed path per ring", () => {
    const paths = ringsToPaths(
      [
        [
          [120, 14],
          [121, 14],
          [121, 15],
          [120, 14],
        ],
      ],
      project,
    );
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+)+Z$/);
  });

  it("drops rings with too few points to form an area", () => {
    expect(
      ringsToPaths(
        [
          [
            [120, 14],
            [121, 15],
          ],
        ],
        project,
      ),
    ).toEqual([]);
  });

  it("produces well-formed path data for the real outline", async () => {
    const paths = ringsToPaths(await loadPhOutline(), project);
    expect(paths.length).toBeGreaterThan(0);
    for (const d of paths) {
      expect(d.startsWith("M")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
      expect(d).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/modules/share/og/basemap.test.ts
```

Expected: FAIL — `Failed to resolve import "./basemap"`.

- [ ] **Step 3: Implement**

Create `src/modules/share/og/basemap.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Point } from "./projection";

/**
 * Philippines outline for the OG card. Natural Earth 1:50m admin-0, public
 * domain, simplified at build time — see assets/README.md.
 *
 * Plain GeoJSON rather than TopoJSON: the shared-arc win applies to adjacent
 * polygons, which a single dissolved outline does not have, and TopoJSON would
 * cost a topojson-client dependency plus a decode on every cold start.
 * Revisit only if the asset ever passes ~50KB gzip.
 */

interface GeoJsonFeatureCollection {
  features: Array<{
    geometry:
      | { type: "Polygon"; coordinates: number[][][] }
      | { type: "MultiPolygon"; coordinates: number[][][][] };
  }>;
}

/**
 * Read once per process. This path is dynamic, so the asset only reaches the
 * serverless bundle via outputFileTracingIncludes in next.config.ts.
 */
let cached: Promise<number[][][]> | undefined;

export function loadPhOutline(): Promise<number[][][]> {
  cached ??= (async () => {
    const raw = await readFile(
      join(process.cwd(), "assets/geo/ph-outline.geojson"),
      "utf8",
    );
    const geo = JSON.parse(raw) as GeoJsonFeatureCollection;

    const rings: number[][][] = [];
    for (const feature of geo.features) {
      const polygons =
        feature.geometry.type === "MultiPolygon"
          ? feature.geometry.coordinates
          : [feature.geometry.coordinates];
      for (const polygon of polygons) {
        // Only the outer ring of each polygon: the interior rings are lakes,
        // and at this scale on a card behind a text plate they are noise.
        const outer = polygon[0];
        if (outer) rings.push(outer);
      }
    }
    return rings;
  })();
  return cached;
}

/** Test seam — the module-scope cache would otherwise leak between tests. */
export function resetOutlineCacheForTesting(): void {
  cached = undefined;
}

/** Projects rings to SVG path `d` strings. */
export function ringsToPaths(
  rings: number[][][],
  project: (lng: number, lat: number) => Point,
): string[] {
  const paths: string[] = [];

  for (const ring of rings) {
    // Fewer than three points cannot enclose an area.
    if (ring.length < 3) continue;

    let d = "";
    let valid = true;
    for (let i = 0; i < ring.length; i++) {
      const pair = ring[i];
      if (!pair || pair.length < 2) {
        valid = false;
        break;
      }
      const { x, y } = project(pair[0]!, pair[1]!);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        valid = false;
        break;
      }
      // One decimal is sub-pixel at 1200px wide and keeps the path short —
      // path length is what resvg's rasteriser pays for.
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    if (valid && d) paths.push(`${d}Z`);
  }

  return paths;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/modules/share/og/basemap.test.ts
```

Expected: PASS, 7 tests. If "kept the major islands" fails with too many rings, the `-filter-islands` step in Task 1 did not run before `-simplify` — regenerate the asset.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/modules/share/og/basemap.ts src/modules/share/og/basemap.test.ts
git commit -m "feat(share): decode PH outline into SVG path data

Reads the Natural Earth asset once per process and projects rings to
path 'd' strings at one decimal — sub-pixel at 1200px wide, and path
length is what resvg's rasteriser pays for.

Interior rings are dropped: they are lakes, invisible at card scale
behind the caption plate."
```

---

### Task 4: Labels

**Files:**

- Create: `src/modules/share/og/label.ts`
- Test: `src/modules/share/og/label.test.ts`

**Interfaces:**

- Consumes: `SearchParams` from `@/modules/search/schemas`.
- Produces:
  - `interface CardLabels { headline: string; count: string; description: string; alt: string }`
  - `interface LabelInput { params: SearchParams; pinCount: number; atCap: boolean; serviceNames: Record<string, string> }`
  - `function buildLabels(input: LabelInput): CardLabels`
  - `function buildFallbackLabels(params: SearchParams, serviceNames: Record<string, string>): CardLabels`

The module is pure on purpose: `serviceNames` is a plain slug→name map that the route builds from the existing `getServices()`. Keeping the DB call out means the label table is testable without a database.

- [ ] **Step 1: Write the failing test**

Create `src/modules/share/og/label.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { searchParamsSchema } from "@/modules/search/schemas";
import { buildFallbackLabels, buildLabels } from "./label";

const SERVICE_NAMES = {
  "occupational-therapy": "Occupational therapy",
  "speech-therapy": "Speech therapy",
  "early-intervention": "Early intervention",
};

const params = (raw: Record<string, string>) => searchParamsSchema.parse(raw);

describe("buildLabels headlines", () => {
  it("names one service and the place", () => {
    const labels = buildLabels({
      params: params({ services: "occupational-therapy", loc: "Davao City" }),
      pinCount: 12,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Occupational therapy in Davao City");
  });

  it("summarises multiple services as '+ N more'", () => {
    const labels = buildLabels({
      params: params({
        services: "speech-therapy,occupational-therapy",
        loc: "Cebu City",
      }),
      pinCount: 8,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Speech therapy + 1 more in Cebu City");
  });

  it("quotes a free-text query", () => {
    const labels = buildLabels({
      params: params({ q: "sensory gym" }),
      pinCount: 4,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe('"sensory gym" — therapy clinics');
  });

  it("describes a verified-only filter", () => {
    const labels = buildLabels({
      params: params({ verified: "1" }),
      pinCount: 30,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Verified clinics in the Philippines");
  });

  it("falls back to the country-wide headline with no filters", () => {
    const labels = buildLabels({
      params: params({}),
      pinCount: 120,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Therapy clinics across the Philippines");
  });

  it("uses the slug when a service name is unknown", () => {
    const labels = buildLabels({
      params: params({ services: "hippotherapy", loc: "Baguio" }),
      pinCount: 2,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Hippotherapy in Baguio");
  });
});

describe("buildLabels counts", () => {
  it("counts the pins it drew", () => {
    const labels = buildLabels({
      params: params({}),
      pinCount: 12,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.count).toBe("12 clinics on this map");
  });

  it("singularises one clinic", () => {
    const labels = buildLabels({
      params: params({}),
      pinCount: 1,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.count).toBe("1 clinic on this map");
  });

  it("reports the cap as a floor, not a total", () => {
    const labels = buildLabels({
      params: params({}),
      pinCount: 400,
      atCap: true,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.count).toBe("400+ clinics on this map");
  });
});

describe("buildLabels safety", () => {
  it("strips XML-significant characters from loc", () => {
    const labels = buildLabels({
      params: params({ loc: "</text><script>alert(1)</script>" }),
      pinCount: 3,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).not.toContain("<");
    expect(labels.headline).not.toContain(">");
    expect(labels.alt).not.toContain("<");
  });

  it("strips XML-significant characters from q", () => {
    const labels = buildLabels({
      params: params({ q: "a & b <c>" }),
      pinCount: 3,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).not.toContain("<");
    expect(labels.headline).not.toContain("&");
  });

  it("clamps a long headline so it cannot overflow the card", () => {
    const labels = buildLabels({
      params: params({ loc: "A".repeat(120) }),
      pinCount: 3,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline.length).toBeLessThanOrEqual(80);
    expect(labels.headline.endsWith("…")).toBe(true);
  });

  it("collapses newlines and tabs into single spaces", () => {
    const labels = buildLabels({
      params: params({ loc: "Cebu\n\tCity" }),
      pinCount: 3,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.headline).toBe("Therapy clinics in Cebu City");
  });
});

describe("buildLabels alt and description", () => {
  it("describes the image for screen readers", () => {
    const labels = buildLabels({
      params: params({ services: "speech-therapy", loc: "Cebu City" }),
      pinCount: 7,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.alt).toContain("map of the Philippines");
    expect(labels.alt).toContain("7");
    expect(labels.alt).toContain("Cebu City");
  });

  it("writes a description that names the filter", () => {
    const labels = buildLabels({
      params: params({ services: "speech-therapy", loc: "Cebu City" }),
      pinCount: 7,
      atCap: false,
      serviceNames: SERVICE_NAMES,
    });
    expect(labels.description).toContain("Speech therapy");
    expect(labels.description).toContain("Cebu City");
  });
});

describe("buildFallbackLabels", () => {
  it("frames zero results without claiming a count", () => {
    const labels = buildFallbackLabels(
      params({ services: "speech-therapy", loc: "Batanes" }),
      SERVICE_NAMES,
    );
    expect(labels.headline).toBe("Speech therapy in Batanes");
    expect(labels.count).toBe("No clinics match yet");
    expect(labels.count).not.toMatch(/\d/);
  });

  it("still produces alt text", () => {
    const labels = buildFallbackLabels(params({}), SERVICE_NAMES);
    expect(labels.alt.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/modules/share/og/label.test.ts
```

Expected: FAIL — `Failed to resolve import "./label"`.

- [ ] **Step 3: Implement**

Create `src/modules/share/og/label.ts`:

```ts
import type { SearchParams } from "@/modules/search/schemas";

/**
 * Turns search params into the words on the card. Pure: `serviceNames` is a
 * slug→name map the caller builds from getServices(), so the whole label table
 * is testable without a database.
 *
 * Everything here ends up inside SVG text, so every user-supplied string is
 * stripped of XML-significant characters and clamped in length.
 */

export interface CardLabels {
  /** Big line. Also becomes og:title. */
  headline: string;
  /** Small line under the headline. Describes the image, never the database. */
  count: string;
  /** og:description. */
  description: string;
  /** og:image:alt. */
  alt: string;
}

export interface LabelInput {
  params: SearchParams;
  pinCount: number;
  /** True when get_map_clinics returned its 400-row cap. */
  atCap: boolean;
  serviceNames: Record<string, string>;
}

const MAX_HEADLINE = 80;

/**
 * `loc` and `q` are free text from the URL. They go into SVG, so drop the
 * characters that could close a tag, collapse whitespace, and clamp.
 */
function clean(value: string, maxLength: number): string {
  const stripped = value
    .replace(/[<>&"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > maxLength
    ? `${stripped.slice(0, maxLength - 1).trimEnd()}…`
    : stripped;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Human name for a service slug, falling back to a de-slugged form. */
function serviceLabel(slug: string, names: Record<string, string>): string {
  const known = names[slug];
  if (known) return known;
  return capitalise(slug.replace(/-/g, " "));
}

/** "Speech therapy", or "Speech therapy + 2 more". */
function servicePhrase(
  services: string[],
  names: Record<string, string>,
): string {
  const first = serviceLabel(services[0]!, names);
  const rest = services.length - 1;
  return rest > 0 ? `${first} + ${rest} more` : first;
}

function buildHeadline(
  params: SearchParams,
  serviceNames: Record<string, string>,
): string {
  const place = params.loc ? clean(params.loc, 60) : "";
  const services = params.services ?? [];

  let headline: string;
  if (services.length > 0) {
    headline = servicePhrase(services, serviceNames);
    headline = place
      ? `${headline} in ${place}`
      : `${headline} in the Philippines`;
  } else if (params.q) {
    const query = clean(params.q, 40);
    headline = place
      ? `"${query}" in ${place}`
      : `"${query}" — therapy clinics`;
  } else if (place) {
    headline = `Therapy clinics in ${place}`;
  } else if (params.verified) {
    headline = "Verified clinics in the Philippines";
  } else {
    headline = "Therapy clinics across the Philippines";
  }

  return clean(headline, MAX_HEADLINE);
}

/**
 * The card counts the pins it drew, not a database total — there is no total
 * anywhere (ClinicSearchResult is {clinics, nextCursor}) and this statement
 * describes the image, so it cannot be wrong. At the RPC's 400-row cap it
 * reads as a floor.
 */
function buildCount(pinCount: number, atCap: boolean): string {
  if (atCap) return `${pinCount}+ clinics on this map`;
  return pinCount === 1
    ? "1 clinic on this map"
    : `${pinCount} clinics on this map`;
}

export function buildLabels(input: LabelInput): CardLabels {
  const { params, pinCount, atCap, serviceNames } = input;
  const headline = buildHeadline(params, serviceNames);
  const count = buildCount(pinCount, atCap);

  return {
    headline,
    count,
    description: `${headline}. ${count} on ThriveMap — compare clinics, see what they offer, and reach out.`,
    alt: `A map of the Philippines with ${pinCount} clinic${
      pinCount === 1 ? "" : "s"
    } marked. ${headline}.`,
  };
}

export function buildFallbackLabels(
  params: SearchParams,
  serviceNames: Record<string, string>,
): CardLabels {
  const headline = buildHeadline(params, serviceNames);
  return {
    headline,
    count: "No clinics match yet",
    description: `${headline}. Browse therapy and developmental clinics across the Philippines on ThriveMap.`,
    alt: `ThriveMap — ${headline}.`,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/modules/share/og/label.test.ts
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/modules/share/og/label.ts src/modules/share/og/label.test.ts
git commit -m "feat(share): build OG card headlines, counts, and alt text

The count describes the image, not the database: there is no total
anywhere (ClinicSearchResult is {clinics, nextCursor}), so the card
counts the pins it drew and reports the RPC's 400-row cap as a floor.
That statement cannot be wrong.

loc and q are free text from the URL heading into SVG text nodes, so
both are stripped of XML-significant characters, whitespace-collapsed,
and clamped."
```

---

### Task 5: Bbox derivation ladder

**Files:**

- Create: `src/modules/share/og/bbox.ts`
- Test: `src/modules/share/og/bbox.test.ts`

**Interfaces:**

- Consumes: `BBox`, `PH_BOUNDS`, `padBBox`, `clampBBox` from `./projection`; `getMapClinics` and `MapClinicRow` from `@/modules/clinics/queries`; `SearchParams` from `@/modules/search/schemas`.
- Produces:
  - `interface CardData { bbox: BBox; pins: MapClinicRow[]; atCap: boolean }`
  - `const MAP_CLINIC_CAP = 400`
  - `function resolveCardData(params: SearchParams): Promise<CardData | null>` — `null` means "render the fallback"

- [ ] **Step 1: Write the failing test**

Create `src/modules/share/og/bbox.test.ts`:

```ts
// @vitest-environment node
// queries.ts is "server-only"; the alias stub only behaves under node.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchParamsSchema } from "@/modules/search/schemas";
import { PH_BOUNDS } from "./projection";

const getMapClinics = vi.fn();
vi.mock("@/modules/clinics/queries", () => ({
  getMapClinics: (...args: unknown[]) => getMapClinics(...args),
}));

const { MAP_CLINIC_CAP, resolveCardData } = await import("./bbox");

const params = (raw: Record<string, string>) => searchParamsSchema.parse(raw);

const pin = (latitude: number, longitude: number, i = 0) => ({
  clinic_id: `id-${i}`,
  latitude,
  longitude,
  name: `Clinic ${i}`,
  slug: `clinic-${i}`,
  status: "published" as const,
});

beforeEach(() => {
  getMapClinics.mockReset();
});

describe("rung 1 — explicit bounds", () => {
  it("uses north/south/east/west directly", async () => {
    getMapClinics.mockResolvedValue([pin(14.5, 121)]);
    const result = await resolveCardData(
      params({ north: "15", south: "14", east: "121.5", west: "120.5" }),
    );
    expect(getMapClinics).toHaveBeenCalledTimes(1);
    const call = getMapClinics.mock.calls[0]![0];
    expect(call.north).toBeCloseTo(15, 5);
    expect(call.south).toBeCloseTo(14, 5);
    expect(result?.bbox.north).toBeCloseTo(15, 5);
  });

  it("passes service and verified filters through", async () => {
    getMapClinics.mockResolvedValue([pin(14.5, 121)]);
    await resolveCardData(
      params({
        north: "15",
        south: "14",
        east: "121.5",
        west: "120.5",
        services: "speech-therapy,occupational-therapy",
        verified: "1",
      }),
    );
    const call = getMapClinics.mock.calls[0]![0];
    expect(call.services).toEqual(["speech-therapy", "occupational-therapy"]);
    expect(call.verifiedOnly).toBe(true);
  });
});

describe("rung 2 — centre and radius", () => {
  it("derives a bbox from lat/lng/radius", async () => {
    getMapClinics.mockResolvedValue([pin(14.6, 121)]);
    const result = await resolveCardData(
      params({ lat: "14.5995", lng: "120.9842", radius: "10" }),
    );
    expect(getMapClinics).toHaveBeenCalledTimes(1);
    const box = result!.bbox;
    expect(box.north).toBeGreaterThan(14.5995);
    expect(box.south).toBeLessThan(14.5995);
    expect(box.east).toBeGreaterThan(120.9842);
    expect(box.west).toBeLessThan(120.9842);
    // 10km is well under a degree; padding and the min-span clamp widen it,
    // but it must not have become a country-wide box.
    expect(box.north - box.south).toBeLessThan(2);
  });

  it("prefers explicit bounds over lat/lng when both are present", async () => {
    getMapClinics.mockResolvedValue([pin(14.5, 121)]);
    await resolveCardData(
      params({
        north: "15",
        south: "14",
        east: "121.5",
        west: "120.5",
        lat: "7",
        lng: "125",
      }),
    );
    const call = getMapClinics.mock.calls[0]![0];
    expect(call.north).toBeCloseTo(15, 5);
  });
});

describe("rung 3 — country-wide, then fit to pins", () => {
  it("queries PH-wide and refits to the pins", async () => {
    getMapClinics
      .mockResolvedValueOnce([pin(10.3, 123.9, 1), pin(10.4, 124.0, 2)])
      .mockResolvedValueOnce([pin(10.3, 123.9, 1), pin(10.4, 124.0, 2)]);
    const result = await resolveCardData(params({}));
    expect(getMapClinics).toHaveBeenCalledTimes(2);
    expect(getMapClinics.mock.calls[0]![0].north).toBeCloseTo(
      PH_BOUNDS.north,
      5,
    );
    // Refitted around the two pins, not still country-wide.
    expect(result!.bbox.north).toBeLessThan(PH_BOUNDS.north);
    expect(result!.bbox.south).toBeGreaterThan(PH_BOUNDS.south);
  });

  it("returns the refit pins, not the country-wide set", async () => {
    getMapClinics
      .mockResolvedValueOnce([pin(10.3, 123.9, 1), pin(18.0, 120.6, 2)])
      .mockResolvedValueOnce([pin(10.3, 123.9, 1)]);
    const result = await resolveCardData(params({}));
    expect(result!.pins).toHaveLength(1);
  });

  it("keeps the country-wide pins when the refit query returns nothing", async () => {
    getMapClinics
      .mockResolvedValueOnce([pin(10.3, 123.9, 1)])
      .mockResolvedValueOnce([]);
    const result = await resolveCardData(params({}));
    expect(result!.pins).toHaveLength(1);
  });
});

describe("rung 4 — no pins", () => {
  it("returns null when nothing matches", async () => {
    getMapClinics.mockResolvedValue([]);
    expect(await resolveCardData(params({}))).toBeNull();
  });

  it("returns null when nothing matches inside explicit bounds", async () => {
    getMapClinics.mockResolvedValue([]);
    const result = await resolveCardData(
      params({ north: "15", south: "14", east: "121.5", west: "120.5" }),
    );
    expect(result).toBeNull();
  });
});

describe("clamping and the cap", () => {
  it("clamps a hostile world-spanning bbox to the PH bounds", async () => {
    getMapClinics.mockResolvedValue([pin(14.5, 121)]);
    await resolveCardData(
      params({ north: "89", south: "-89", east: "179", west: "-179" }),
    );
    const call = getMapClinics.mock.calls[0]![0];
    expect(call.north).toBeLessThanOrEqual(PH_BOUNDS.north);
    expect(call.south).toBeGreaterThanOrEqual(PH_BOUNDS.south);
  });

  it("flags atCap when the RPC returns its row cap", async () => {
    const pins = Array.from({ length: MAP_CLINIC_CAP }, (_, i) =>
      pin(10 + (i % 10) * 0.1, 122 + (i % 10) * 0.1, i),
    );
    getMapClinics.mockResolvedValue(pins);
    const result = await resolveCardData(
      params({ north: "15", south: "14", east: "121.5", west: "120.5" }),
    );
    expect(result!.atCap).toBe(true);
  });

  it("does not flag atCap below the cap", async () => {
    getMapClinics.mockResolvedValue([pin(14.5, 121)]);
    const result = await resolveCardData(
      params({ north: "15", south: "14", east: "121.5", west: "120.5" }),
    );
    expect(result!.atCap).toBe(false);
  });
});

describe("failure", () => {
  it("propagates a query failure so the route can fall back", async () => {
    getMapClinics.mockRejectedValue(new Error("boom"));
    await expect(resolveCardData(params({}))).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/modules/share/og/bbox.test.ts
```

Expected: FAIL — `Failed to resolve import "./bbox"`.

- [ ] **Step 3: Implement**

Create `src/modules/share/og/bbox.ts`:

```ts
import { getMapClinics, type MapClinicRow } from "@/modules/clinics/queries";
import type { SearchParams } from "@/modules/search/schemas";
import { type BBox, PH_BOUNDS, clampBBox, padBBox } from "./projection";

/**
 * Resolves the params of a /clinics URL into the bbox and pins the card draws.
 *
 * get_map_clinics caps at least(coalesce(p_limit, 400), 1000)
 * (supabase/migrations/20260801000005_search.sql:301). getMapClinics passes no
 * limit, so 400 is the ceiling and a full page means "at least this many".
 */
export const MAP_CLINIC_CAP = 400;

/** Fraction of the span added around the pins so nothing sits on the edge. */
const PAD_RATIO = 0.12;

export interface CardData {
  bbox: BBox;
  pins: MapClinicRow[];
  atCap: boolean;
}

/** Degrees of latitude per kilometre. Close enough for a preview image. */
const KM_PER_DEG_LAT = 110.574;

function bboxFromCircle(lat: number, lng: number, radiusKm: number): BBox {
  const latDelta = radiusKm / KM_PER_DEG_LAT;
  // Longitude degrees shrink toward the poles; guard the cos() near them.
  const lngDelta =
    radiusKm / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    north: lat + latDelta,
    south: lat - latDelta,
    east: lng + lngDelta,
    west: lng - lngDelta,
  };
}

function bboxFromPins(pins: MapClinicRow[]): BBox | null {
  if (pins.length === 0) return null;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const p of pins) {
    north = Math.max(north, p.latitude);
    south = Math.min(south, p.latitude);
    east = Math.max(east, p.longitude);
    west = Math.min(west, p.longitude);
  }
  return { north, south, east, west };
}

function hasExplicitBounds(
  params: SearchParams,
): params is SearchParams &
  Record<"north" | "south" | "east" | "west", number> {
  return (
    params.north != null &&
    params.south != null &&
    params.east != null &&
    params.west != null
  );
}

function filtersFrom(params: SearchParams) {
  return {
    services: params.services?.length ? params.services : undefined,
    verifiedOnly: params.verified ?? false,
  };
}

/**
 * The derivation ladder. First match wins:
 *
 *  1. north/south/east/west present → use directly (a link shared after panning)
 *  2. lat/lng + radius → the bbox of that circle
 *  3. neither → query PH-wide, then refit to the pins that came back
 *  4. no pins → null, and the caller renders the fallback card
 *
 * Throws if getMapClinics throws — the route catches and falls back.
 */
export async function resolveCardData(
  params: SearchParams,
): Promise<CardData | null> {
  const filters = filtersFrom(params);

  let bbox: BBox;
  let refit = false;

  if (hasExplicitBounds(params)) {
    bbox = clampBBox({
      north: params.north,
      south: params.south,
      east: params.east,
      west: params.west,
    });
  } else if (params.lat != null && params.lng != null) {
    bbox = clampBBox(
      padBBox(bboxFromCircle(params.lat, params.lng, params.radius), PAD_RATIO),
    );
  } else {
    bbox = PH_BOUNDS;
    refit = true;
  }

  const pins = await getMapClinics({ ...bbox, ...filters });
  if (pins.length === 0) return null;

  if (!refit) {
    return { bbox, pins, atCap: pins.length >= MAP_CLINIC_CAP };
  }

  // Country-wide: tighten onto where the results actually are.
  const fitted = bboxFromPins(pins);
  if (!fitted) return null;
  const tightened = clampBBox(padBBox(fitted, PAD_RATIO));

  // Re-query so the pin set matches the frame — the first query's pins may
  // include outliers the tightened box excludes, and drawing a pin outside the
  // frame is worse than one extra cached call.
  const refitted = await getMapClinics({ ...tightened, ...filters });
  const finalPins = refitted.length > 0 ? refitted : pins;

  return {
    bbox: tightened,
    pins: finalPins,
    atCap: finalPins.length >= MAP_CLINIC_CAP,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/modules/share/og/bbox.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/modules/share/og/bbox.ts src/modules/share/og/bbox.test.ts
git commit -m "feat(share): derive OG card bbox and pins from search params

Four-rung ladder: explicit bounds, then lat/lng+radius, then PH-wide
refit onto the results, then null for the fallback card.

The country-wide rung re-queries after tightening. The first query's
pins can include outliers the tightened frame excludes, and a pin drawn
outside the frame is worse than one more call already cached at 60s.

atCap tracks the RPC's 400-row ceiling so the caption can say '400+'
instead of implying that is the total."
```

---

### Task 6: Palette, fonts, and the card

The first task that renders. It carries the satori smoke test, which is the only thing that catches a silently-ignored CSS property.

**Files:**

- Create: `src/modules/share/og/palette.ts`
- Create: `src/modules/share/og/fonts.ts`
- Create: `src/modules/share/og/card.tsx`
- Create: `src/modules/share/og/fallback.tsx`
- Test: `src/modules/share/og/card.test.tsx`

**Interfaces:**

- Consumes: `Cluster`, `CARD_WIDTH`, `CARD_HEIGHT` from `./projection`; `CardLabels` from `./label`.
- Produces:
  - `const PALETTE: Record<string, string>` (hex strings)
  - `function loadFonts(): Promise<Array<{ name: string; data: Buffer; weight: number; style: "normal" }>>`
  - `function SearchCard(props: { paths: string[]; clusters: Cluster[]; labels: CardLabels }): ReactElement`
  - `function FallbackCard(props: { labels: CardLabels }): ReactElement`

- [ ] **Step 1: Write the palette**

No test — asserting hex constants match hex constants is circular. The oklch annotations are the review surface. Create `src/modules/share/og/palette.ts`:

```ts
/**
 * Warm Horizon, hand-converted to sRGB hex for satori.
 *
 * Satori's vendored parser (parse-css-color 0.2.1) accepts hex, rgb(), hsl(),
 * and named colors — and nothing else. No oklch(), oklab(), lab(), lch(),
 * hwb(), or color-mix(). The app's palette is entirely oklch
 * (src/app/globals.css:56+), so every token used on the card is converted here
 * and annotated with its source. If a token changes in globals.css, the drift
 * is visible in review because the oklch value is written down next to it.
 */
export const PALETTE = {
  /** oklch(0.985 0.008 84) — --background, warm cream */
  cream: "#fdfaf4",
  /** oklch(1 0.004 84) — --card */
  card: "#fffffc",
  /** oklch(0.28 0.02 55) — --foreground, warm near-black */
  ink: "#312620",
  /** oklch(0.44 0.065 195) — --primary, deep teal */
  teal: "#1b5e5e",
  /** oklch(0.94 0.02 90) — --secondary, land fill */
  land: "#f0ebdc",
  /** oklch(0.905 0.015 82) — --border, coastline */
  coast: "#e5dfd5",
  /** oklch(0.5 0.02 60) — --muted-foreground */
  muted: "#6c6158",
  /** oklch(0.7 0.12 45) — --chart-2, coral pin fill */
  coral: "#dc855d",
  /** oklch(0.5 0.1 160) — --verified */
  verified: "#1f744f",
} as const;

/** Water. Not a theme token — the app's map uses OpenFreeMap tiles for this. */
export const WATER = "#eef4f4";
```

- [ ] **Step 2: Write the font loader**

Create `src/modules/share/og/fonts.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Static, subset instances of the app's two families. Fraunces upstream is a
 * variable font with live axes (src/app/layout.tsx:8-12); satori wants a
 * static instance, so the axes are frozen at build time — see assets/README.md.
 *
 * These paths are dynamic, so the files only reach the serverless bundle via
 * outputFileTracingIncludes in next.config.ts.
 */

export interface LoadedFont {
  name: string;
  data: Buffer;
  weight: number;
  style: "normal";
}

const FILES = [
  { name: "Fraunces", file: "fraunces-display.ttf", weight: 600 },
  { name: "Nunito Sans", file: "nunito-sans-regular.ttf", weight: 400 },
  { name: "Nunito Sans", file: "nunito-sans-semibold.ttf", weight: 600 },
] as const;

let cached: Promise<LoadedFont[]> | undefined;

/** Read once per process — three disk reads per request would be waste. */
export function loadFonts(): Promise<LoadedFont[]> {
  cached ??= Promise.all(
    FILES.map(async (font) => ({
      name: font.name,
      weight: font.weight,
      style: "normal" as const,
      data: await readFile(join(process.cwd(), "assets/fonts", font.file)),
    })),
  );
  return cached;
}

/** Test seam. */
export function resetFontCacheForTesting(): void {
  cached = undefined;
}
```

- [ ] **Step 3: Write the cards**

> **Superseded 2026-08-18:** the aspect fit below could land a pin under the
> caption plate or the wordmark — on the PH-wide card, every Mindanao pin. A
> new pure module, `og/layout.ts`, now owns the plate/wordmark rects
> (`PLATE`, `WORDMARK`) and `card.tsx` imports its geometry from there instead
> of hardcoding it inline as shown below. See de806a2 and Task 7's superseded
> note for the routing side of the fix.

Create `src/modules/share/og/card.tsx`:

```tsx
import type { ReactElement } from "react";
import type { CardLabels } from "./label";
import { PALETTE, WATER } from "./palette";
import { CARD_HEIGHT, CARD_WIDTH, type Cluster } from "./projection";

/**
 * The full card: three absolutely-positioned layers — land, pins, caption.
 *
 * Satori is flexbox-only (no grid) and every element that contains more than
 * one child needs an explicit `display: flex`. The basemap is inline <svg>
 * rather than a data-URI <img> so the pins share one coordinate space with the
 * land paths.
 */

/** Pins grow with their cluster, but only so far. */
function pinRadius(count: number): number {
  if (count === 1) return 7;
  return Math.min(18, 7 + Math.sqrt(count) * 2.2);
}

export function SearchCard({
  paths,
  clusters,
  labels,
}: {
  paths: string[];
  clusters: Cluster[];
  labels: CardLabels;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: WATER,
        fontFamily: "Nunito Sans",
      }}
    >
      <svg
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {paths.map((d, i) => (
          <path
            key={`land-${i}`}
            d={d}
            fill={PALETTE.land}
            stroke={PALETTE.coast}
            strokeWidth={1}
          />
        ))}
        {clusters.map((cluster, i) => (
          <circle
            key={`pin-${i}`}
            cx={cluster.x}
            cy={cluster.y}
            r={pinRadius(cluster.count)}
            fill={PALETTE.coral}
            stroke={PALETTE.cream}
            strokeWidth={2.5}
          />
        ))}
      </svg>

      {/* Caption plate. Sits over the map, so it needs its own ground. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 56,
          bottom: 56,
          maxWidth: 880,
          padding: "32px 40px",
          borderRadius: 24,
          backgroundColor: PALETTE.cream,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Fraunces",
            fontWeight: 600,
            fontSize: 54,
            lineHeight: 1.1,
            color: PALETTE.ink,
          }}
        >
          {labels.headline}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 28,
            fontWeight: 400,
            color: PALETTE.muted,
          }}
        >
          {labels.count}
        </div>
      </div>

      {/* Wordmark, opposite corner from the plate. */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 48,
          left: 56,
          padding: "10px 22px",
          borderRadius: 999,
          backgroundColor: PALETTE.teal,
          color: PALETTE.cream,
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: 0.5,
        }}
      >
        ThriveMap
      </div>
    </div>
  );
}
```

Create `src/modules/share/og/fallback.tsx`:

```tsx
import type { ReactElement } from "react";
import type { CardLabels } from "./label";
import { PALETTE } from "./palette";
import { CARD_HEIGHT, CARD_WIDTH } from "./projection";

/**
 * The fallback is a designed state, not an error: geometry missing, fonts
 * unreadable, the query down, zero results, or the 2s budget blown all land
 * here. It must not depend on anything that can fail — no disk reads, no
 * projection, no data — so it is an abstract pin field over flat colour.
 *
 * If the fonts failed to load, satori falls back to its bundled default and
 * this still renders.
 */

/** Deterministic scatter. Math.random() would make the output uncacheable. */
const PINS = Array.from({ length: 26 }, (_, i) => ({
  x: 120 + ((i * 173) % 980),
  y: 90 + ((i * 271) % 430),
  r: 5 + ((i * 7) % 5),
}));

export function FallbackCard({ labels }: { labels: CardLabels }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: PALETTE.cream,
        fontFamily: "Nunito Sans",
      }}
    >
      <svg
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {PINS.map((pin, i) => (
          <circle
            key={`pin-${i}`}
            cx={pin.x}
            cy={pin.y}
            r={pin.r}
            fill={PALETTE.coral}
            opacity={0.28}
          />
        ))}
      </svg>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 56,
          bottom: 56,
          maxWidth: 880,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Fraunces",
            fontWeight: 600,
            fontSize: 54,
            lineHeight: 1.1,
            color: PALETTE.ink,
          }}
        >
          {labels.headline}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 28,
            color: PALETTE.muted,
          }}
        >
          {labels.count}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 48,
          left: 56,
          padding: "10px 22px",
          borderRadius: 999,
          backgroundColor: PALETTE.teal,
          color: PALETTE.cream,
          fontSize: 24,
          fontWeight: 600,
        }}
      >
        ThriveMap
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the satori render test**

Satori ignores unsupported CSS **silently**, so a property that renders nothing looks exactly like one that works. This test is the only automated thing standing between that and production. Create `src/modules/share/og/card.test.tsx`:

```tsx
// @vitest-environment node
// Reads fonts from disk and runs satori + resvg.

import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { ImageResponse } from "next/og";
import { SearchCard } from "./card";
import { FallbackCard } from "./fallback";
import { loadFonts } from "./fonts";
import type { CardLabels } from "./label";
import { CARD_HEIGHT, CARD_WIDTH } from "./projection";

const LABELS: CardLabels = {
  headline: "Occupational therapy in Davao City",
  count: "12 clinics on this map",
  description: "…",
  alt: "…",
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function render(element: ReactElement, fonts?: unknown[]) {
  const response = new ImageResponse(element, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    ...(fonts ? { fonts } : {}),
  });
  return Buffer.from(await response.arrayBuffer());
}

describe("loadFonts", () => {
  it("loads three static instances", async () => {
    const fonts = await loadFonts();
    expect(fonts).toHaveLength(3);
    for (const font of fonts) {
      expect(font.data.byteLength).toBeGreaterThan(1000);
    }
  });

  it("caches across calls", async () => {
    expect(await loadFonts()).toBe(await loadFonts());
  });
});

describe("SearchCard", () => {
  it("renders a PNG", async () => {
    const png = await render(
      <SearchCard
        paths={["M100,100L400,100L400,300L100,300Z"]}
        clusters={[
          { x: 200, y: 150, count: 1 },
          { x: 320, y: 240, count: 9 },
        ]}
        labels={LABELS}
      />,
      await loadFonts(),
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
    expect(png.byteLength).toBeGreaterThan(5_000);
    // Facebook's ceiling is 8MB; nowhere near it, but assert the direction.
    expect(png.byteLength).toBeLessThan(2_000_000);
  });

  it("renders with no pins at all", async () => {
    const png = await render(
      <SearchCard paths={["M0,0L10,0L10,10Z"]} clusters={[]} labels={LABELS} />,
      await loadFonts(),
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it("renders a long headline without throwing", async () => {
    const png = await render(
      <SearchCard
        paths={[]}
        clusters={[]}
        labels={{ ...LABELS, headline: "A".repeat(80) }}
      />,
      await loadFonts(),
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it("renders 400 clusters inside the timing budget", async () => {
    const clusters = Array.from({ length: 400 }, (_, i) => ({
      x: 100 + ((i * 37) % 1000),
      y: 60 + ((i * 53) % 500),
      count: 1,
    }));
    const started = performance.now();
    const png = await render(
      <SearchCard paths={[]} clusters={clusters} labels={LABELS} />,
      await loadFonts(),
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
    // Generous — this asserts "not pathological", not the production budget.
    // scripts/bench-og-render.mjs is the real measurement.
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});

describe("FallbackCard", () => {
  it("renders a PNG", async () => {
    const png = await render(
      <FallbackCard labels={{ ...LABELS, count: "No clinics match yet" }} />,
      await loadFonts(),
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it("renders without any fonts — the font-read failure path", async () => {
    const png = await render(
      <FallbackCard labels={{ ...LABELS, count: "No clinics match yet" }} />,
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
  });
});
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run src/modules/share/og/card.test.tsx
```

Expected: PASS, 8 tests. First run is slow — resvg-wasm initialises.

If a test fails with a satori error naming a CSS property, remove that property rather than working around it; the constraint is real. If `ImageResponse` cannot be imported under vitest, the failure is a `next/og` resolution problem, not a card problem — check the vitest alias config before touching the components.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add src/modules/share/og/palette.ts src/modules/share/og/fonts.ts \
  src/modules/share/og/card.tsx src/modules/share/og/fallback.tsx \
  src/modules/share/og/card.test.tsx
git commit -m "feat(share): render the OG search card and its fallback

Warm Horizon converted to hex — satori's color parser takes hex, rgb(),
hsl(), and named colors, and the app's palette is entirely oklch. Each
constant carries its oklch source so drift shows up in review.

The card is three absolutely-positioned layers over inline SVG, so pins
and land share one coordinate space. The fallback depends on nothing
that can fail: no disk, no projection, no data, and it still renders
when the fonts did not load.

card.test.tsx runs satori for real. Satori ignores unsupported CSS
silently, so without this a property that renders nothing is
indistinguishable from one that works."
```

---

### Task 7: The route handler

**Files:**

- Create: `src/app/api/og/search/route.ts`
- Test: covered by `e2e/og-cards.spec.ts` in Task 9 (route handlers have no unit-test harness in this repo)

**Interfaces:**

- Consumes: `resolveCardData`, `MAP_CLINIC_CAP` from `@/modules/share/og/bbox`; `loadPhOutline`, `ringsToPaths` from `.../basemap`; `buildLabels`, `buildFallbackLabels` from `.../label`; `loadFonts` from `.../fonts`; `SearchCard`, `FallbackCard`; `createProjector`, `clusterPins`, `fitBBox`, `CARD_WIDTH`, `CARD_HEIGHT`; `parseSearchParams` from `@/modules/search/schemas`; `getServices` from `@/modules/clinics/queries`.
- Produces: `GET(request: NextRequest): Promise<Response>` at `/api/og/search`.

- [ ] **Step 1: Implement the route**

> **Superseded 2026-08-18 (de806a2):** the plain `fitBBox` call below could
> bury a pin under the caption plate or wordmark. The route now calls
> `layoutBBox(data.bbox, pins, CARD_WIDTH, CARD_HEIGHT)` from the new
> `og/layout.ts` in place of `fitBBox`: it aspect-fits as before, then pans
> the map right or up (whichever moves less) so every pin clears both
> overlays, falling back to a zoom-out into the free band between them if no
> pan fits without a pin running off the card edge. `og/layout.ts` is the
> source of truth for the plate/wordmark rects that `card.tsx` renders — see
> Task 6's superseded note. Known tradeoff, left as-is: on the PH-wide card
> the pan-right case can carry eastern Mindanao/Samar coastline off the right
> edge of the frame so every pin stays clear of the plate; every pin is
> always visible, the coastline crop is the accepted cost.

Create `src/app/api/og/search/route.ts`:

```tsx
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getServices } from "@/modules/clinics/queries";
import { parseSearchParams, type SearchParams } from "@/modules/search/schemas";
import { loadPhOutline, ringsToPaths } from "@/modules/share/og/basemap";
import { resolveCardData } from "@/modules/share/og/bbox";
import { SearchCard } from "@/modules/share/og/card";
import { FallbackCard } from "@/modules/share/og/fallback";
import { loadFonts } from "@/modules/share/og/fonts";
import { buildFallbackLabels, buildLabels } from "@/modules/share/og/label";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  clusterPins,
  createProjector,
  fitBBox,
} from "@/modules/share/og/projection";

/**
 * Open Graph card for a filtered /clinics search.
 *
 * The file convention (opengraph-image.tsx) receives `params` only, never
 * `searchParams`, so it structurally cannot see filters — hence a route
 * handler. Middleware does not run here: the matcher in src/middleware.ts
 * excludes api/ via negative lookahead.
 */

/** Explicit because the font and geometry loaders use node:fs. */
export const runtime = "nodejs";

/**
 * Whole-path budget. A crawler waits a few seconds; this leaves headroom for
 * TLS, cold start, and transfer. Blowing it renders the fallback, which
 * expires in 60s rather than a day — see CACHE_FALLBACK.
 */
const RENDER_BUDGET_MS = 2000;

/** Pins closer than this collapse into one larger circle. */
const CLUSTER_DISTANCE_PX = 14;

const CACHE_FULL = "public, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_FALLBACK = "public, s-maxage=60, stale-while-revalidate=300";

function headers(variant: "full" | "fallback"): Record<string, string> {
  return {
    "Content-Type": "image/png",
    "Cache-Control": variant === "full" ? CACHE_FULL : CACHE_FALLBACK,
    // The deploy smoke check reads this: a tracing miss produces a fallback,
    // which is otherwise indistinguishable from a working card.
    "x-og-card": variant,
  };
}

/** Rejects after the budget so a hung query cannot stall the crawler. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`og card exceeded ${ms}ms budget`)),
      ms,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Slug → display name. Failure is survivable: label.ts de-slugs instead. */
async function serviceNames(): Promise<Record<string, string>> {
  try {
    const services = await getServices();
    return Object.fromEntries(services.map((s) => [s.slug, s.name]));
  } catch (error) {
    console.error("og card: getServices failed", error);
    return {};
  }
}

async function renderFull(params: SearchParams, names: Record<string, string>) {
  const [data, rings, fonts] = await Promise.all([
    resolveCardData(params),
    loadPhOutline(),
    loadFonts(),
  ]);
  if (!data) return null;

  const bbox = fitBBox(data.bbox, CARD_WIDTH, CARD_HEIGHT);
  const project = createProjector(bbox, CARD_WIDTH, CARD_HEIGHT);
  const paths = ringsToPaths(rings, project);
  const clusters = clusterPins(
    data.pins.map((pin) => project(pin.longitude, pin.latitude)),
    CLUSTER_DISTANCE_PX,
  );

  // The caption reports pins found, not circles drawn.
  const labels = buildLabels({
    params,
    pinCount: data.pins.length,
    atCap: data.atCap,
    serviceNames: names,
  });

  return new ImageResponse(
    <SearchCard paths={paths} clusters={clusters} labels={labels} />,
    { width: CARD_WIDTH, height: CARD_HEIGHT, fonts, headers: headers("full") },
  );
}

async function renderFallback(
  params: SearchParams,
  names: Record<string, string>,
) {
  const labels = buildFallbackLabels(params, names);
  // Fonts are best-effort here: a font read failure is one of the reasons we
  // are on this path at all, and satori has a bundled default.
  let fonts: Awaited<ReturnType<typeof loadFonts>> | undefined;
  try {
    fonts = await loadFonts();
  } catch (error) {
    console.error("og card: font load failed on the fallback path", error);
  }

  return new ImageResponse(<FallbackCard labels={labels} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    ...(fonts ? { fonts } : {}),
    headers: headers("fallback"),
  });
}

export async function GET(request: NextRequest) {
  // parseSearchParams is tolerant by design: it drops invalid keys and retries
  // rather than throwing, so hostile params degrade to a PH-wide card.
  const params = parseSearchParams(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const names = await serviceNames();

  try {
    const full = await withDeadline(
      renderFull(params, names),
      RENDER_BUDGET_MS,
    );
    if (full) return full;
  } catch (error) {
    console.error("og card: falling back", error);
  }

  try {
    return await renderFallback(params, names);
  } catch (error) {
    // Nothing renders. Better an empty 200 the crawler ignores than a 500 it
    // remembers as a broken URL.
    console.error("og card: fallback render failed", error);
    return new Response(null, { status: 200, headers: headers("fallback") });
  }
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
rm -rf .next && pnpm typecheck && pnpm lint
```

Expected: both clean. `rm -rf .next` is not superstition — stale `.next/dev/types/validator.ts` entries make `typecheck` fail on modules that no longer exist.

- [ ] **Step 3: Render it by hand**

```bash
pnpm dev
```

In another shell:

```bash
curl -s -D - -o /tmp/og-phwide.png "http://localhost:3000/api/og/search" | grep -i "x-og-card\|content-type\|cache-control"
curl -s -o /tmp/og-davao.png "http://localhost:3000/api/og/search?loc=Davao%20City&lat=7.19&lng=125.45&radius=25"
curl -s -D - -o /tmp/og-empty.png "http://localhost:3000/api/og/search?lat=20.5&lng=121.9&radius=1" | grep -i "x-og-card"
curl -s -D - -o /tmp/og-hostile.png "http://localhost:3000/api/og/search?north=abc&lat=999&services=%3Cscript%3E" | grep -i "x-og-card\|HTTP/"
open /tmp/og-phwide.png /tmp/og-davao.png /tmp/og-empty.png
```

Expected: PH-wide and Davao return `x-og-card: full` with the day-long TTL; the Batanes micro-radius returns `x-og-card: fallback` with `s-maxage=60`; the hostile query returns `200` and some card. **Look at the images.** The outline must read as the Philippines, pins must sit on land, and the caption must not overflow its plate.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/app/api/og/search/route.ts
git commit -m "feat(share): add /api/og/search OG card route

Route handler rather than the opengraph-image file convention: the
convention receives params only, never searchParams, so it structurally
cannot see the filters this card exists to show.

Always 200 with image/png — a non-200 teaches the crawler the URL is
broken. Fallbacks carry s-maxage=60 instead of 86400 so a transient
failure is not pinned at the CDN, and in Facebook's cache on top, for a
day. x-og-card marks which one rendered.

The whole path races a 2s deadline. A throwing query was already
handled; a hanging one is worse, because the crawler leaves with
nothing and caches the miss."
```

---

### Task 8: Metadata on /clinics

**Files:**

- Modify: `src/app/clinics/page.tsx:1-14`
- Test: covered by `e2e/og-cards.spec.ts` in Task 9

**Interfaces:**

- Consumes: `buildLabels` / `buildFallbackLabels` from `@/modules/share/og/label`; `parseSearchParams`; `siteConfig` from `@/lib/site-config`.
- Produces: `generateMetadata({ searchParams })` replacing the static `metadata` export.

- [ ] **Step 1: Replace the static metadata export**

The root layout already emits `og:type`, `og:site_name`, `og:locale`, and `twitter:card` for every route (`src/app/layout.tsx:19-35`) — do not re-declare them.

In `src/app/clinics/page.tsx`, replace lines 1-14:

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { siteConfig } from "@/lib/site-config";
import { getServices, searchClinics } from "@/modules/clinics/queries";
import { SearchPageClient } from "@/modules/search/components/SearchPageClient";
import { parseSearchParams } from "@/modules/search/schemas";
import { buildFallbackLabels } from "@/modules/share/og/label";

/** Query keys that change what the card shows. `cursor` deliberately does not. */
const CARD_PARAMS = [
  "q",
  "lat",
  "lng",
  "radius",
  "north",
  "south",
  "east",
  "west",
  "services",
  "ages",
  "verified",
  "online",
  "inperson",
  "open",
  "accessible",
  "loc",
] as const;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const raw = await searchParams;
  const params = parseSearchParams(raw);

  // Service names would cost a DB round trip in the metadata pass; label.ts
  // de-slugs when the map is empty, and the card image itself does the lookup
  // properly. A title reading "Occupational therapy" either way is worth more
  // than the query.
  const labels = buildFallbackLabels(params, {});

  const query = new URLSearchParams();
  for (const key of CARD_PARAMS) {
    const value = raw[key];
    const flat = Array.isArray(value) ? value[0] : value;
    if (flat) query.set(key, flat);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  // Crawlers need a fully-qualified og:image — metadataBase resolution is not
  // enough for every one of them, and there is no absoluteUrl() helper here.
  // NOTE: siteConfig.url falls back to http://localhost:3000 when
  // NEXT_PUBLIC_SITE_URL is unset, which would break every card on the site at
  // once with a perfectly healthy route. The deploy smoke check guards it.
  const imageUrl = `${siteConfig.url}/api/og/search${suffix}`;
  const pageUrl = `${siteConfig.url}/clinics${suffix}`;

  return {
    title: labels.headline,
    description: labels.description,
    // Canonical stays on the bare path for SEO; og:url carries the filters.
    // Facebook keys its cache on og:url, so a stripped one would collapse
    // every filter variant into a single shared preview. og:url also takes
    // precedence over rel=canonical for the crawler, so the two can diverge.
    alternates: { canonical: "/clinics" },
    openGraph: {
      url: pageUrl,
      // Set explicitly: openGraph.title is not documented to inherit from
      // `title`, and the bare headline is wanted here anyway — og:site_name
      // already carries the brand and card width is scarce.
      title: labels.headline,
      description: labels.description,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: labels.alt }],
    },
  };
}
```

Keep the rest of the file — the `ClinicsPage` component and its imports — unchanged. Remove the now-unused `metadata` export.

- [ ] **Step 2: Verify it compiles**

```bash
rm -rf .next && pnpm typecheck && pnpm lint
```

Expected: clean.

- [ ] **Step 3: Verify the tags by hand**

With `pnpm dev` running:

```bash
curl -s "http://localhost:3000/clinics?services=speech-therapy&loc=Cebu%20City" \
  | grep -oE '<meta [^>]*(og:|twitter:)[^>]*>'
```

Expected: `og:url` carries `?services=speech-therapy&loc=Cebu+City`, `og:title` is `Speech therapy in Cebu City` with no `— ThriveMap` suffix, `og:image` is absolute, `og:image:alt` is present, and `og:site_name` / `og:locale` / `twitter:card` appear once each from the layout.

Also confirm `<title>` renders as `Speech therapy in Cebu City — ThriveMap`: the page title _does_ inherit the root template, which is exactly why `og:title` is set separately.

Then confirm two different filters produce two different `og:url` and `og:image` values — the whole feature is that they diverge.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/app/clinics/page.tsx
git commit -m "feat(share): emit per-filter OG metadata on /clinics

Static metadata meant every filtered link previewed identically. Now
og:url carries the query string and og:image points at the matching
card.

og:url is load-bearing: Facebook keys its cache on it, so a stripped
one collapses every filter variant into a single shared preview. It
also outranks rel=canonical for the crawler, which is why the SEO
canonical can safely stay /clinics.

og:title is set explicitly and without the site-name suffix.
openGraph.title is not documented to inherit from title, and the root
template would have made it redundant with og:site_name anyway."
```

---

### Task 9: End-to-end tests

**Files:**

- Create: `e2e/og-cards.spec.ts`

- [ ] **Step 1: Write the spec**

Create `e2e/og-cards.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test.describe("OG card route", () => {
  test("returns a PNG with a full-card header", async ({ request }) => {
    const response = await request.get("/api/og/search");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const body = await response.body();
    expect(body.subarray(0, 4)).toEqual(PNG_MAGIC);
    expect(body.byteLength).toBeGreaterThan(5_000);
    expect(response.headers()["x-og-card"]).toBe("full");
    expect(response.headers()["cache-control"]).toContain("s-maxage=86400");
  });

  test("renders a different card for a filtered URL", async ({ request }) => {
    const [wide, filtered] = await Promise.all([
      request.get("/api/og/search"),
      request.get(
        "/api/og/search?loc=Cebu+City&lat=10.31&lng=123.89&radius=20",
      ),
    ]);
    const [a, b] = [await wide.body(), await filtered.body()];
    expect(a.equals(b)).toBe(false);
  });

  test("falls back with a short TTL when nothing matches", async ({
    request,
  }) => {
    // Open ocean east of Mindanao — a valid bbox with no clinics in it.
    const response = await request.get(
      "/api/og/search?north=8.2&south=8.1&east=126.9&west=126.8",
    );
    expect(response.status()).toBe(200);
    expect((await response.body()).subarray(0, 4)).toEqual(PNG_MAGIC);
    expect(response.headers()["x-og-card"]).toBe("fallback");
    expect(response.headers()["cache-control"]).toContain("s-maxage=60");
  });

  for (const [name, query] of [
    ["nonsense values", "?north=abc&south=xyz&lat=999&radius=-5"],
    [
      "injection attempt",
      "?loc=%3C%2Ftext%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    ],
    ["unknown keys", "?nope=1&other=2"],
    ["oversized loc", `?loc=${"A".repeat(500)}`],
    ["world bbox", "?north=89&south=-89&east=179&west=-179"],
  ] as const) {
    test(`survives ${name}`, async ({ request }) => {
      const response = await request.get(`/api/og/search${query}`);
      expect(response.status()).toBe(200);
      expect((await response.body()).subarray(0, 4)).toEqual(PNG_MAGIC);
      expect(["full", "fallback"]).toContain(response.headers()["x-og-card"]);
    });
  }
});

test.describe("OG metadata on /clinics", () => {
  test("og:url carries the query string", async ({ page }) => {
    await page.goto("/clinics?services=speech-therapy&loc=Cebu+City");
    const ogUrl = await page
      .locator('meta[property="og:url"]')
      .getAttribute("content");
    expect(ogUrl).toContain("/clinics?");
    expect(ogUrl).toContain("services=speech-therapy");
    expect(ogUrl).toContain("loc=Cebu");
  });

  test("og:image is absolute and points at the card route", async ({
    page,
  }) => {
    await page.goto("/clinics?loc=Davao+City");
    const image = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(image).toMatch(/^https?:\/\//);
    expect(image).toContain("/api/og/search");
    expect(image).toContain("loc=Davao");
  });

  test("og:title names the filter without the site-name suffix", async ({
    page,
  }) => {
    await page.goto("/clinics?services=speech-therapy&loc=Cebu+City");
    const title = await page
      .locator('meta[property="og:title"]')
      .getAttribute("content");
    expect(title).toBe("Speech therapy in Cebu City");
    // The page title does inherit the root template — that is the difference.
    expect(await page.title()).toContain("ThriveMap");
  });

  test("og:image:alt is present", async ({ page }) => {
    await page.goto("/clinics?loc=Davao+City");
    const alt = await page
      .locator('meta[property="og:image:alt"]')
      .getAttribute("content");
    expect(alt).toBeTruthy();
    expect(alt!.length).toBeGreaterThan(10);
  });

  test("two filters produce two distinct previews", async ({ page }) => {
    await page.goto("/clinics?loc=Cebu+City");
    const first = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    await page.goto("/clinics?loc=Davao+City");
    const second = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(first).not.toBe(second);
  });

  test("canonical stays on the bare path", async ({ page }) => {
    await page.goto("/clinics?loc=Cebu+City");
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical).not.toContain("?");
    expect(canonical).toContain("/clinics");
  });
});
```

- [ ] **Step 2: Run the spec**

Restart the dev server first — the e2e suite is unreliable against a server that has served a previous full run.

```bash
npx playwright test e2e/og-cards.spec.ts
```

Note: `pnpm test:e2e -- <pattern>` does **not** filter. Use `npx playwright test <path>` directly.

Expected: PASS. If "returns a PNG with a full-card header" gets `x-og-card: fallback`, the local database has no published clinics with coordinates — reseed with `pnpm db:reset` rather than weakening the assertion.

- [ ] **Step 3: Run the full unit suite for regressions**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add e2e/og-cards.spec.ts
git commit -m "test(share): e2e coverage for OG cards and metadata

Asserts PNG magic bytes, the x-og-card variant, and the matching TTL,
plus that hostile and nonsense params still yield 200 and an image —
the route promises never to hand a crawler a non-image.

On the metadata side: og:url carries the query string, og:image is
absolute, and two filters produce two previews. That last one is the
whole feature."
```

---

### Task 10: Share button

**Files:**

- Create: `src/modules/share/components/ShareButton.tsx`
- Modify: `src/modules/search/components/SearchPageClient.tsx`

- [ ] **Step 1: Read the toolbar you are adding to**

```bash
sed -n '330,410p' src/modules/search/components/SearchPageClient.tsx
```

`SearchPageClient.tsx:1` is already `"use client"` and imports `Button` from `@/components/ui/button` (line 7). The toolbar row holds the filters `Sheet` trigger, the sort `Select`, and the mobile list/map toggle — every control in it is `rounded-full`. The share button joins that row and matches that shape. There is no toast utility in the file, which is why the component below reports success by swapping its own label.

Note: shadcn here is **Base UI, not Radix** — no `asChild`, use `render={<Component/>}`. The share button needs neither.

- [ ] **Step 2: Write the component**

Create `src/modules/share/components/ShareButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shares the current filtered URL. The OG card only pays off if caregivers
 * actually paste these links into group threads, and on mobile the native
 * share sheet is the path of least resistance.
 *
 * navigator.share is unavailable on most desktop browsers and throws
 * AbortError when the user dismisses the sheet — neither is an error worth
 * showing.
 */
export function ShareButton({
  label = "Share these results",
}: {
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch (error) {
        // Dismissing the sheet is a normal outcome, not a failure.
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, or permission denied). Say
      // nothing rather than showing an error for a nice-to-have.
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="rounded-full"
      onClick={share}
    >
      <Share2 className="size-4" aria-hidden />
      {copied ? "Link copied" : label}
    </Button>
  );
}
```

Add `import { Share2 } from "lucide-react";` at the top — the toolbar's other buttons pair an icon with their label the same way.

- [ ] **Step 3: Mount it in the toolbar**

In `SearchPageClient.tsx`, add the import:

```tsx
import { ShareButton } from "@/modules/share/components/ShareButton";
```

Then place it in the toolbar row immediately **after** the sort `<Select>`'s closing tag and **before** the `{/* Mobile list/map toggle */}` comment, so it sits inside the existing flex container:

```tsx
            </Select>
            <ShareButton />
            {/* Mobile list/map toggle */}
```

Do not add a wrapper — the row is already a flex container and a new one would break its gap spacing.

- [ ] **Step 4: Verify by hand**

With `pnpm dev` running, open `http://localhost:3000/clinics?loc=Cebu+City`, click the button, and paste. The clipboard must contain the **filtered** URL, query string intact. Confirm the button does not shift the header layout when its text changes to "Link copied".

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/modules/share/components/ShareButton.tsx src/modules/search/components/SearchPageClient.tsx
git commit -m "feat(share): add a share button to search results

The card only pays off if caregivers paste these links into group
threads. Native share sheet on mobile, clipboard everywhere else.

A dismissed share sheet throws AbortError — that is the user saying no,
not a failure, so it is swallowed."
```

---

### Task 11: Deploy smoke check and the manual gate

`outputFileTracingIncludes` is only ever proven in production. This is the guard.

**Files:**

- Modify: `.github/workflows/main.yml:112-115`

- [ ] **Step 1: Extend the smoke step**

Replace the existing `Smoke test` step:

```yaml
- name: Smoke test
  run: curl -fsS "$SMOKE_URL/api/health"
  env:
    SMOKE_URL: ${{ secrets.SMOKE_URL }}
```

with:

```yaml
- name: Smoke test
  env:
    SMOKE_URL: ${{ secrets.SMOKE_URL }}
  run: |
    set -euo pipefail
    curl -fsS "$SMOKE_URL/api/health"

    # The OG card route reads fonts and geometry from disk. Those paths
    # are dynamic, so they only reach the serverless bundle via
    # outputFileTracingIncludes — and a tracing miss degrades to the
    # fallback card, which still returns 200 with image/png. Only the
    # x-og-card header tells the two apart, so assert on it.
    echo "Checking /api/og/search..."
    CARD_HEADERS=$(curl -fsS -o /tmp/og.png -D - "$SMOKE_URL/api/og/search?loc=Cebu+City")
    echo "$CARD_HEADERS" | grep -qi "content-type: image/png" \
      || { echo "::error::OG card did not return image/png"; echo "$CARD_HEADERS"; exit 1; }
    echo "$CARD_HEADERS" | grep -qi "x-og-card: full" \
      || { echo "::error::OG card fell back — fonts or geometry are missing from the bundle (check outputFileTracingIncludes)"; echo "$CARD_HEADERS"; exit 1; }
    test "$(stat -c%s /tmp/og.png)" -gt 5000 \
      || { echo "::error::OG card PNG is implausibly small"; exit 1; }

    # NEXT_PUBLIC_SITE_URL unset makes siteConfig.url fall back to
    # localhost, which breaks every og:image on the site while the route
    # itself stays perfectly healthy. Vercel env rows have gone empty
    # here before.
    echo "Checking og:image on /clinics..."
    OG_IMAGE=$(curl -fsS "$SMOKE_URL/clinics?loc=Cebu+City" \
      | grep -oE '<meta property="og:image" content="[^"]*"' \
      | head -1 | sed -E 's/.*content="([^"]*)".*/\1/')
    echo "og:image = $OG_IMAGE"
    case "$OG_IMAGE" in
      "$SMOKE_URL"/api/og/search*) ;;
      *) echo "::error::og:image is not an absolute production URL — check NEXT_PUBLIC_SITE_URL"; exit 1 ;;
    esac
```

- [ ] **Step 2: Validate the YAML**

```bash
npx -y yaml-lint .github/workflows/main.yml 2>/dev/null || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/main.yml')); print('valid')"
```

Expected: valid.

- [ ] **Step 3: Commit and push**

```bash
pnpm format
git add .github/workflows/main.yml
git commit -m "ci: smoke test the OG card route after deploy

outputFileTracingIncludes is only ever proven in production. A tracing
miss still returns 200 with image/png — it just silently serves the
fallback — so the check asserts x-og-card: full, not just that an image
came back.

Also asserts og:image is an absolute production URL:
NEXT_PUBLIC_SITE_URL going empty would break every card on the site
from the metadata side, with a healthy route and nothing in the logs."
git push
```

- [ ] **Step 4: Watch the deploy**

```bash
gh run watch
```

Expected: validate ✅ migrate ✅ deploy+smoke ✅.

If the smoke check fails on `x-og-card: full` while local dev is fine, that is the tracing gap doing exactly what it was predicted to do — check the glob paths in `next.config.ts` against the real asset locations. Note that a **failed Vercel build never re-aliases**, so production stays on the last good deployment and `/api/health` keeps returning ok; green health proves nothing about the newest build.

- [ ] **Step 5: The manual QA gate**

Not optional, and not automatable — Facebook's renderer is the only authority on how the card actually looks in a feed.

Run each of these through the [Sharing Debugger](https://developers.facebook.com/tools/debug/), clicking **Scrape Again** for each:

1. `https://thrivemap.vercel.app/clinics`
2. `https://thrivemap.vercel.app/clinics?services=occupational-therapy&loc=Davao+City`
3. `https://thrivemap.vercel.app/clinics?services=speech-therapy&loc=Cebu+City&verified=1`

Confirm, against the spec's success criteria:

1. Three visibly **different** cards.
2. Each names the filter and the place in words a caregiver would use.
3. No warnings about image size, aspect ratio, or fetch timeouts.
4. The card image loads on first scrape — a timeout here means the cold-cache render is over budget, and `scripts/bench-og-render.mjs` is where you go next.

- [ ] **Step 6: Update the handoff**

Rewrite `handoff.md` in its documented shape: what this was, what shipped and is verified, the single next action, and any new traps — the tracing requirement and the `x-og-card` smoke contract both belong there. `handoff.md` is in `.prettierignore` on purpose; leave it there.

---

## Notes for the implementer

**Read the spec.** `docs/superpowers/specs/2026-08-12-shareable-search-og-cards-design.md` explains _why_ for every decision here, including several rejected alternatives that look attractive from inside the code (a static-map provider, TopoJSON, `d3-geo`, province boundaries, the `opengraph-image` file convention). If something below looks like it could be simpler, check whether the spec already argued about it.

**Things that will look wrong but are not:**

- `pnpm typecheck` failing on modules that no longer exist → stale `.next/dev/types/validator.ts`. `rm -rf .next` and re-run.
- `pnpm test:e2e -- <pattern>` not filtering → use `npx playwright test <path>`.
- `/api/health` green after a failed deploy → a failed Vercel build never re-aliases, so production is still the previous deployment.
- The card counting fewer circles than the caption claims → deliberate. Clustering merges circles; the caption reports pins found.

**Rate limiting is deliberately absent.** `checkRateLimit` exists (`src/modules/shared/rate-limit.ts`) but no public GET route uses it — it is only called from mutation server actions. Adding it here would set a new precedent, so the decision was to rely on `s-maxage=86400` at the CDN and revisit if the endpoint shows abuse. Do not add it as a drive-by.

**Out of scope, however tempting:** clinic-profile cards, location and service page cards, curated shareable lists, and any change to search behaviour itself. Each is a separate spec.
