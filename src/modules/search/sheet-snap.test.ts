import { describe, expect, it } from "vitest";
import {
  SHEET_COLLAPSED_PX,
  nextSnap,
  resolveSnap,
  snapHeights,
} from "./sheet-snap";

describe("snapHeights", () => {
  it("derives collapsed / mid / expanded from the container height", () => {
    expect(snapHeights(800)).toEqual({
      collapsed: SHEET_COLLAPSED_PX,
      mid: 400,
      expanded: 736,
    });
  });

  it("never lets a snap exceed the one above it on tiny screens", () => {
    const h = snapHeights(200);
    expect(h.collapsed).toBeLessThanOrEqual(h.mid);
    expect(h.mid).toBeLessThanOrEqual(h.expanded);
  });
});

describe("resolveSnap", () => {
  const heights = snapHeights(800);

  it("picks the nearest snap when released slowly", () => {
    expect(resolveSnap(150, 0, heights)).toBe("collapsed");
    expect(resolveSnap(420, 0, heights)).toBe("mid");
    expect(resolveSnap(700, 0, heights)).toBe("expanded");
  });

  it("follows a fast fling in the drag direction", () => {
    // Fast upward fling (height growing) from near collapsed → mid.
    expect(resolveSnap(180, 900, heights)).toBe("mid");
    // Fast downward fling from near expanded → mid, not collapsed.
    expect(resolveSnap(650, -900, heights)).toBe("mid");
  });

  it("clamps out-of-range heights", () => {
    expect(resolveSnap(-50, 0, heights)).toBe("collapsed");
    expect(resolveSnap(2000, 0, heights)).toBe("expanded");
  });
});

describe("nextSnap", () => {
  it("cycles up on activation and stops at the ends when stepping", () => {
    expect(nextSnap("collapsed", "up")).toBe("mid");
    expect(nextSnap("mid", "up")).toBe("expanded");
    expect(nextSnap("expanded", "up")).toBe("expanded");
    expect(nextSnap("expanded", "down")).toBe("mid");
    expect(nextSnap("collapsed", "down")).toBe("collapsed");
  });
});
