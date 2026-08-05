import autismTherapy from "../fixtures/autism-therapy.json";
import generic from "../fixtures/generic.json";
import { normalizeGooglePlace } from "../normalize";
import type { PlacesProvider, PlacesSearchResult } from "../types";

/**
 * [DEV ADAPTER] Deterministic stand-in for Google Places when no server key
 * is configured. Fixtures mirror the Places API (New) response shape, so the
 * whole import -> review -> promote flow is demoable and testable offline.
 */
const FIXTURES: Record<string, { places: unknown[] }> = {
  "autism-therapy": autismTherapy,
};

function slugifyQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class FixturePlacesProvider implements PlacesProvider {
  // Stand-in for the live provider: rows must merge with real Google rows
  // later, so the provider slug matches.
  readonly name = "google";

  async searchText(query: string): Promise<PlacesSearchResult> {
    const querySlug = slugifyQuery(query);
    const fixture =
      Object.entries(FIXTURES).find(([key]) =>
        querySlug.startsWith(key),
      )?.[1] ?? generic;
    const places = fixture.places
      .map(normalizeGooglePlace)
      .filter((p): p is NonNullable<typeof p> => p !== null);
    return { places, skipped: fixture.places.length - places.length };
  }
}
