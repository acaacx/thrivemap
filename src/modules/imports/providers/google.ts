import type { PlacesProvider, PlacesSearchResult } from "../types";

/** Live Places API (New) Text Search client. Implemented in the next task. */
export class GooglePlacesProvider implements PlacesProvider {
  readonly name = "google";

  constructor(private readonly apiKey: string) {}

  async searchText(): Promise<PlacesSearchResult> {
    throw new Error(
      `GooglePlacesProvider.searchText not implemented (key ${this.apiKey.length} chars)`,
    );
  }
}
