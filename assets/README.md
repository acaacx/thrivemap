# Runtime assets

Read from disk by `/api/og/search` via `readFile(join(process.cwd(), …))`.
**Never served** — these are not in `public/` on purpose, and they are only in
the serverless bundle because `outputFileTracingIncludes` in `next.config.ts`
names them. If you move or rename anything here, update that config or the
route will throw ENOENT in production while working fine in dev.

Background and rationale for these assets live in
`docs/superpowers/plans/2026-08-12-shareable-search-og-cards.md`, Task 1 —
but treat that file as a historical record, not a runbook: it predates the
tooling fixes below and its commands will not reproduce what's committed
here. The commands in this file are the ones that actually produced the
committed files and are kept up to date when the assets change.

## geo/ph-outline.geojson

Natural Earth 1:50m admin-0, Philippines feature only, geometry with all
attribute fields stripped (`ADMIN`, `POP_EST`, etc. — ~150 unused fields that
would otherwise be parsed on every cold start and never read). Public
domain, no attribution required.

`mapshaper` is not installed as a project dependency; run it via `npx`. From
the repo root, after downloading and unzipping the Natural Earth 1:50m
admin-0 countries shapefile to `/tmp/ne` (see the plan doc for the download
URL):

```bash
npx -y mapshaper@0.6 /tmp/ne/ne_50m_admin_0_countries.shp \
  -filter 'ADMIN=="Philippines"' \
  -filter-islands min-area=10km2 \
  -simplify 85% weighted visvalingam keep-shapes \
  -filter-fields \
  -clean \
  -o format=geojson precision=0.0001 geojson-type=FeatureCollection no-null-props \
     assets/geo/ph-outline.geojson
```

Notes on the flags:

- `-filter-islands` runs **before** `-simplify` on purpose: simplifying first
  would reduce tiny islets to degenerate slivers instead of dropping them
  cleanly. The 10 km² threshold sits below Mindoro (~9,735 km²) and Palawan
  (~14,650 km²) — the smallest islands that must survive — while stripping
  the ~7,600-island tail that would render as confetti.
- `-simplify 85%` is higher than mapshaper's usual defaults because Natural
  Earth's 1:50m scale is already coarse; lower retention (e.g. 15%) produces
  a visibly faceted outline — Palawan reduces to a spike, Luzon's coastline
  goes polygonal. 85% keeps the outline recognizable at 1200×630 while still
  landing under half the 50 KB size budget (~44%, see below) — there's
  headroom, but it isn't an order of magnitude of headroom.
