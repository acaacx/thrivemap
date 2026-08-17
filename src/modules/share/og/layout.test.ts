import { describe, expect, it } from "vitest";
import {
  EDGE_MARGIN,
  PIN_CLEARANCE,
  PLATE_RECT,
  type Rect,
  WORDMARK_RECT,
  inflateRect,
  layoutBBox,
  pointInRect,
} from "./layout";
import {
  type BBox,
  CARD_HEIGHT,
  CARD_WIDTH,
  createProjector,
  fitBBox,
} from "./projection";

interface LngLat {
  lng: number;
  lat: number;
}

/** A square-ish box over the Visayas; fitBBox widens it, never heightens. */
const BOX: BBox = { north: 12, south: 10, east: 124, west: 122 };

const OBSTACLES = [PLATE_RECT, WORDMARK_RECT];

function projectAll(box: BBox, pins: LngLat[]) {
  const project = createProjector(box, CARD_WIDTH, CARD_HEIGHT);
  return pins.map((p) => project(p.lng, p.lat));
}

function assertClear(box: BBox, pins: LngLat[]) {
  const zones = OBSTACLES.map((r) => inflateRect(r, PIN_CLEARANCE));
  for (const p of projectAll(box, pins)) {
    for (const zone of zones) {
      expect(pointInRect(p, zone), `pin ${p.x},${p.y} inside obstacle`).toBe(
        false,
      );
    }
    expect(p.x).toBeGreaterThanOrEqual(EDGE_MARGIN - 0.001);
    expect(p.x).toBeLessThanOrEqual(CARD_WIDTH - EDGE_MARGIN + 0.001);
    expect(p.y).toBeGreaterThanOrEqual(EDGE_MARGIN - 0.001);
    expect(p.y).toBeLessThanOrEqual(CARD_HEIGHT - EDGE_MARGIN + 0.001);
  }
}

/** Inverse of the projector — the lng/lat that lands on a given pixel. */
function pinAtPixel(box: BBox, x: number, y: number): LngLat {
  const fitted = fitBBox(box, CARD_WIDTH, CARD_HEIGHT);
  const lng = fitted.west + ((fitted.east - fitted.west) * x) / CARD_WIDTH;
  // Binary search on latitude; Mercator has no closed form worth inlining here.
  let lo = fitted.south;
  let hi = fitted.north;
  const project = createProjector(fitted, CARD_WIDTH, CARD_HEIGHT);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (project(0, mid).y > y) lo = mid;
    else hi = mid;
  }
  return { lng, lat: (lo + hi) / 2 };
}

describe("obstacle rects", () => {
  it("plate sits bottom-left and wordmark top-left, both inside the card", () => {
    for (const r of OBSTACLES) {
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(CARD_WIDTH);
      expect(r.bottom).toBeLessThanOrEqual(CARD_HEIGHT);
      expect(r.right).toBeGreaterThan(r.left);
      expect(r.bottom).toBeGreaterThan(r.top);
    }
    expect(PLATE_RECT.bottom).toBe(CARD_HEIGHT - 56);
    expect(WORDMARK_RECT.top).toBe(48);
  });

  it("inflateRect grows on every side; pointInRect is strict interior", () => {
    const r: Rect = { left: 10, top: 10, right: 20, bottom: 20 };
    expect(inflateRect(r, 5)).toEqual({
      left: 5,
      top: 5,
      right: 25,
      bottom: 25,
    });
    expect(pointInRect({ x: 15, y: 15 }, r)).toBe(true);
    // On the edge = touching the clearance boundary = acceptable.
    expect(pointInRect({ x: 10, y: 20 }, r)).toBe(false);
    expect(pointInRect({ x: 9.9, y: 15 }, r)).toBe(false);
    expect(pointInRect({ x: 15, y: 20.1 }, r)).toBe(false);
  });
});

