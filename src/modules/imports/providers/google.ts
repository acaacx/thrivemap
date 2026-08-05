import { z } from "zod";
import { normalizeGooglePlace } from "../normalize";
import type {
  NormalizedPlace,
  PlacesProvider,
  PlacesSearchOptions,
  PlacesSearchResult,
} from "../types";

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

/** Minimal mask = base-tier billing; nextPageToken is top-level. */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "nextPageToken",
].join(",");

/** Hard quota guard: at most 3 pages (~60 places) per job. */
export const MAX_PAGES = 3;

const responseSchema = z.looseObject({
  places: z.array(z.unknown()).optional(),
  nextPageToken: z.string().optional(),
});

export class GooglePlacesProvider implements PlacesProvider {
  readonly name = "google";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async searchText(
    query: string,
    options?: PlacesSearchOptions,
  ): Promise<PlacesSearchResult> {
    const maxPages = options?.maxPages ?? MAX_PAGES;
    const places: NormalizedPlace[] = [];
    let skipped = 0;
    let pageToken: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const response = await this.fetchImpl(SEARCH_TEXT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: query,
          ...(pageToken ? { pageToken } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`Places searchText failed: HTTP ${response.status}`);
      }
      const parsed = responseSchema.parse(await response.json());
      for (const raw of parsed.places ?? []) {
        const place = normalizeGooglePlace(raw);
        if (place) places.push(place);
        else skipped++;
      }
      pageToken = parsed.nextPageToken;
      if (!pageToken) break;
    }
    return { places, skipped };
  }
}
