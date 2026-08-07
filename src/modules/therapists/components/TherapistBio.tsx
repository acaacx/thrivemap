"use client";

import { useState } from "react";

/**
 * Bios can run to 1000 chars; clamp long ones to three lines with an
 * expand toggle (spec: line-clamped with expand if long). The threshold is
 * a character heuristic so the server render matches the client render —
 * no layout measurement, no hydration flicker.
 */
const CLAMP_THRESHOLD = 200;

export function TherapistBio({ bio, name }: { bio: string; name: string }) {
  const [expanded, setExpanded] = useState(false);
  const clampable = bio.length > CLAMP_THRESHOLD;

  return (
    <div className="pt-1">
      <p
        className={`text-sm leading-relaxed text-foreground/90 ${
          clampable && !expanded ? "line-clamp-3" : ""
        }`}
      >
        {bio}
      </p>
      {clampable && (
        <button
          type="button"
          className="mt-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
          aria-expanded={expanded}
          aria-label={
            expanded ? `Show less about ${name}` : `Show more about ${name}`
          }
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
