/**
 * Safe-area layout for the OG card. The caption plate (bottom-left) and the
 * wordmark (top-left) sit on top of the map, so a naive aspect fit can bury a
 * pin under them — on the PH-wide card, Davao. This module owns the geometry
 * of those overlays and moves the map so pins stay visible:
 *
 *  1. plain aspect fit — if no pin lands under an overlay, done
 *  2. pan the map right or up (whichever moves less) so every pin clears the
 *     overlays without leaving the card — scale unchanged, so the composition
 *     is what the user's map showed, just shifted
 *  3. otherwise zoom out: fit the pins into the free band between the wordmark
 *     and the plate, then widen the box to cover the whole card
 *
 * Pure module. The rects here are the single source of truth for card.tsx's
 * overlay positions.
 */

import {
  type BBox,
  CARD_HEIGHT,
  CARD_WIDTH,
  type Point,
  createProjector,
  fitBBox,
  latFromMercatorY,
  mercatorY,
} from "./projection";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Caption plate. maxHeight covers a two-line headline plus the count line. */
export const PLATE = {
  left: 56,
  bottom: 56,
  maxWidth: 880,
  maxHeight: 240,
} as const;

/** Wordmark pill. width is a ceiling for the rendered text plus padding. */
export const WORDMARK = { left: 56, top: 48, width: 200, height: 52 } as const;

export const PLATE_RECT: Rect = {
  left: PLATE.left,
  top: CARD_HEIGHT - PLATE.bottom - PLATE.maxHeight,
  right: PLATE.left + PLATE.maxWidth,
  bottom: CARD_HEIGHT - PLATE.bottom,
};

export const WORDMARK_RECT: Rect = {
  left: WORDMARK.left,
  top: WORDMARK.top,
  right: WORDMARK.left + WORDMARK.width,
  bottom: WORDMARK.top + WORDMARK.height,
};

const OBSTACLES: readonly Rect[] = [PLATE_RECT, WORDMARK_RECT];

/** Largest pin radius (18) + stroke, so a pin's edge clears the overlay too. */
export const PIN_CLEARANCE = 20;

/** Pins keep at least this far from the card edge. */
export const EDGE_MARGIN = 28;

export function inflateRect(r: Rect, by: number): Rect {
  return {
    left: r.left - by,
    top: r.top - by,
    right: r.right + by,
    bottom: r.bottom + by,
  };
}

/**
 * Strict interior with a hair of tolerance — a point on the edge is outside,
 * so a pan that lands a pin exactly on the clearance boundary counts as clear
 * even after a round trip through Mercator arithmetic.
 */
export function pointInRect(p: Point, r: Rect): boolean {
  const eps = 1e-6;
  return (
    p.x > r.left + eps &&
    p.x < r.right - eps &&
    p.y > r.top + eps &&
    p.y < r.bottom - eps
  );
}

interface LngLat {
  lng: number;
  lat: number;
}

function isClear(points: Point[], zones: Rect[]): boolean {
  return points.every((p) => zones.every((z) => !pointInRect(p, z)));
}

function withinEdges(points: Point[], width: number, height: number): boolean {
  const eps = 1e-6;
  return points.every(
    (p) =>
      p.x >= EDGE_MARGIN - eps &&
      p.x <= width - EDGE_MARGIN + eps &&
      p.y >= EDGE_MARGIN - eps &&
      p.y <= height - EDGE_MARGIN + eps,
  );
}

/** Shifts the box so map content moves `dx` px right and `dy` px up. */
function panBBox(
  box: BBox,
  dx: number,
  dy: number,
  width: number,
  height: number,
): BBox {
  const lngPerPx = (box.east - box.west) / width;
  const yNorth = mercatorY(box.north);
  const ySouth = mercatorY(box.south);
  const yPerPx = (yNorth - ySouth) / height;
  // Content right = box west; content up = box south (screen y grows down).
  return {
    west: box.west - dx * lngPerPx,
    east: box.east - dx * lngPerPx,
    north: latFromMercatorY(yNorth - dy * yPerPx),
    south: latFromMercatorY(ySouth - dy * yPerPx),
  };
}

/**
 * Fits `box` into `rect` (a sub-viewport in pixels), then extends it so the
 * result covers the full `width`×`height` card with the same scale.
 */
function fitBBoxInto(
  box: BBox,
  rect: Rect,
  width: number,
  height: number,
): BBox {
  const rw = rect.right - rect.left;
  const rh = rect.bottom - rect.top;
  const inner = fitBBox(box, rw, rh);
  const lngPerPx = (inner.east - inner.west) / rw;
  const yNorth = mercatorY(inner.north);
  const ySouth = mercatorY(inner.south);
  const yPerPx = (yNorth - ySouth) / rh;
  return {
    west: inner.west - lngPerPx * rect.left,
    east: inner.east + lngPerPx * (width - rect.right),
    north: latFromMercatorY(yNorth + yPerPx * rect.top),
    south: latFromMercatorY(ySouth - yPerPx * (height - rect.bottom)),
  };
}

/**
 * Aspect-fits `box` to the card, then moves the map as little as possible so
 * no pin is hidden under the caption plate or wordmark. See module docs.
 */
export function layoutBBox(
  box: BBox,
  pins: readonly LngLat[],
  width: number = CARD_WIDTH,
  height: number = CARD_HEIGHT,
  obstacles: readonly Rect[] = OBSTACLES,
): BBox {
  const fitted = fitBBox(box, width, height);
  if (pins.length === 0) return fitted;

  const zones = obstacles.map((r) => inflateRect(r, PIN_CLEARANCE));
  const project = createProjector(fitted, width, height);
  const points = pins.map((p) => project(p.lng, p.lat));
  if (isClear(points, zones)) return fitted;

  // Smallest rightward shift that takes every pin in an obstacle's row band
  // past that obstacle's right edge; likewise the smallest upward shift that
  // lifts every pin in an obstacle's column band above its top edge.
  let dx = 0;
  let dy = 0;
  for (const z of zones) {
    for (const p of points) {
      if (p.y >= z.top && p.y <= z.bottom) dx = Math.max(dx, z.right - p.x);
      if (p.x >= z.left && p.x <= z.right) dy = Math.max(dy, p.y - z.top);
    }
  }

  const candidates: { cost: number; box: BBox }[] = [];
  for (const [sx, sy] of [
    [dx, 0],
    [0, dy],
  ] as const) {
    if (sx === 0 && sy === 0) continue;
    const moved = points.map((p) => ({ x: p.x + sx, y: p.y - sy }));
    if (withinEdges(moved, width, height) && isClear(moved, zones)) {
      candidates.push({
        cost: sx + sy,
        box: panBBox(fitted, sx, sy, width, height),
      });
    }
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.cost - b.cost);
    return candidates[0].box;
  }

  // Zoom out into the free band: full width, between wordmark and plate.
  const band: Rect = {
    left: EDGE_MARGIN,
    right: width - EDGE_MARGIN,
    top: Math.max(EDGE_MARGIN, WORDMARK_RECT.bottom + PIN_CLEARANCE),
    bottom: Math.min(height - EDGE_MARGIN, PLATE_RECT.top - PIN_CLEARANCE),
  };
  return fitBBoxInto(box, band, width, height);
}
