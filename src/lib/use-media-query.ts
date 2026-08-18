"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Tailwind `md` breakpoint — the shell switches from sheet to two columns. */
export const DESKTOP_MEDIA = "(min-width: 48rem)";

/**
 * Reactive media query. Server (and the hydration pass) report `false`, so
 * the mobile branch is the SSR default and desktop settles right after
 * hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () =>
      typeof window.matchMedia === "function"
        ? window.matchMedia(query).matches
        : false,
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_MEDIA);
}
