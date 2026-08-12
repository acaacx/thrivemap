// @vitest-environment node
// Reads fonts from disk and runs satori + resvg.

import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { ImageResponse } from "next/og";
import { SearchCard } from "./card";
import { FallbackCard } from "./fallback";
import { loadFonts } from "./fonts";
import type { CardLabels } from "./label";
import { CARD_HEIGHT, CARD_WIDTH } from "./projection";

const LABELS: CardLabels = {
  headline: "Occupational therapy in Davao City",
  count: "12 clinics on this map",
  description: "…",
  alt: "…",
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function render(element: ReactElement, fonts?: unknown[]) {
  const response = new ImageResponse(element, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    ...(fonts ? { fonts } : {}),
  });
  return Buffer.from(await response.arrayBuffer());
}

describe("loadFonts", () => {
  it("loads three static instances", async () => {
    const fonts = await loadFonts();
    expect(fonts).toHaveLength(3);
    for (const font of fonts) {
      expect(font.data.byteLength).toBeGreaterThan(1000);
    }
  });

  it("caches across calls", async () => {
    expect(await loadFonts()).toBe(await loadFonts());
  });
});

describe("SearchCard", () => {
  it("renders a PNG", async () => {
    const png = await render(
      <SearchCard
        paths={["M100,100L400,100L400,300L100,300Z"]}
        clusters={[
          { x: 200, y: 150, count: 1 },
          { x: 320, y: 240, count: 9 },
        ]}
        labels={LABELS}
      />,
      await loadFonts(),
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
    expect(png.byteLength).toBeGreaterThan(5_000);
    // Facebook's ceiling is 8MB; nowhere near it, but assert the direction.
    expect(png.byteLength).toBeLessThan(2_000_000);
  });

  it("renders with no pins at all", async () => {
    const png = await render(
      <SearchCard paths={["M0,0L10,0L10,10Z"]} clusters={[]} labels={LABELS} />,
      await loadFonts(),
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it("renders a long headline without throwing", async () => {
    const png = await render(
      <SearchCard
        paths={[]}
        clusters={[]}
        labels={{ ...LABELS, headline: "A".repeat(80) }}
      />,
      await loadFonts(),
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it("renders 400 clusters inside the timing budget", async () => {
    const clusters = Array.from({ length: 400 }, (_, i) => ({
      x: 100 + ((i * 37) % 1000),
      y: 60 + ((i * 53) % 500),
      count: 1,
    }));
    const started = performance.now();
    const png = await render(
      <SearchCard paths={[]} clusters={clusters} labels={LABELS} />,
      await loadFonts(),
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
    // Generous — this asserts "not pathological", not the production budget.
    // scripts/bench-og-render.mjs is the real measurement.
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});

describe("FallbackCard", () => {
  it("renders a PNG", async () => {
    const png = await render(
      <FallbackCard labels={{ ...LABELS, count: "No clinics match yet" }} />,
      await loadFonts(),
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it("renders without any fonts — the font-read failure path", async () => {
    const png = await render(
      <FallbackCard labels={{ ...LABELS, count: "No clinics match yet" }} />,
    );
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
  });
});
