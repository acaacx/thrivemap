import { describe, expect, it } from "vitest";
import {
  CALM_EASE,
  SEARCH_MOTION_DURATION,
  SEARCH_PREVIEW_EXIT_TRANSITION,
  SEARCH_PREVIEW_TRANSITION,
  SEARCH_RESULT_LAYOUT_TRANSITION,
} from "./motion";

describe("search motion tokens", () => {
  it("keeps every transition inside the calm 220ms budget", () => {
    expect(SEARCH_MOTION_DURATION).toEqual({
      previewEnter: 0.16,
      previewExit: 0.14,
      resultLayout: 0.18,
      mapLayout: 0.2,
    });
    expect(
      Object.values(SEARCH_MOTION_DURATION).every((value) => value > 0),
    ).toBe(true);
    expect(
      Object.values(SEARCH_MOTION_DURATION).every((value) => value <= 0.22),
    ).toBe(true);
  });

  it("uses the same calm easing and matching durations for each transition", () => {
    expect(CALM_EASE).toEqual([0.22, 0.61, 0.36, 1]);
    expect(SEARCH_PREVIEW_TRANSITION.ease).toBe(CALM_EASE);
    expect(SEARCH_PREVIEW_EXIT_TRANSITION.ease).toBe(CALM_EASE);
    expect(SEARCH_RESULT_LAYOUT_TRANSITION.ease).toBe(CALM_EASE);
    expect(SEARCH_PREVIEW_TRANSITION.duration).toBe(
      SEARCH_MOTION_DURATION.previewEnter,
    );
    expect(SEARCH_PREVIEW_EXIT_TRANSITION.duration).toBe(
      SEARCH_MOTION_DURATION.previewExit,
    );
    expect(SEARCH_RESULT_LAYOUT_TRANSITION.duration).toBe(
      SEARCH_MOTION_DURATION.resultLayout,
    );
  });
});
