"use client";

import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { useReducedMotion } from "@/lib/reduced-motion";

/**
 * Motion setup for interactive surfaces: layout features enable search-result
 * reflow, while this single provider retains the reduced-motion policy for
 * both the OS setting and the site's own "Reduce motion" display preference.
 * Nesting is harmless — the innermost config wins.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion={reduced ? "always" : "user"}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
