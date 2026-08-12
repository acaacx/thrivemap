import type { ReactElement } from "react";
import type { CardLabels } from "./label";
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

      {/* Caption plate. Sits over the map, so it needs its own ground. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 56,
          bottom: 56,
          maxWidth: 880,
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
          top: 48,
          left: 56,
          padding: "10px 22px",
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
