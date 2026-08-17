/**
 * Warm Horizon, hand-converted to sRGB hex for satori.
 *
 * NOTE (2026-08-18): the app moved to the "Quiet Ledger" palette
 * (src/app/globals.css). OG cards deliberately stay on Warm Horizon for now —
 * retheming them needs the font-subsetting pipeline (assets/README.md) and
 * card.test.tsx pixel checks, tracked as a follow-up. The oklch annotations
 * below therefore describe the OLD tokens, not the current globals.css.
 *
 * Satori's vendored parser (parse-css-color 0.2.1) accepts hex, rgb(), hsl(),
 * and named colors — and nothing else. No oklch(), oklab(), lab(), lch(),
 * hwb(), or color-mix(). The app's palette is entirely oklch
 * (src/app/globals.css:56+), so every token used on the card is converted here
 * and annotated with its source. If a token changes in globals.css, the drift
 * is visible in review because the oklch value is written down next to it.
 */
export const PALETTE = {
  /** oklch(0.985 0.008 84) — --background, warm cream */
  cream: "#fdfaf4",
  /** oklch(1 0.004 84) — --card */
  card: "#fffffc",
  /** oklch(0.28 0.02 55) — --foreground, warm near-black */
  ink: "#312620",
  /** oklch(0.44 0.065 195) — --primary, deep teal */
  teal: "#1b5e5e",
  /** oklch(0.94 0.02 90) — --secondary, land fill */
  land: "#f0ebdc",
  /** oklch(0.905 0.015 82) — --border, coastline */
  coast: "#e5dfd5",
  /** oklch(0.5 0.02 60) — --muted-foreground */
  muted: "#6c6158",
  /** oklch(0.7 0.12 45) — --chart-2, coral pin fill */
  coral: "#dc855d",
  /** oklch(0.5 0.1 160) — --verified */
  verified: "#1f744f",
} as const;

/** Water. Not a theme token — the app's map uses OpenFreeMap tiles for this. */
export const WATER = "#eef4f4";
