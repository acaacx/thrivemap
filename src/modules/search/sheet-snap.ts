import type { SheetSnap } from "./search-ui-context";

/** Collapsed peek: handle + results header + the top of the first card. */
export const SHEET_COLLAPSED_PX = 120;
const MID_RATIO = 0.5;
const EXPANDED_RATIO = 0.92;
/** Velocity (px/s) above which a release follows the fling direction. */
const FLING_VELOCITY = 500;

export type SnapHeights = Record<SheetSnap, number>;

export const SNAP_ORDER: SheetSnap[] = ["collapsed", "mid", "expanded"];

/** Pixel heights of each snap for a container `containerHeight` tall. */
export function snapHeights(containerHeight: number): SnapHeights {
  const expanded = Math.max(0, Math.round(containerHeight * EXPANDED_RATIO));
  const mid = Math.min(expanded, Math.round(containerHeight * MID_RATIO));
  const collapsed = Math.min(mid, SHEET_COLLAPSED_PX);
  return { collapsed, mid, expanded };
}

/**
 * Where a released sheet should settle: the nearest snap, or — when the
 * pointer was moving fast — the next snap in the fling direction. Positive
 * velocity = sheet growing (finger moving up).
 */
export function resolveSnap(
  height: number,
  velocity: number,
  heights: SnapHeights,
): SheetSnap {
  const nearest = SNAP_ORDER.reduce((best, snap) =>
    Math.abs(heights[snap] - height) < Math.abs(heights[best] - height)
      ? snap
      : best,
  );
  if (Math.abs(velocity) < FLING_VELOCITY) return nearest;
  const direction = velocity > 0 ? "up" : "down";
  // From the nearest snap, step once in the fling direction — but only if
  // the sheet is on that side of the nearest snap (or already past it).
  const nearestH = heights[nearest];
  if (direction === "up" && height >= nearestH) return nextSnap(nearest, "up");
  if (direction === "down" && height <= nearestH) {
    return nextSnap(nearest, "down");
  }
  return nearest;
}

export function nextSnap(snap: SheetSnap, direction: "up" | "down"): SheetSnap {
  const index = SNAP_ORDER.indexOf(snap);
  const next = direction === "up" ? index + 1 : index - 1;
  return SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, Math.max(0, next))];
}
