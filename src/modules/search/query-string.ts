import type { SearchParams } from "./schemas";

/** Serialise validated search params back into the /clinics query string. */
export function paramsToQueryString(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.lat != null) qs.set("lat", params.lat.toFixed(5));
  if (params.lng != null) qs.set("lng", params.lng.toFixed(5));
  if (params.radius !== 10) qs.set("radius", String(params.radius));
  if (params.north != null) qs.set("north", params.north.toFixed(5));
  if (params.south != null) qs.set("south", params.south.toFixed(5));
  if (params.east != null) qs.set("east", params.east.toFixed(5));
  if (params.west != null) qs.set("west", params.west.toFixed(5));
  if (params.services?.length) qs.set("services", params.services.join(","));
  if (params.ages?.length) qs.set("ages", params.ages.join(","));
  if (params.verified) qs.set("verified", "1");
  if (params.online) qs.set("online", "1");
  if (params.inperson) qs.set("inperson", "1");
  if (params.open) qs.set("open", "1");
  if (params.accessible) qs.set("accessible", "1");
  if (params.sort !== "nearest") qs.set("sort", params.sort);
  if (params.loc) qs.set("loc", params.loc);
  return qs.toString();
}

/**
 * True once the visitor has said *anything* about what they are looking for
 * (a place, a service, a filter, a sort). False = the shell shows the
 * "Where are you looking for support?" prompt instead of a result list.
 */
export function hasSearchIntent(params: SearchParams): boolean {
  return paramsToQueryString(params) !== "";
}

/**
 * Identifies "a new search" for the map camera: the map re-frames its
 * results only when this changes, never on selection or filter tweaks.
 * A bounds search ("Search this area") returns `null` — the visitor already
 * framed the map themselves, so the camera must not move.
 */
export function cameraKey(params: SearchParams): string | null {
  if (params.north != null) return null;
  return [
    params.lat?.toFixed(5) ?? "",
    params.lng?.toFixed(5) ?? "",
    params.q ?? "",
    params.loc ?? "",
    params.radius,
  ].join("|");
}

/** The shell always writes its state to /clinics so links stay canonical. */
export const SHELL_PATH = "/clinics";

/**
 * Full shell URL: search params + optional `view` (mobile List | Map) and
 * `sel` (selected clinic). Both are UI state that a shared link should
 * restore; neither affects the search itself.
 */
export function buildShellUrl(args: {
  params: SearchParams;
  view?: "list" | "map" | null;
  selectedId?: string | null;
}): string {
  const qs = new URLSearchParams(paramsToQueryString(args.params));
  if (args.view) qs.set("view", args.view);
  if (args.selectedId) qs.set("sel", args.selectedId);
  const query = qs.toString();
  return query ? `${SHELL_PATH}?${query}` : SHELL_PATH;
}
