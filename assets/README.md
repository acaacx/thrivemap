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
