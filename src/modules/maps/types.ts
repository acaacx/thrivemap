/**
 * Map-provider abstraction. Application code depends on these types only —
 * never on Google Maps SDK objects — so the provider can be swapped for
 * Mapbox or an OpenStreetMap-based stack later.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface LocationSuggestion {
  /** Provider-scoped opaque id ("dev:<uuid>" or a Google place_id). */
  placeId: string;
  label: string;
  kind?: "province" | "city" | "municipality" | "barangay" | "address" | "poi";
}

export interface GeocodedLocation extends LatLng {
  label: string;
  provinceSlug?: string;
  citySlug?: string;
}

export interface AddressResult {
  formattedAddress: string;
  city?: string;
  province?: string;
  countryCode?: string;
}

export interface ExternalPlaceDetails {
  externalId: string;
  provider: string;
  name: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  raw: unknown;
}

export interface NearbyClinicSearchInput extends LatLng {
  radiusMeters: number;
  keyword?: string;
}

export interface ExternalPlaceCandidate {
  externalId: string;
  provider: string;
  name: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  raw: unknown;
}

export interface MapProvider {
  readonly name: string;
  autocompleteLocation(query: string): Promise<LocationSuggestion[]>;
  geocodePlace(placeId: string): Promise<GeocodedLocation | null>;
  reverseGeocode(latitude: number, longitude: number): Promise<AddressResult | null>;
  getPlaceDetails(placeId: string): Promise<ExternalPlaceDetails | null>;
  /** Discovery of potential clinic records — approved admin workflows only. */
  searchNearbyClinics(input: NearbyClinicSearchInput): Promise<ExternalPlaceCandidate[]>;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}
