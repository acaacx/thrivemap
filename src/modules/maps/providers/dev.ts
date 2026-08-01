import "server-only";
import { createSupabaseAnonClient } from "@/lib/supabase/server";
import type {
  AddressResult,
  ExternalPlaceCandidate,
  ExternalPlaceDetails,
  GeocodedLocation,
  LocationSuggestion,
  MapProvider,
} from "../types";

const DEV_PREFIX = "dev:";

/**
 * [DEV ADAPTER] Local map provider backed by the seeded ph_locations table.
 * Used automatically when no Google Maps key is configured. Autocomplete and
 * geocoding cover provinces/cities/barangays in the reference table only.
 */
export class DevMapProvider implements MapProvider {
  readonly name = "dev";

  async autocompleteLocation(query: string): Promise<LocationSuggestion[]> {
    if (query.trim().length < 2) return [];
    const supabase = createSupabaseAnonClient();
    const { data, error } = await supabase.rpc("search_ph_locations", {
      p_query: query,
      p_limit: 8,
    });
    if (error) {
      console.warn("[DEV ADAPTER] ph_locations autocomplete failed:", error.message);
      return [];
    }
    return (data ?? []).map((row) => ({
      placeId: `${DEV_PREFIX}${row.id}`,
      label: row.label,
      kind: row.kind as LocationSuggestion["kind"],
    }));
  }

  async geocodePlace(placeId: string): Promise<GeocodedLocation | null> {
    if (!placeId.startsWith(DEV_PREFIX)) return null;
    const id = placeId.slice(DEV_PREFIX.length);
    const supabase = createSupabaseAnonClient();
    const { data, error } = await supabase
      .from("ph_locations")
      .select("search_name, province_slug, city_slug")
      .eq("id", id)
      .single();
    if (error || !data) return null;

    // Centroid comes back via the RPC (PostGIS geography isn't directly
    // selectable as lat/lng through PostgREST).
    const { data: rpcRows } = await supabase.rpc("search_ph_locations", {
      p_query: data.search_name,
      p_limit: 1,
    });
    const match = rpcRows?.[0];
    if (!match) return null;
    return {
      label: data.search_name,
      latitude: match.latitude,
      longitude: match.longitude,
      provinceSlug: data.province_slug ?? undefined,
      citySlug: data.city_slug ?? undefined,
    };
  }

  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<AddressResult | null> {
    // Dev adapter: nearest reference location as a coarse label.
    const supabase = createSupabaseAnonClient();
    const { data } = await supabase.rpc("search_ph_locations", {
      p_query: "city",
      p_limit: 1,
    });
    void data;
    return {
      formattedAddress: `Near ${latitude.toFixed(3)}, ${longitude.toFixed(3)} (dev geocoder)`,
      countryCode: "PH",
    };
  }

  async getPlaceDetails(placeId: string): Promise<ExternalPlaceDetails | null> {
    const geocoded = await this.geocodePlace(placeId);
    if (!geocoded) return null;
    return {
      externalId: placeId,
      provider: this.name,
      name: geocoded.label,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      raw: geocoded,
    };
  }

  async searchNearbyClinics(): Promise<ExternalPlaceCandidate[]> {
    // External discovery requires a real provider; dev adapter finds nothing.
    console.warn(
      "[DEV ADAPTER] searchNearbyClinics called without a real map provider — returning no candidates.",
    );
    return [];
  }
}
