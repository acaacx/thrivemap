import type { ReactElement } from "react";
import type { CardLabels } from "./label";
import { PALETTE } from "./palette";
import { CARD_HEIGHT, CARD_WIDTH } from "./projection";

/**
 * The fallback is a designed state, not an error: geometry missing, fonts
 * unreadable, the query down, zero results, or the 2s budget blown all land
 * here. It must not depend on anything that can fail — no disk reads, no
 * projection, no data — so it is an abstract pin field over flat colour.
 *
 * If the fonts failed to load, satori falls back to its bundled default and
 * this still renders.
 */

/** Deterministic scatter. Math.random() would make the output uncacheable. */
const PINS = Array.from({ length: 26 }, (_, i) => ({
  x: 120 + ((i * 173) % 980),
  y: 90 + ((i * 271) % 430),
  r: 5 + ((i * 7) % 5),
}));

export function FallbackCard({ labels }: { labels: CardLabels }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: PALETTE.cream,
        fontFamily: "Nunito Sans",
      }}
    >
      <svg
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {PINS.map((pin, i) => (
          <circle
            key={`pin-${i}`}
            cx={pin.x}
            cy={pin.y}
            r={pin.r}
            fill={PALETTE.coral}
            opacity={0.28}
          />
        ))}
      </svg>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 56,
          bottom: 56,
          maxWidth: 880,
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
            color: PALETTE.muted,
          }}
        >
          {labels.count}
        </div>
      </div>

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
        }}
      >
        ThriveMap
      </div>
    </div>
  );
}
