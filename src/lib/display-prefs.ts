/**
 * Display preferences — a small, optional set of sensory controls.
 *
 * Preferences live in localStorage under one key and are mirrored as
 * `data-*` attributes on <html>, which globals.css targets. This module is
 * plain TS (no "use client") so both the root layout (Server Component,
 * for the boot script) and the client control can import it.
 */

export const DISPLAY_PREFS_STORAGE_KEY = "tm-display";

export const DISPLAY_PREF_KEYS = [
  "reduceMotion",
  "largerText",
  "moreSpacing",
  "higherContrast",
] as const;

export type DisplayPrefKey = (typeof DISPLAY_PREF_KEYS)[number];

export type DisplayPrefs = Record<DisplayPrefKey, boolean>;

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  reduceMotion: false,
  largerText: false,
  moreSpacing: false,
  higherContrast: false,
};

/** Attribute stamped on <html> for each preference. */
export const DISPLAY_PREF_ATTRS: Record<DisplayPrefKey, string> = {
  reduceMotion: "data-reduce-motion",
  largerText: "data-text-lg",
  moreSpacing: "data-spacing-lg",
  higherContrast: "data-contrast-hi",
};

export const DISPLAY_PREF_LABELS: Record<
  DisplayPrefKey,
  { label: string; hint: string }
> = {
  reduceMotion: {
    label: "Reduce motion",
    hint: "Turns off transitions and animations.",
  },
  largerText: {
    label: "Larger text",
    hint: "Increases text size across the site.",
  },
  moreSpacing: {
    label: "More spacing",
    hint: "Adds room between sections and lists.",
  },
  higherContrast: {
    label: "Higher contrast",
    hint: "Darkens secondary text and borders.",
  },
};

export function readDisplayPrefs(): DisplayPrefs {
  if (typeof window === "undefined") return DEFAULT_DISPLAY_PREFS;
  try {
    const raw = window.localStorage.getItem(DISPLAY_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_DISPLAY_PREFS;
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    const next = { ...DEFAULT_DISPLAY_PREFS };
    for (const key of DISPLAY_PREF_KEYS) {
      if (typeof parsed[key] === "boolean") next[key] = parsed[key];
    }
    return next;
  } catch {
    return DEFAULT_DISPLAY_PREFS;
  }
}

export function applyDisplayPrefs(prefs: DisplayPrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const key of DISPLAY_PREF_KEYS) {
    const attr = DISPLAY_PREF_ATTRS[key];
    if (prefs[key]) root.setAttribute(attr, "");
    else root.removeAttribute(attr);
  }
}

export function writeDisplayPrefs(prefs: DisplayPrefs) {
  try {
    window.localStorage.setItem(
      DISPLAY_PREFS_STORAGE_KEY,
      JSON.stringify(prefs),
    );
  } catch {
    // Storage unavailable (private mode / quota) — preferences still apply
    // for this page view.
  }
}

/**
 * Inline boot script for <head>. Runs before paint; must stay tiny,
 * dependency-free, and wrapped in try/catch. Keep in sync with
 * DISPLAY_PREF_ATTRS above.
 */
export const DISPLAY_PREFS_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  DISPLAY_PREFS_STORAGE_KEY,
)})||"{}");var m=${JSON.stringify(
  DISPLAY_PREF_ATTRS,
)};var r=document.documentElement;for(var k in m){if(p[k]===true){r.setAttribute(m[k],"")}}}catch(e){}})();`;
