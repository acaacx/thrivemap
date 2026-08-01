# Scaling triggers

The Phase 1 architecture is a single Next.js app + one Postgres. These are
the observable thresholds at which to change something, and what to change.
Do nothing before the trigger fires.

| Signal                                          | Threshold                                         | Action                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search p95 latency                              | > 500 ms sustained with warm cache                | Check `EXPLAIN` on `search_clinics`; add covering indexes; only then consider a search engine (Typesense/Meilisearch) fed from `clinic_search_documents` |
| DB CPU                                          | > 70% sustained                                   | Upstash cache first (offloads read spikes); then Supabase compute upgrade; read replica only after cache + compute                                       |
| Rate-limit / cache correctness across instances | > 1 app instance in production                    | Configure Upstash (in-memory adapters are per-instance)                                                                                                  |
| Job backlog                                     | pending overdue > 100 for > 15 min at 1-min ticks | Raise tick frequency / batch size; if handlers are the bottleneck, move the processor to a dedicated worker (queue interface already isolates it)        |
| Email volume                                    | > Resend free-tier or > ~100/day                  | Paid Resend plan; add per-template suppression lists                                                                                                     |
| Tile traffic                                    | OSM usage-policy warnings                         | Google Maps key (already integrated) or a commercial tile host                                                                                           |
| Storage egress                                  | Signed-URL/image egress dominating bill           | Cloudflare in front (doc-only today), image CDN transforms                                                                                               |
| Clinic count                                    | > ~10k listings                                   | Revisit `get_map_clinics` cap + server-side clustering                                                                                                   |
| Traffic                                         | Sustained global traffic                          | Cloudflare CDN/WAF (documented, unconfigured), ISR times up                                                                                              |

Phase 2 features (booking, messaging) change the write profile — re-run
capacity thinking before building them; see [../phase-2-plan.md](../phase-2-plan.md).
