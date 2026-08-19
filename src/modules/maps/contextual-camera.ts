const CONTEXTUAL_CLINIC_ZOOM = 11;

/**
 * A selected clinic should read as a local preview, not remain framed at a
 * country-wide zoom. Preserve any closer camera the visitor chose manually.
 */
export function contextualSelectionZoom(currentZoom: number): number {
  return Math.max(currentZoom, CONTEXTUAL_CLINIC_ZOOM);
}
