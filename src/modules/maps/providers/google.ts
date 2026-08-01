import "server-only";
import { serverEnv } from "@/lib/env";
import type {
  AddressResult,
  ExternalPlaceCandidate,
  ExternalPlaceDetails,
  GeocodedLocation,
  LocationSuggestion,
  MapProvider,
  NearbyClinicSearchInput,
} from "../types";

const PLACES_BASE = "https://places.googleapis.com/v1";
const GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";

/**
 * Google Maps Platform provider (Places API v1 + Geocoding API).
 * Requires GOOGLE_MAPS_SERVER_API_KEY. Respects Google policy: results are
 * used for display/geocoding/discovery; discovered places are stored only as
 * external_place_candidates (place id + attribution) pending moderator review,
 * never as the permanent source of truth.
 */
export class GoogleMapsProvider implements MapProvider {
  readonly name = "google";

  private get apiKey(): string {
    const key = serverEnv().GOOGLE_MAPS_SERVER_API_KEY;
    if (!key) {
      throw new Error(
        "GoogleMapsProvider requires GOOGLE_MAPS_SERVER_API_KEY. " +
          "Unset it to fall back to the dev map adapter.",
      );
    }
    return key;
  }

  async autocompleteLocation(query: string): Promise<LocationSuggestion[]> {
    if (query.trim().length < 2) return [];
    const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
      },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ["ph"],
        includedPrimaryTypes: ["locality", "sublocality", "administrative_area_level_1", "administrative_area_level_2", "postal_code"],
      }),
    });
    if (!res.ok) {
      throw new Error(`Google autocomplete failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId: string;
          text?: { text?: string };
        };
      }>;
    };
    return (json.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({
        placeId: p.placeId,
        label: p.text?.text ?? p.placeId,
      }));
  }

  async geocodePlace(placeId: string): Promise<GeocodedLocation | null> {
    const res = await fetch(
      `${PLACES_BASE}/places/${encodeURIComponent(placeId)}?fields=location,displayName`,
      { headers: { "X-Goog-Api-Key": this.apiKey } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      location?: { latitude: number; longitude: number };
      displayName?: { text?: string };
    };
    if (!json.location) return null;
    return {
      label: json.displayName?.text ?? placeId,
      latitude: json.location.latitude,
      longitude: json.location.longitude,
    };
  }

  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<AddressResult | null> {
    const url = new URL(GEOCODE_BASE);
    url.searchParams.set("latlng", `${latitude},${longitude}`);
    url.searchParams.set("key", this.apiKey);
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{
        formatted_address: string;
        address_components?: Array<{ long_name: string; types: string[] }>;
      }>;
    };
    const first = json.results?.[0];
    if (!first) return null;
    const component = (type: string) =>
      first.address_components?.find((c) => c.types.includes(type))?.long_name;
    return {
      formattedAddress: first.formatted_address,
      city: component("locality"),
      province: component("administrative_area_level_2") ?? component("administrative_area_level_1"),
      countryCode: "PH",
    };
  }

  async getPlaceDetails(placeId: string): Promise<ExternalPlaceDetails | null> {
    const res = await fetch(
      `${PLACES_BASE}/places/${encodeURIComponent(placeId)}?fields=id,displayName,formattedAddress,location,internationalPhoneNumber,websiteUri`,
      { headers: { "X-Goog-Api-Key": this.apiKey } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
      internationalPhoneNumber?: string;
      websiteUri?: string;
    };
    return {
      externalId: json.id,
      provider: this.name,
      name: json.displayName?.text ?? json.id,
      formattedAddress: json.formattedAddress,
      latitude: json.location?.latitude,
      longitude: json.location?.longitude,
      phone: json.internationalPhoneNumber,
      website: json.websiteUri,
      raw: json,
    };
  }

  async searchNearbyClinics(
    input: NearbyClinicSearchInput,
  ): Promise<ExternalPlaceCandidate[]> {
    const res = await fetch(`${PLACES_BASE}/places:searchNearby`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        includedTypes: ["physiotherapist", "speech_pathologist", "child_care_agency", "doctor"],
        locationRestriction: {
          circle: {
            center: { latitude: input.latitude, longitude: input.longitude },
            radius: input.radiusMeters,
          },
        },
        maxResultCount: 20,
      }),
    });
    if (!res.ok) {
      throw new Error(`Google nearby search failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      places?: Array<{
        id: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude: number; longitude: number };
      }>;
    };
    return (json.places ?? []).map((p) => ({
      externalId: p.id,
      provider: this.name,
      name: p.displayName?.text ?? p.id,
      formattedAddress: p.formattedAddress,
      latitude: p.location?.latitude,
      longitude: p.location?.longitude,
      raw: p,
    }));
  }
}
