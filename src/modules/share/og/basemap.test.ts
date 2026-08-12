// @vitest-environment node
// Reads the geometry asset from disk.

import { describe, expect, it } from "vitest";
import { loadPhOutline, ringsToPaths } from "./basemap";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  PH_BOUNDS,
  createProjector,
} from "./projection";

describe("loadPhOutline", () => {
  it("returns rings of coordinate pairs", async () => {
    const rings = await loadPhOutline();
    expect(rings.length).toBeGreaterThan(0);
    for (const ring of rings.slice(0, 5)) {
      expect(ring.length).toBeGreaterThanOrEqual(4);
      for (const point of ring.slice(0, 5)) {
        expect(point).toHaveLength(2);
        expect(typeof point[0]).toBe("number");
        expect(typeof point[1]).toBe("number");
      }
    }
  });

  it("returns coordinates inside the Philippines bounds", async () => {
    const rings = await loadPhOutline();
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        expect(lng).toBeGreaterThan(PH_BOUNDS.west - 1);
        expect(lng).toBeLessThan(PH_BOUNDS.east + 1);
        expect(lat).toBeGreaterThan(PH_BOUNDS.south - 1);
        expect(lat).toBeLessThan(PH_BOUNDS.north + 1);
      }
    }
  });

  it("kept the major islands and dropped the islet tail", async () => {
    const rings = await loadPhOutline();
    // ~7,600 islands upstream; -filter-islands min-area=10km2 leaves dozens.
    expect(rings.length).toBeLessThan(200);
    expect(rings.length).toBeGreaterThan(5);
  });

  it("caches the parse across calls", async () => {
    const first = await loadPhOutline();
    const second = await loadPhOutline();
    expect(second).toBe(first);
  });
});

describe("ringsToPaths", () => {
  const project = createProjector(PH_BOUNDS, CARD_WIDTH, CARD_HEIGHT);

  it("emits one closed path per ring", () => {
    const paths = ringsToPaths(
      [
        [
          [120, 14],
          [121, 14],
          [121, 15],
          [120, 14],
        ],
      ],
      project,
    );
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+)+Z$/);
  });

  it("drops rings with too few points to form an area", () => {
    expect(
      ringsToPaths(
        [
          [
            [120, 14],
            [121, 15],
          ],
        ],
        project,
      ),
    ).toEqual([]);
  });

  it("produces well-formed path data for the real outline", async () => {
    const paths = ringsToPaths(await loadPhOutline(), project);
    expect(paths.length).toBeGreaterThan(0);
    for (const d of paths) {
      expect(d.startsWith("M")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
      expect(d).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});
