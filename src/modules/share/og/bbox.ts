import { getMapClinics, type MapClinicRow } from "@/modules/clinics/queries";
import type { SearchParams } from "@/modules/search/schemas";
import { type BBox, PH_BOUNDS, clampBBox, padBBox } from "./projection";

/**
 * Resolves the params of a /clinics URL into the bbox and pins the card draws.
 *
 * get_map_clinics caps at least(coalesce(p_limit, 400), 1000)
 * (supabase/migrations/20260801000005_search.sql:301). getMapClinics passes no
 * limit, so 400 is the ceiling and a full page means "at least this many".
 */
export const MAP_CLINIC_CAP = 400;

/** Fraction of the span added around the pins so nothing sits on the edge. */
const PAD_RATIO = 0.12;

export interface CardData {
  bbox: BBox;
  pins: MapClinicRow[];
  atCap: boolean;
}

/** Degrees of latitude per kilometre. Close enough for a preview image. */
const KM_PER_DEG_LAT = 110.574;

function bboxFromCircle(lat: number, lng: number, radiusKm: number): BBox {
  const latDelta = radiusKm / KM_PER_DEG_LAT;
  // Longitude degrees shrink toward the poles; guard the cos() near them.
  const lngDelta =
    radiusKm / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    north: lat + latDelta,
    south: lat - latDelta,
    east: lng + lngDelta,
    west: lng - lngDelta,
  };
}

function bboxFromPins(pins: MapClinicRow[]): BBox | null {
  if (pins.length === 0) return null;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const p of pins) {
    north = Math.max(north, p.latitude);
    south = Math.min(south, p.latitude);
    east = Math.max(east, p.longitude);
    west = Math.min(west, p.longitude);
  }
  return { north, south, east, west };
}

function hasExplicitBounds(
  params: SearchParams,
): params is SearchParams &
  Record<"north" | "south" | "east" | "west", number> {
  return (
    params.north != null &&
    params.south != null &&
    params.east != null &&
    params.west != null
  );
}

function filtersFrom(params: SearchParams) {
  return {
    services: params.services?.length ? params.services : undefined,
    verifiedOnly: params.verified ?? false,
  };
}

/**
 * The derivation ladder. First match wins:
 *
 *  1. north/south/east/west present → use directly (a link shared after panning)
 *  2. lat/lng + radius → the bbox of that circle
 *  3. neither → query PH-wide, then refit to the pins that came back
 *  4. no pins → null, and the caller renders the fallback card
 *
 * Throws if getMapClinics throws — the route catches and falls back.
 */
export async function resolveCardData(
  params: SearchParams,
): Promise<CardData | null> {
  const filters = filtersFrom(params);

  let bbox: BBox;
  let refit = false;

  if (hasExplicitBounds(params)) {
    bbox = clampBBox({
      north: params.north,
      south: params.south,
      east: params.east,
      west: params.west,
    });
  } else if (params.lat != null && params.lng != null) {
    bbox = clampBBox(
      padBBox(bboxFromCircle(params.lat, params.lng, params.radius), PAD_RATIO),
    );
  } else {
    bbox = PH_BOUNDS;
    refit = true;
  }

  const pins = await getMapClinics({ ...bbox, ...filters });
  if (pins.length === 0) return null;

  if (!refit) {
    return { bbox, pins, atCap: pins.length >= MAP_CLINIC_CAP };
  }

  // Country-wide: tighten onto where the results actually are.
  const fitted = bboxFromPins(pins);
  if (!fitted) return null;
  const tightened = clampBBox(padBBox(fitted, PAD_RATIO));

  // Re-query so the pin set matches the frame — the first query's pins may
  // include outliers the tightened box excludes, and drawing a pin outside the
  // frame is worse than one extra cached call.
  const refitted = await getMapClinics({ ...tightened, ...filters });
  const finalPins = refitted.length > 0 ? refitted : pins;

  return {
    bbox: tightened,
    pins: finalPins,
    atCap: finalPins.length >= MAP_CLINIC_CAP,
  };
}
