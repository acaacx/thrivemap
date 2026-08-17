import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Point } from "./projection";

/**
 * Philippines outline for the OG card. Natural Earth 1:10m admin-0, public
 * domain, simplified at build time — see assets/README.md.
 *
 * Plain GeoJSON rather than TopoJSON: the shared-arc win applies to adjacent
 * polygons, which a single dissolved outline does not have, and TopoJSON would
 * cost a topojson-client dependency plus a decode on every cold start.
 * Revisit only if the asset ever passes ~50KB gzip.
 */

interface GeoJsonFeatureCollection {
  features: Array<{
    geometry:
      | { type: "Polygon"; coordinates: number[][][] }
      | { type: "MultiPolygon"; coordinates: number[][][][] };
  }>;
}

/**
 * Read once per process. This path is dynamic, so the asset only reaches the
 * serverless bundle via outputFileTracingIncludes in next.config.ts.
 */
let cached: Promise<number[][][]> | undefined;

export function loadPhOutline(): Promise<number[][][]> {
  cached ??= (async () => {
    const raw = await readFile(
      join(process.cwd(), "assets/geo/ph-outline.geojson"),
      "utf8",
    );
    const geo = JSON.parse(raw) as GeoJsonFeatureCollection;

    const rings: number[][][] = [];
    for (const feature of geo.features) {
      const polygons =
        feature.geometry.type === "MultiPolygon"
          ? feature.geometry.coordinates
          : [feature.geometry.coordinates];
      for (const polygon of polygons) {
        // Only the outer ring of each polygon: the interior rings are lakes,
        // and at this scale on a card behind a text plate they are noise.
        const outer = polygon[0];
        if (outer) rings.push(outer);
      }
    }
    return rings;
  })();
  return cached;
}

/** Test seam — the module-scope cache would otherwise leak between tests. */
export function resetOutlineCacheForTesting(): void {
  cached = undefined;
}

/** Projects rings to SVG path `d` strings. */
export function ringsToPaths(
  rings: number[][][],
  project: (lng: number, lat: number) => Point,
): string[] {
  const paths: string[] = [];

  for (const ring of rings) {
    // Fewer than three points cannot enclose an area.
    if (ring.length < 3) continue;

    let d = "";
    let valid = true;
    for (let i = 0; i < ring.length; i++) {
      const pair = ring[i];
      if (!pair || pair.length < 2) {
        valid = false;
        break;
      }
      const { x, y } = project(pair[0]!, pair[1]!);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        valid = false;
        break;
      }
      // One decimal is sub-pixel at 1200px wide and keeps the path short —
      // path length is what resvg's rasteriser pays for.
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    if (valid && d) paths.push(`${d}Z`);
  }

  return paths;
}
