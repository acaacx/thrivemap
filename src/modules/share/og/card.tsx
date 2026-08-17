import type { ReactElement } from "react";
import type { CardLabels } from "./label";
import { PLATE, WORDMARK } from "./layout";
import { PALETTE, WATER } from "./palette";
import { CARD_HEIGHT, CARD_WIDTH, type Cluster } from "./projection";

/**
 * The full card: three absolutely-positioned layers — land, pins, caption.
 *
 * Satori is flexbox-only (no grid) and every element that contains more than
 * one child needs an explicit `display: flex`. The basemap is inline <svg>
 * rather than a data-URI <img> so the pins share one coordinate space with the
 * land paths.
 */

/** Pins grow with their cluster, but only so far. */
function pinRadius(count: number): number {
  if (count === 1) return 7;
  return Math.min(18, 7 + Math.sqrt(count) * 2.2);
}

export function SearchCard({
  paths,
  clusters,
  labels,
}: {
  paths: string[];
  clusters: Cluster[];
  labels: CardLabels;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: WATER,
        fontFamily: "Nunito Sans",
      }}
    >
      <svg
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {paths.map((d, i) => (
          <path
            key={`land-${i}`}
            d={d}
            fill={PALETTE.land}
            stroke={PALETTE.coast}
            strokeWidth={1}
          />
        ))}
        {clusters.map((cluster, i) => (
          <circle
            key={`pin-${i}`}
            cx={cluster.x}
            cy={cluster.y}
            r={pinRadius(cluster.count)}
            fill={PALETTE.coral}
            stroke={PALETTE.cream}
            strokeWidth={2.5}
          />
        ))}
      </svg>

      {/* Caption plate. Sits over the map, so it needs its own ground. Its
          footprint is declared in layout.ts so the map can keep pins out
          from under it; change the geometry there, not here. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: PLATE.left,
          bottom: PLATE.bottom,
          maxWidth: PLATE.maxWidth,
          padding: "32px 40px",
          borderRadius: 24,
          backgroundColor: PALETTE.cream,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Fraunces",
            fontWeight: 600,
            fontSize: 54,
            lineHeight: 1.1,
            color: PALETTE.ink,
            // Explicit maxWidth on the node itself, not just the one it
            // inherits from the plate's maxWidth: satori only reports a
            // wrapped node's true multi-line height to its flex parent when
            // the node's own width/maxWidth resolves to a definite number at
            // measure time. An ancestor's maxWidth resolves too late for
            // that pass — the headline still paints two lines, but its box
            // measures as one line tall, so the count line below renders on
            // top of the wrapped second line. maxWidth (not width) so short
            // headlines still hug their text instead of stretching the
            // plate. 880 (plate maxWidth) minus 80 (32px 40px padding, both
            // sides) = 800.
            maxWidth: 800,
            // label.ts clamps loc/q fragments to individual limits but not
            // the assembled headline's longest unbroken run — a pathological
            // single "word" (e.g. a spaceless free-text query) would overflow
            // past the card's right edge with satori's default word-boundary
            // wrapping. break-word forces a mid-word break only when a run
            // doesn't fit, leaving normal wrapping untouched otherwise.
            wordBreak: "break-word",
          }}
        >
          {labels.headline}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 28,
            fontWeight: 400,
            color: PALETTE.muted,
          }}
        >
          {labels.count}
        </div>
      </div>

      {/* Wordmark, opposite corner from the plate. */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: WORDMARK.top,
          left: WORDMARK.left,
          height: WORDMARK.height,
          alignItems: "center",
          padding: "0 22px",
          borderRadius: 999,
          backgroundColor: PALETTE.teal,
          color: PALETTE.cream,
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: 0.5,
        }}
      >
        ThriveMap
      </div>
    </div>
  );
}
