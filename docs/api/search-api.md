# Search API

Public surface used by the search page; also the contract for anyone
scripting against the app. All endpoints are read-only GET and return JSON.

## `GET /api/search`

Wraps the `search_clinics` RPC.

| Param                         | Type                                                                                  | Notes                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `lat`, `lng`                  | number                                                                                | Search center (with `radius`)                                          |
| `radius`                      | km, number                                                                            | Radius mode; mutually exclusive with bbox                              |
| `north`,`south`,`east`,`west` | number                                                                                | Bbox mode ("search this area")                                         |
| `q`                           | string                                                                                | Free text (websearch syntax + typo-tolerant name match)                |
| `services`                    | csv slugs                                                                             | e.g. `speech-therapy,occupational-therapy`                             |
| `ages`                        | csv                                                                                   | `early_childhood,school_age,adolescent,adult`                          |
| `verified`                    | boolean                                                                               | Verified listings only                                                 |
| `online`, `inperson`          | boolean                                                                               | Delivery mode                                                          |
| `open`                        | boolean                                                                               | Open now (Asia/Manila)                                                 |
| `accessible`                  | boolean                                                                               | Wheelchair-accessible only                                             |
| `sort`                        | `nearest` \| `relevance` \| `verified_first` \| `recently_verified` \| `alphabetical` | Default `nearest`                                                      |
| `cursor`                      | opaque string                                                                         | From previous response; keyset pagination (`nearest`/`relevance` only) |

Response:

```json
{
  "clinics": [
    {
      "clinic_id": "…",
      "slug": "…",
      "name": "…",
      "status": "published_verified",
      "city": "Quezon City",
      "province": "Metro Manila",
      "latitude": 14.6,
      "longitude": 121.0,
      "distance_km": 2.4,
      "rank": 0.61,
      "is_open_now": true,
      "service_names": ["Speech Therapy"],
      "…": "…"
    }
  ],
  "nextCursor": "eyJ2IjoyLjQsImlkIjoi…" // null when exhausted
}
```

Results are cached ~60 s server-side (30 s with `open=true`); distances come
from PostGIS, never client math.

## `GET /api/map-clinics?north=&south=&east=&west=&services=&verified=`

Minimal columns for map markers within the bbox, capped server-side.
Clustering happens client-side.

## `GET /api/locations?q=` and `?placeId=`

Autocomplete over `ph_locations` (dev) or Google Places (env-gated);
`placeId` resolves to coordinates. Autocomplete responses are cached 1 h.

## Errors

`400` with `{ error: { code, message } }` for invalid params; `500` with a
generic message otherwise. No auth required; rate limiting applies only to
mutations, not these read endpoints.
