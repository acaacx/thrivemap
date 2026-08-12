/**
 * Web Mercator projection for the OG card. Matches the MapLibre map the card
 * depicts, so the country silhouette is the one users already know. Land
 * geometry and pins pass through the same transform, which is the whole reason
 * the basemap is inline SVG rather than an opaque image.
 *
 * Pure module — no I/O, no dependencies. d3-geo would be a dependency for
 * fifteen lines of arithmetic.
 */

export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Cluster {
  x: number;
  y: number;
  count: number;
}

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** Philippines bounding box. The maximum span any card may show. */
export const PH_BOUNDS: BBox = {
  north: 21.5,
  south: 4.2,
  east: 127.0,
  west: 116.7,
};

/**
 * Smallest span a card may zoom to. Without it a single result fills the frame
 * with one street and no recognisable landmass — roughly 66km, enough that a
 * coastline is visible.
 */
export const MIN_SPAN_DEG = 0.6;

/** Mercator latitude, normalised so the maths stays in degree-ish units. */
function mercatorY(latDeg: number): number {
  // Clamp before tan() — the poles are infinite and a hostile param can ask.
  const lat = Math.max(-85.05, Math.min(85.05, latDeg));
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

/** Grows a box by `ratio` of its span on each axis, keeping the centre. */
export function padBBox(box: BBox, ratio: number): BBox {
  const padLat = (box.north - box.south) * ratio;
  const padLng = (box.east - box.west) * ratio;
  return {
    north: box.north + padLat,
    south: box.south - padLat,
    east: box.east + padLng,
    west: box.west - padLng,
  };
}

/**
 * Enforces the minimum span, then the maximum. Order matters: a degenerate box
 * must grow before it can be tested against the country bounds, and the final
 * clamp is what stops a hostile param from rendering the globe.
 */
export function clampBBox(box: BBox): BBox {
  let { north, south, east, west } = box;

  const latSpan = north - south;
  if (latSpan < MIN_SPAN_DEG) {
    const centre = (north + south) / 2;
    north = centre + MIN_SPAN_DEG / 2;
    south = centre - MIN_SPAN_DEG / 2;
  }

  const lngSpan = east - west;
  if (lngSpan < MIN_SPAN_DEG) {
    const centre = (east + west) / 2;
    east = centre + MIN_SPAN_DEG / 2;
    west = centre - MIN_SPAN_DEG / 2;
  }

  return {
    north: Math.min(north, PH_BOUNDS.north),
    south: Math.max(south, PH_BOUNDS.south),
    east: Math.min(east, PH_BOUNDS.east),
    west: Math.max(west, PH_BOUNDS.west),
  };
}

/**
 * Expands a box so its projected aspect ratio matches the viewport. Only ever
 * grows — shrinking would crop results the card promised to show.
 */
export function fitBBox(box: BBox, width: number, height: number): BBox {
  const lngSpanDeg = box.east - box.west;
  // mercatorY() works in radians internally, so a raw-degree longitude span
  // is not comparable to it — comparing them directly picks the wrong branch
  // below (off by the exact π/180 factor). Convert once, here, and do the
  // aspect maths in this shared unit; only degrees ever reach the returned
  // BBox. Do not "simplify" this back to raw degrees.
  const lngSpan = (lngSpanDeg * Math.PI) / 180;
  const ySpan = mercatorY(box.north) - mercatorY(box.south);
  if (lngSpanDeg <= 0 || ySpan <= 0) return box;

  const boxAspect = lngSpan / ySpan;
  const viewAspect = width / height;

  if (boxAspect < viewAspect) {
    // Too tall: widen. Target span is computed in the shared unit, then
    // converted back to degrees before touching east/west.
    const target = ySpan * viewAspect;
    const targetDeg = (target * 180) / Math.PI;
    const centre = (box.east + box.west) / 2;
    return {
      ...box,
      east: centre + targetDeg / 2,
      west: centre - targetDeg / 2,
    };
  }

  // Too wide: heighten, in Mercator space so the growth is symmetric on screen.
  const targetY = lngSpan / viewAspect;
  const centreY = (mercatorY(box.north) + mercatorY(box.south)) / 2;
  const toLat = (y: number) =>
    ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
  return {
    ...box,
    north: toLat(centreY + targetY / 2),
    south: toLat(centreY - targetY / 2),
  };
}

/** Returns a lng/lat → pixel function for the given box and viewport. */
export function createProjector(
  box: BBox,
  width: number,
  height: number,
): (lng: number, lat: number) => Point {
  const lngSpan = box.east - box.west || 1e-9;
  const yNorth = mercatorY(box.north);
  const ySpan = yNorth - mercatorY(box.south) || 1e-9;

  return (lng, lat) => ({
    x: ((lng - box.west) / lngSpan) * width,
    y: ((yNorth - mercatorY(lat)) / ySpan) * height,
  });
}

/**
 * Greedy single-pass clustering in pixel space. At PH-wide zoom, Metro Manila
 * is a solid blob of overlapping circles; collapsing them keeps the pins
 * countable. The caption always reports pins *found*, never circles *drawn* —
 * see og/label.ts.
 */
export function clusterPins(points: Point[], minDistancePx: number): Cluster[] {
  const clusters: Cluster[] = [];
  const threshold = minDistancePx * minDistancePx;

  for (const point of points) {
    const near = clusters.find((c) => {
      const dx = c.x - point.x;
      const dy = c.y - point.y;
      return dx * dx + dy * dy < threshold;
    });
    if (near) {
      // Running mean, so the cluster sits at the centroid of its members.
      near.x = (near.x * near.count + point.x) / (near.count + 1);
      near.y = (near.y * near.count + point.y) / (near.count + 1);
      near.count += 1;
    } else {
      clusters.push({ x: point.x, y: point.y, count: 1 });
    }
  }

  return clusters;
}
