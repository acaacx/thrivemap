"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { ReactNode } from "react";
import { useReducedMotion } from "@/lib/reduced-motion";

/**
 * Motion setup for interactive surfaces: lazy-loaded DOM animation features
 * (keeps the bundle small) and a reduced-motion policy that honours both the
 * OS setting and the site's own "Reduce motion" display preference.
 * Nesting is harmless — the innermost config wins.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={reduced ? "always" : "user"}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
