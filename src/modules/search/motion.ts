import type { Transition } from "motion/react";

export const CALM_EASE = [0.22, 0.61, 0.36, 1] as const;

export const SEARCH_MOTION_DURATION = {
  previewEnter: 0.16,
  previewExit: 0.14,
  resultLayout: 0.18,
  mapLayout: 0.2,
} as const;

export const SEARCH_PREVIEW_TRANSITION = {
  duration: SEARCH_MOTION_DURATION.previewEnter,
  ease: CALM_EASE,
} satisfies Transition;

export const SEARCH_PREVIEW_EXIT_TRANSITION = {
  duration: SEARCH_MOTION_DURATION.previewExit,
  ease: CALM_EASE,
} satisfies Transition;

export const SEARCH_RESULT_LAYOUT_TRANSITION = {
  duration: SEARCH_MOTION_DURATION.resultLayout,
  ease: CALM_EASE,
} satisfies Transition;