- `-filter-fields` with no field list drops every attribute field, leaving
  geometry only. On its own this also collapses mapshaper's output from
  `FeatureCollection` to a bare `GeometryCollection` (a `Feature` with no
  properties isn't emitted as a `Feature`), which breaks the
  `g.features[0].geometry` shape both `scripts/bench-og-render.mjs` and the
  route handler depend on — `geojson-type=FeatureCollection no-null-props`
  forces the `Feature` wrapper back with `"properties":{}`.

`assets/geo/*.geojson` is listed in `.prettierignore`. Prettier pretty-prints
this file to one coordinate per line if it's allowed to touch it, which
roughly doubles both the committed size and the bytes parsed on every cold
start for zero readability benefit on a generated coordinate blob — leave
the ignore entry in place and don't run a formatter on this file by hand.

Current committed asset: 48 rings, 1,181 points, 22,118 bytes (~22 KB, ~44%
of the 50 KB budget). Verify after regenerating:

```bash
node -e "
const fs = require('node:fs');
const g = JSON.parse(fs.readFileSync('./assets/geo/ph-outline.geojson', 'utf8'));
const f = g.features[0];
let rings = 0, points = 0;
for (const poly of f.geometry.coordinates) {
  for (const ring of poly) { rings++; points += ring.length; }
}
console.log(f.geometry.type, 'rings:', rings, 'points:', points);
"
```

Expect `MultiPolygon`, comfortably under 50 KB, and between 5 and 200 rings
(Task 3 asserts this bound on load). If a re-simplify pushes the ring count
or size out of range, adjust the `-simplify` percentage and re-run
`node scripts/bench-og-render.mjs` — the 2000ms budget from the spec is the
hard gate; judge on run 1, not the average.

## fonts/

Fraunces and Nunito Sans, both OFL — `OFL-Fraunces.txt` and
`OFL-NunitoSans.txt` are separate files because the two families are
separately authored/copyrighted and OFL condition 2 requires each notice to
travel with its font; don't merge them into one `OFL.txt`.

Fraunces upstream is a variable font with live `SOFT`, `WONK`, and `opsz`
axes (`src/app/layout.tsx:8-12`); Nunito Sans upstream is variable on
`YTLC`, `opsz`, `wdth`, `wght`. Satori wants a static instance, so both are
frozen at the card's axis values with `fonttools varLib.instancer`, then
subset to Latin-1 + general punctuation with `pyftsubset`. (Not
`pyftsubset --instance-features --variations=...` in one step — that flag
combination doesn't exist in fonttools 4.63.0, the version this was built
against; `pyftsubset --help` has no `--instance-features` or `--variations`
option. `varLib.instancer` does the axis-freezing, `pyftsubset` does the
subsetting.)

`fonttools` is not a project dependency — install it into a throwaway venv,
never the system interpreter:

```bash
python3 -m venv /tmp/fonttools-venv
/tmp/fonttools-venv/bin/pip install 'fonttools[woff]' brotli

mkdir -p /tmp/fonts
curl -fsSL -o /tmp/fonts/Fraunces.ttf \
  "https://github.com/google/fonts/raw/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
curl -fsSL -o /tmp/fonts/NunitoSans.ttf \
  "https://github.com/google/fonts/raw/main/ofl/nunitosans/NunitoSans%5BYTLC%2Copsz%2Cwdth%2Cwght%5D.ttf"
curl -fsSL -o assets/fonts/OFL-Fraunces.txt \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt"
curl -fsSL -o assets/fonts/OFL-NunitoSans.txt \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/nunitosans/OFL.txt"

RANGE="U+0020-007E,U+00A0-00FF,U+2010-2027"

# Fraunces: opsz=32, SOFT=0 (not soft), WONK=1 (wonky), wght=600 (semibold)
/tmp/fonttools-venv/bin/fonttools varLib.instancer /tmp/fonts/Fraunces.ttf \
  opsz=32 SOFT=0 WONK=1 wght=600 --static \
  -o /tmp/fonts/Fraunces-instance.ttf
/tmp/fonttools-venv/bin/pyftsubset /tmp/fonts/Fraunces-instance.ttf \
  --unicodes=$RANGE --output-file=assets/fonts/fraunces-display.ttf

# Nunito Sans regular: opsz=12, wdth=100 (normal width), wght=400
/tmp/fonttools-venv/bin/fonttools varLib.instancer /tmp/fonts/NunitoSans.ttf \
  opsz=12 wdth=100 wght=400 --static \
  -o /tmp/fonts/NunitoSans-regular-instance.ttf
/tmp/fonttools-venv/bin/pyftsubset /tmp/fonts/NunitoSans-regular-instance.ttf \
  --unicodes=$RANGE --output-file=assets/fonts/nunito-sans-regular.ttf

# Nunito Sans semibold: same axes, wght=600
/tmp/fonttools-venv/bin/fonttools varLib.instancer /tmp/fonts/NunitoSans.ttf \
  opsz=12 wdth=100 wght=600 --static \
  -o /tmp/fonts/NunitoSans-semibold-instance.ttf
/tmp/fonttools-venv/bin/pyftsubset /tmp/fonts/NunitoSans-semibold-instance.ttf \
  --unicodes=$RANGE --output-file=assets/fonts/nunito-sans-semibold.ttf
```

The unicode range is Latin-1 plus general punctuation. Filipino place names
("Parañaque", "Cebu City", "Davao") stay inside it.
