export interface NormalizedPlace {
  externalId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rawPayload: Record<string, unknown>;
}

export interface PlacesSearchResult {
  places: NormalizedPlace[];
  /** Provider results that failed schema validation and were dropped. */
  skipped: number;
}

export interface PlacesSearchOptions {
  maxPages?: number;
}

export interface PlacesProvider {
  /** Provider slug stored in external_place_candidates.provider. */
  readonly name: string;
  searchText(
    query: string,
    options?: PlacesSearchOptions,
  ): Promise<PlacesSearchResult>;
}
