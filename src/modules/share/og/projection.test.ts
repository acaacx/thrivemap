import { describe, expect, it } from "vitest";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  PH_BOUNDS,
  clampBBox,
  clusterPins,
  createProjector,
  fitBBox,
  padBBox,
} from "./projection";

describe("createProjector", () => {
  it("maps the bbox corners to the viewport corners", () => {
    const project = createProjector(PH_BOUNDS, CARD_WIDTH, CARD_HEIGHT);
    const topLeft = project(PH_BOUNDS.west, PH_BOUNDS.north);
    const bottomRight = project(PH_BOUNDS.east, PH_BOUNDS.south);
    expect(topLeft.x).toBeCloseTo(0, 5);
    expect(topLeft.y).toBeCloseTo(0, 5);
    expect(bottomRight.x).toBeCloseTo(CARD_WIDTH, 5);
    expect(bottomRight.y).toBeCloseTo(CARD_HEIGHT, 5);
  });

  it("puts every corner of the PH bounds inside the viewport", () => {
    const project = createProjector(PH_BOUNDS, CARD_WIDTH, CARD_HEIGHT);
    const corners = [
      [PH_BOUNDS.west, PH_BOUNDS.north],
      [PH_BOUNDS.east, PH_BOUNDS.north],
      [PH_BOUNDS.west, PH_BOUNDS.south],
      [PH_BOUNDS.east, PH_BOUNDS.south],
    ] as const;
    for (const [lng, lat] of corners) {
      const p = project(lng, lat);
      expect(p.x).toBeGreaterThanOrEqual(-0.001);
      expect(p.x).toBeLessThanOrEqual(CARD_WIDTH + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(-0.001);
      expect(p.y).toBeLessThanOrEqual(CARD_HEIGHT + 0.001);
    }
  });

  it("is Mercator, not linear, in latitude", () => {
    // Mercator stretches toward the poles, so the northern half of a
    // symmetric box occupies fewer pixels than the southern half.
    const box = { north: 20, south: 0, east: 10, west: 0 };
    const project = createProjector(box, 100, 100);
    const middle = project(0, 10);
    expect(middle.y).toBeGreaterThan(50);
  });

  it("increases x with longitude and decreases y with latitude", () => {
    const project = createProjector(PH_BOUNDS, CARD_WIDTH, CARD_HEIGHT);
    expect(project(122, 12).x).toBeGreaterThan(project(118, 12).x);
    expect(project(122, 16).y).toBeLessThan(project(122, 8).y);
  });
});

describe("padBBox", () => {
  it("grows the box by the ratio on each axis", () => {
    const padded = padBBox({ north: 11, south: 9, east: 11, west: 9 }, 0.1);
    expect(padded.north).toBeCloseTo(11.2, 5);
    expect(padded.south).toBeCloseTo(8.8, 5);
    expect(padded.east).toBeCloseTo(11.2, 5);
    expect(padded.west).toBeCloseTo(8.8, 5);
  });
});

describe("clampBBox", () => {
  it("expands a degenerate box to the minimum span", () => {
    const clamped = clampBBox({
      north: 14.5,
      south: 14.5,
      east: 121,
      west: 121,
    });
    expect(clamped.north - clamped.south).toBeGreaterThanOrEqual(0.6);
    // Float rounding: 121 ± 0.3 doesn't add back to exactly 0.6 in IEEE754.
    expect(clamped.east - clamped.west).toBeGreaterThanOrEqual(0.6 - 1e-9);
  });

  it("keeps the centre when expanding to the minimum span", () => {
    const clamped = clampBBox({
      north: 14.5,
      south: 14.5,
      east: 121,
      west: 121,
    });
    expect((clamped.north + clamped.south) / 2).toBeCloseTo(14.5, 5);
    expect((clamped.east + clamped.west) / 2).toBeCloseTo(121, 5);
  });

  it("clamps a hostile world-spanning box to the PH bounds", () => {
    const clamped = clampBBox({
      north: 85,
      south: -85,
      east: 179,
      west: -179,
    });
    expect(clamped.north).toBeLessThanOrEqual(PH_BOUNDS.north);
    expect(clamped.south).toBeGreaterThanOrEqual(PH_BOUNDS.south);
    expect(clamped.east).toBeLessThanOrEqual(PH_BOUNDS.east);
    expect(clamped.west).toBeGreaterThanOrEqual(PH_BOUNDS.west);
  });

  it("leaves a sane box alone", () => {
    const box = { north: 15, south: 14, east: 121.5, west: 120.5 };
    expect(clampBBox(box)).toEqual(box);
  });
});

describe("fitBBox", () => {
  it("widens a tall box to the viewport aspect ratio", () => {
    const fitted = fitBBox(
      { north: 15, south: 13, east: 121, west: 120.9 },
      CARD_WIDTH,
      CARD_HEIGHT,
    );
    // Only grows — the requested area must stay visible.
    expect(fitted.east - fitted.west).toBeGreaterThan(0.1);
    expect(fitted.north).toBeCloseTo(15, 5);
    expect(fitted.south).toBeCloseTo(13, 5);
  });

  it("produces a box that projects without distortion", () => {
    const fitted = fitBBox(
      { north: 15, south: 13, east: 121, west: 120.9 },
      CARD_WIDTH,
      CARD_HEIGHT,
    );
    // createProjector always maps whatever box it's given onto the full
    // viewport, so checking that the fitted box's own corners land on the
    // viewport corners is true of ANY box and proves nothing about
    // distortion. Distortion-free means equal scale (pixels per Mercator
    // unit) on both axes, so verify that independently of the module under
    // test — in the same Mercator/radian unit as latitude, not raw degrees,
    // since raw-degree-vs-Mercator-unit confusion is exactly the bug this
    // fix corrects.
    const toMercatorY = (latDeg: number) => {
      const rad = (latDeg * Math.PI) / 180;
      return Math.log(Math.tan(Math.PI / 4 + rad / 2));
    };
    const lngSpan = ((fitted.east - fitted.west) * Math.PI) / 180;
    const ySpan = toMercatorY(fitted.north) - toMercatorY(fitted.south);
    const xScale = CARD_WIDTH / lngSpan;
    const yScale = CARD_HEIGHT / ySpan;
    expect(xScale / yScale).toBeCloseTo(1, 5);
  });
});

describe("clusterPins", () => {
  it("collapses pins closer than the threshold and keeps the count", () => {
    const clusters = clusterPins(
      [
        { x: 100, y: 100 },
        { x: 104, y: 103 },
        { x: 400, y: 400 },
      ],
      12,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters.find((c) => c.x < 200)?.count).toBe(2);
    expect(clusters.find((c) => c.x > 200)?.count).toBe(1);
  });

  it("leaves well-separated pins untouched", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ];
    expect(clusterPins(points, 12)).toHaveLength(3);
  });

  it("preserves the total count across clusters", () => {
    const points = Array.from({ length: 50 }, (_, i) => ({
      x: (i % 5) * 2,
      y: Math.floor(i / 5) * 2,
    }));
    const total = clusterPins(points, 12).reduce((n, c) => n + c.count, 0);
    expect(total).toBe(50);
  });

  it("returns an empty array for no pins", () => {
    expect(clusterPins([], 12)).toEqual([]);
  });
});
