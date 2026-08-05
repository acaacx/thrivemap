import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getPlacesProvider } from "./index";

export interface PlacesImportResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
}

/**
 * Body of the candidate_import job. Fetches places for a templated query and
 * upserts external_place_candidates. Existing rows refresh raw_payload and
 * normalized fields but keep status/reviewed_by/reviewed_at — a discarded
 * candidate never resurrects. Idempotent: safe to retry after partial runs.
 */
export async function runPlacesImport(payload: {
  query?: unknown;
}): Promise<PlacesImportResult> {
  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!query) throw new Error("candidate_import: payload.query is required");

  const provider = getPlacesProvider();
  const { places, skipped } = await provider.searchText(query);

  const supabase = createSupabaseAdminClient();
  let created = 0;
  let updated = 0;

  if (places.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from("external_place_candidates")
      .select("external_id")
      .eq("provider", provider.name)
      .in(
        "external_id",
        places.map((p) => p.externalId),
      );
    if (existingError) {
      throw new Error(
        `candidate_import: lookup failed: ${existingError.message}`,
      );
    }
    const existing = new Set(existingRows?.map((r) => r.external_id));

    // Upsert only the data columns; status and review fields are absent from
    // the payload, so ON CONFLICT leaves them untouched.
    const { error: upsertError } = await supabase
      .from("external_place_candidates")
      .upsert(
        places.map((place) => ({
          provider: provider.name,
          external_id: place.externalId,
          raw_payload: JSON.parse(JSON.stringify(place.rawPayload)),
          normalized_name: place.name,
          normalized_address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
        })),
        { onConflict: "provider,external_id" },
      );
    if (upsertError) {
      throw new Error(
        `candidate_import: upsert failed: ${upsertError.message}`,
      );
    }
    created = places.filter((p) => !existing.has(p.externalId)).length;
    updated = places.length - created;
  }

  logger.info("candidate_import finished", {
    query,
    fetched: places.length,
    created,
    updated,
    skipped,
  });
  return { fetched: places.length, created, updated, skipped };
}
