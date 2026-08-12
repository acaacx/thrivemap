# Dev adapters

Every external provider sits behind an interface with a local fallback that
logs a visible `[DEV ADAPTER]` marker. The app is fully functional with zero
external credentials; each real provider activates when its env key is set
(see `.env.example`).

| Concern                  | Interface                              | Dev adapter                      | Real provider (env-gated)                                   |
| ------------------------ | -------------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| Map rendering            | `<ClinicMap>` renderer                 | MapLibre GL + OSM raster tiles   | Google Maps JS (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY`)  |
| Geocoding / autocomplete | `MapProvider`                          | seeded `ph_locations` table      | Google Places (`GOOGLE_MAPS_SERVER_API_KEY`)                |
| Candidate import         | `PlacesProvider` (`modules/imports`)   | deterministic JSON fixtures      | Places API (New) Text Search (`GOOGLE_MAPS_SERVER_API_KEY`) |
| Rate limiting            | `RateLimiter` (`shared/rate-limit.ts`) | in-memory sliding window         | Upstash Redis                                               |
| Cache                    | `CacheStore` (`shared/cache.ts`)       | in-memory TTL map                | Upstash Redis                                               |
| Email                    | `EmailSender` (`shared/email/`)        | console log + `.dev-mail/` files | Resend (`RESEND_API_KEY`)                                   |
| Analytics                | `Analytics` (`shared/analytics.ts`)    | log-only no-op                   | PostHog (`NEXT_PUBLIC_POSTHOG_KEY`)                         |
| Error monitoring         | `instrumentation.ts`                   | structured log only              | Sentry (`SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`)            |

Rules:

- Interfaces live with their module; provider selection happens once, in a
  lazily-initialized `getX()` factory keyed off env.
- Dev adapters must be behaviorally honest (real TTLs, real limits) so local
  testing exercises the same code paths.
- Provider failures fail _open_ for availability-tier features (rate limit,
  cache, analytics) and _loud_ for correctness-tier features (email delivery
  throws → job retry).
