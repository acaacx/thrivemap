# Search architecture

## Flow

```
/clinics?lat=…&lng=…&services=… (URL = state)
   │ server render (first page) / TanStack Query (interactions)
   ▼
searchClinics() ── cache (60 s, geohash-rounded key) ── search_clinics RPC
getMapClinics() ── cache (60 s)                      ── get_map_clinics RPC
```

## `search_clinics` RPC

One SECURITY DEFINER function does all filtering in SQL:

- **Geo**: `ST_DWithin` for radius (lat/lng/radius_km) or
  `ST_MakeEnvelope` for bbox; distance returned as `distance_km`.
- **Text**: websearch tsquery over the weighted search document, plus
  trigram similarity on normalized name for typo tolerance; `rank` returned
  for relevance sort.
- **Filters**: service slugs, age groups, verified-only, online/in-person,
  open-now (evaluated against clinic_hours in Asia/Manila), accessible-only.
- **Pagination**: keyset cursor on `(sort key, clinic_id)` for every sort
  mode. `search_clinics` emits the key it ordered by — `sort_value` (numeric)
  or `sort_text` (alphabetical, keyed on name) — so callers never recompute
  it. Numeric keys are rounded in SQL (6 dp for distance/rank, 3 dp for
  verification epoch) because float8 renders with 15 significant digits,
  one short of a double: an un-rounded key does not round-trip and the
  boundary row is re-emitted on the next page. Ascending sorts use a row-wise
  comparison; descending sorts need `key < cursor OR (key = cursor AND id >
  cursor_id)` because the id tie-break runs the other way. Cursors are opaque
  base64 (`modules/search/cursor.ts`).
- Only published listings are visible; the function re-checks status even
  though RLS also filters.

## Map pipeline

`get_map_clinics` returns minimal columns (id, slug, name, status, lat/lng)
capped by a hard limit for the current bbox. Client-side, MapLibre clusters
markers; moving the map shows "Search this area" rather than auto-searching.

## Caching

`cachedClinicData` (`modules/shared/cache.ts`) wraps search, map, profile,
and autocomplete reads. Keys embed a namespace version; every clinic
mutation bumps the version (`invalidateClinicCaches`), instantly lapsing all
derived entries without key enumeration. Coordinates are rounded to 3
decimals (~110 m) so nearby searches share entries. Open-now searches use a
30 s TTL because results depend on the clock.

## Freshness

Triggers on clinics/locations/services refresh `clinic_search_documents`
inline; the nightly `search_document_refresh` job rebuilds everything as a
safety net against drift.
