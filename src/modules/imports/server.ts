import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getPlacesProvider } from "./index";
import type { NormalizedPlace } from "./types";

export interface PlacesImportResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface UpsertCandidatesResult {
  created: number;
  updated: number;
  /** external_ids that already existed before this call. */
  existing: Set<string>;
}

/**
 * Upsert normalized places into external_place_candidates for one provider.
 * Existing rows refresh raw_payload and normalized fields but keep
 * status/reviewed_by/reviewed_at — a discarded candidate never resurrects.
 * Shared by the candidate_import job and the admin by-name lookup so both
 * paths write identical rows.
 */
export async function upsertPlaceCandidates(
  providerName: string,
  places: NormalizedPlace[],
): Promise<UpsertCandidatesResult> {
  if (places.length === 0) {
    return { created: 0, updated: 0, existing: new Set() };
  }
  const supabase = createSupabaseAdminClient();
  const { data: existingRows, error: existingError } = await supabase
    .from("external_place_candidates")
    .select("external_id")
    .eq("provider", providerName)
    .in(
      "external_id",
      places.map((p) => p.externalId),
    );
  if (existingError) {
    throw new Error(
      `candidate upsert: lookup failed: ${existingError.message}`,
    );
  }
  const existing = new Set(existingRows?.map((r) => r.external_id));

  // Upsert only the data columns; status and review fields are absent from
  // the payload, so ON CONFLICT leaves them untouched.
  const { error: upsertError } = await supabase
    .from("external_place_candidates")
    .upsert(
      places.map((place) => ({
        provider: providerName,
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
    throw new Error(`candidate upsert: upsert failed: ${upsertError.message}`);
  }
  const created = places.filter((p) => !existing.has(p.externalId)).length;
  return { created, updated: places.length - created, existing };
}

/**
 * Which of the given external_ids are already candidates for this provider.
 * Read-only companion to upsertPlaceCandidates for "already added" badges.
 */
export async function findExistingCandidateIds(
  providerName: string,
  externalIds: string[],
): Promise<Set<string>> {
  if (externalIds.length === 0) return new Set();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("external_place_candidates")
    .select("external_id")
    .eq("provider", providerName)
    .in("external_id", externalIds);
  if (error) {
    throw new Error(`candidate lookup failed: ${error.message}`);
  }
  return new Set(data?.map((r) => r.external_id));
}

/**
 * Body of the candidate_import job. Fetches places for a templated query and
 * upserts external_place_candidates. Idempotent: safe to retry after partial
 * runs.
 */
export async function runPlacesImport(payload: {
  query?: unknown;
}): Promise<PlacesImportResult> {
  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!query) throw new Error("candidate_import: payload.query is required");

  const provider = getPlacesProvider();
  const { places, skipped } = await provider.searchText(query);
  const { created, updated } = await upsertPlaceCandidates(
    provider.name,
    places,
  );

  logger.info("candidate_import finished", {
    query,
    fetched: places.length,
    created,
    updated,
    skipped,
  });
  return { fetched: places.length, created, updated, skipped };
}
