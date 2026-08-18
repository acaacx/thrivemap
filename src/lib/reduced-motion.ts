"use client";

import { useSyncExternalStore } from "react";
import { DISPLAY_PREF_ATTRS } from "./display-prefs";

const REDUCE_ATTR = DISPLAY_PREF_ATTRS.reduceMotion;
const MEDIA = "(prefers-reduced-motion: reduce)";

/**
 * True when motion should be skipped: either the OS setting or the site's
 * own "Reduce motion" display preference (stamped as an attribute on
 * <html> before paint). Safe to call during SSR — returns false.
 */
export function isReducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.hasAttribute(REDUCE_ATTR)) return true;
  return typeof window.matchMedia === "function"
    ? window.matchMedia(MEDIA).matches
    : false;
}

function subscribe(onChange: () => void) {
  const mql =
    typeof window.matchMedia === "function" ? window.matchMedia(MEDIA) : null;
  mql?.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [REDUCE_ATTR],
  });
  return () => {
    mql?.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/** Reactive version of {@link isReducedMotion}. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, isReducedMotion, () => false);
}
