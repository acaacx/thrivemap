import type { SheetSnap } from "./search-ui-context";

/**
 * Where the visitor was in the results before opening a clinic, so Back
 * returns them to the same map, scroll position, sheet height and
 * selection. The URL already carries the search itself (filters, place,
 * `view=`, `sel=`); this only keeps the ephemeral UI state, and only for
 * the current tab (sessionStorage).
 */
export const SNAPSHOT_KEY = "tm-search-snapshot";

export interface SearchSnapshot {
  /** Full shell URL (`/clinics?...`) the snapshot belongs to. */
  url: string;
  listScrollTop: number;
  mapCenter: { latitude: number; longitude: number } | null;
  mapZoom: number | null;
  sheetSnap: SheetSnap;
  selectedId: string | null;
}

const SNAPS: SheetSnap[] = ["collapsed", "mid", "expanded"];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Validates a stored value; anything malformed → null (never throws). */
export function parseSnapshot(
  raw: string | null | undefined,
): SearchSnapshot | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.url !== "string") return null;
  const center = v.mapCenter as Record<string, unknown> | null | undefined;
  const mapCenter =
    center &&
    typeof center === "object" &&
    isFiniteNumber(center.latitude) &&
    isFiniteNumber(center.longitude)
      ? { latitude: center.latitude, longitude: center.longitude }
      : null;
  return {
    url: v.url,
    listScrollTop: isFiniteNumber(v.listScrollTop)
      ? Math.max(0, v.listScrollTop)
      : 0,
    mapCenter,
    mapZoom: isFiniteNumber(v.mapZoom) ? v.mapZoom : null,
    sheetSnap: SNAPS.includes(v.sheetSnap as SheetSnap)
      ? (v.sheetSnap as SheetSnap)
      : "collapsed",
    selectedId: typeof v.selectedId === "string" ? v.selectedId : null,
  };
}

/** The query string of a shell URL — what a snapshot is keyed on. */
export function snapshotSearch(url: string): string {
  const index = url.indexOf("?");
  const search = index === -1 ? "" : url.slice(index);
  return search === "?" ? "" : search;
}

/**
 * A snapshot applies when the page's query string equals the one it was
 * taken from (path is ignored: `/` and `/clinics` render the same shell).
 */
export function snapshotMatches(
  snapshot: SearchSnapshot | null,
  locationSearch: string,
): snapshot is SearchSnapshot {
  if (!snapshot) return false;
  return (
    snapshotSearch(snapshot.url) ===
    (locationSearch === "?" ? "" : locationSearch)
  );
}

export function readSnapshot(): SearchSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    return parseSnapshot(window.sessionStorage.getItem(SNAPSHOT_KEY));
  } catch {
    return null;
  }
}

/** The snapshot for the current page, or null. */
export function readMatchingSnapshot(
  locationSearch: string = typeof window === "undefined"
    ? ""
    : window.location.search,
): SearchSnapshot | null {
  const snapshot = readSnapshot();
  return snapshotMatches(snapshot, locationSearch) ? snapshot : null;
}

export function writeSnapshot(snapshot: SearchSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Private mode / quota: Back still restores the URL state.
  }
}

export function clearSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}

/**
 * The search origin (`lat`/`lng`) of a snapshot URL — lets the clinic page
 * say how far the clinic is from where the visitor searched.
 */
export function snapshotOrigin(
  snapshot: SearchSnapshot | null,
): { latitude: number; longitude: number } | null {
  if (!snapshot) return null;
  const qs = new URLSearchParams(snapshotSearch(snapshot.url));
  const lat = Number.parseFloat(qs.get("lat") ?? "");
  const lng = Number.parseFloat(qs.get("lng") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

/** Great-circle distance in km (haversine). */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