describe("layoutBBox", () => {
  it("returns the plain aspect fit when no pin touches an obstacle", () => {
    const pins = [pinAtPixel(BOX, 1000, 200), pinAtPixel(BOX, 1100, 500)];
    const out = layoutBBox(BOX, pins, CARD_WIDTH, CARD_HEIGHT);
    expect(out).toEqual(fitBBox(BOX, CARD_WIDTH, CARD_HEIGHT));
    assertClear(out, pins);
  });

  it("pans when a pin sits under the plate and there is room", () => {
    // One pin dead centre of the plate, one well above it. Either direction
    // clears; which one is chosen is covered by the two tests below.
    const pins = [pinAtPixel(BOX, 500, 480), pinAtPixel(BOX, 500, 100)];
    const out = layoutBBox(BOX, pins, CARD_WIDTH, CARD_HEIGHT);
    expect(out).not.toEqual(fitBBox(BOX, CARD_WIDTH, CARD_HEIGHT));
    assertClear(out, pins);
  });

  it("panning preserves the pixel offset between pins (scale unchanged)", () => {
    const pins = [pinAtPixel(BOX, 500, 480), pinAtPixel(BOX, 500, 100)];
    const before = projectAll(fitBBox(BOX, CARD_WIDTH, CARD_HEIGHT), pins);
    const out = layoutBBox(BOX, pins, CARD_WIDTH, CARD_HEIGHT);
    const after = projectAll(out, pins);
    expect(after[1].x - after[0].x).toBeCloseTo(before[1].x - before[0].x, 3);
    expect(after[1].y - after[0].y).toBeCloseTo(before[1].y - before[0].y, 3);
  });

  it("pans right (not up) when up would push a pin off the top edge", () => {
    // Pin at the very top edge already; a pin under the plate low down.
    const pins = [pinAtPixel(BOX, 500, 560), pinAtPixel(BOX, 500, EDGE_MARGIN)];
    const out = layoutBBox(BOX, pins, CARD_WIDTH, CARD_HEIGHT);
    const [low, top] = projectAll(out, pins);
    expect(top.y).toBeCloseTo(EDGE_MARGIN, 3);
    expect(low.x).toBeGreaterThanOrEqual(
      PLATE_RECT.right + PIN_CLEARANCE - 0.001,
    );
    assertClear(out, pins);
  });

  it("pans up (not right) when right would push a pin off the right edge", () => {
    const pins = [
      pinAtPixel(BOX, 500, 400),
      pinAtPixel(BOX, CARD_WIDTH - EDGE_MARGIN, 300),
    ];
    const out = layoutBBox(BOX, pins, CARD_WIDTH, CARD_HEIGHT);
    const [under, right] = projectAll(out, pins);
    expect(right.x).toBeCloseTo(CARD_WIDTH - EDGE_MARGIN, 3);
    expect(under.y).toBeLessThanOrEqual(PLATE_RECT.top - PIN_CLEARANCE + 0.001);
    assertClear(out, pins);
  });

  it("falls back to fitting inside the free band when no pan can clear", () => {
    // Pins pinned to all four edges plus one under the plate: nothing shifts.
    const pins = [
      pinAtPixel(BOX, EDGE_MARGIN, 300),
      pinAtPixel(BOX, CARD_WIDTH - EDGE_MARGIN, 300),
      pinAtPixel(BOX, 600, EDGE_MARGIN),
      pinAtPixel(BOX, 600, CARD_HEIGHT - EDGE_MARGIN),
      pinAtPixel(BOX, 400, 500),
    ];
    const out = layoutBBox(BOX, pins, CARD_WIDTH, CARD_HEIGHT);
    assertClear(out, pins);
    // Zoomed out, not panned: the box got bigger on both axes.
    const fitted = fitBBox(BOX, CARD_WIDTH, CARD_HEIGHT);
    expect(out.east - out.west).toBeGreaterThan(fitted.east - fitted.west);
    expect(out.north - out.south).toBeGreaterThan(fitted.north - fitted.south);
  });

  it("does not care about the plate when the pin list is empty", () => {
    expect(layoutBBox(BOX, [], CARD_WIDTH, CARD_HEIGHT)).toEqual(
      fitBBox(BOX, CARD_WIDTH, CARD_HEIGHT),
    );
  });
});
