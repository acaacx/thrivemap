// @vitest-environment node
// Reads fonts from disk and runs satori + resvg.

import { inflateSync } from "node:zlib";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { ImageResponse } from "next/og";
import { SearchCard } from "./card";
import { FallbackCard } from "./fallback";
import { loadFonts } from "./fonts";
import type { CardLabels } from "./label";
import { PALETTE } from "./palette";
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

/**
 * Minimal PNG decoder for the caption-layout regression tests below. Satori
 * ignores unsupported CSS silently and only exposes a rasterised PNG (no
 * intermediate SVG with real text coordinates, and satori itself isn't
 * separately importable — it's bundled inside next's compiled @vercel/og and
 * only ImageResponse is exported). Decoding the actual pixels is the only way
 * to assert on where text visually landed rather than trusting a byte count.
 * resvg output here is always 8-bit RGBA (colorType 6), so that's all this
 * supports.
 *
 * Written by hand rather than pulled from a dependency: this project has no
 * PNG-decode library (no pngjs, no sharp) and adding one just for a test
 * felt like more footprint than a ~60-line decoder using only node:zlib.
 */
interface DecodedPng {
  width: number;
  height: number;
  data: Buffer;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buf: Buffer): DecodedPng {
  let offset = 8; // skip the 8-byte PNG signature
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 8 + len + 4; // length + type + data + CRC
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(
      `unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`,
    );
  }
  const raw = inflateSync(Buffer.concat(idatChunks));
  const bpp = 4; // RGBA, 8-bit
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset]!;
    rawOffset += 1;
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawOffset + x]!;
      const a = x >= bpp ? out[rowStart + x - bpp]! : 0;
      const b = y > 0 ? out[rowStart - stride + x]! : 0;
      const c = x >= bpp && y > 0 ? out[rowStart - stride + x - bpp]! : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = (rawByte + a) & 0xff;
          break;
        case 2:
          value = (rawByte + b) & 0xff;
          break;
        case 3:
          value = (rawByte + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4:
          value = (rawByte + paeth(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`unsupported filter type ${filterType}`);
      }
      out[rowStart + x] = value;
    }
    rawOffset += stride;
  }
  return { width, height, data: out };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Exact match only, not a tolerance band: PALETTE.muted sits close to a
 * ~72% ink-over-cream blend, so any loose tolerance (tried up to 12) picks up
 * antialiased edge pixels of the headline glyphs as false "count text" —
 * this happened in practice and produced a flaky false failure against
 * already-correct output. Solid glyph interior pixels at 54px/28px are
 * reliably rendered as the exact fill color with no blending, so exact
 * equality still finds real text pixels while excluding AA edges entirely.
 */
function isColor(
  rgb: [number, number, number],
  target: [number, number, number],
): boolean {
  return rgb[0] === target[0] && rgb[1] === target[1] && rgb[2] === target[2];
}

/** Bottommost row containing an exact-match pixel, or -1 if none found. */
function maxYOfColor(
  png: DecodedPng,
  target: [number, number, number],
): number {
  let maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const rgb: [number, number, number] = [
        png.data[i]!,
        png.data[i + 1]!,
        png.data[i + 2]!,
      ];
      if (png.data[i + 3]! === 255 && isColor(rgb, target)) {
        maxY = y;
        break;
      }
    }
  }
  return maxY;
}

/** Topmost row containing an exact-match pixel, or height if none found. */
function minYOfColor(
  png: DecodedPng,
  target: [number, number, number],
): number {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const rgb: [number, number, number] = [
        png.data[i]!,
        png.data[i + 1]!,
        png.data[i + 2]!,
      ];
      if (png.data[i + 3]! === 255 && isColor(rgb, target)) return y;
    }
  }
  return png.height;
}

/** Rightmost column containing an exact-match pixel, or -1 if none found. */
function maxXOfColor(
  png: DecodedPng,
  target: [number, number, number],
): number {
  let maxX = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = png.width - 1; x > maxX; x--) {
      const i = (y * png.width + x) * 4;
      const rgb: [number, number, number] = [
        png.data[i]!,
        png.data[i + 1]!,
        png.data[i + 2]!,
      ];
      if (png.data[i + 3]! === 255 && isColor(rgb, target)) {
        maxX = x;
        break;
      }
    }
  }
  return maxX;
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

/**
 * Regression coverage for a real bug: satori only reports a wrapped node's
 * true multi-line height to its flex parent when the node's own width or
 * maxWidth resolves to a definite number at measure time. A width inherited
 * from an ancestor's maxWidth (the original code) resolves too late for that
 * pass, so a two-line headline painted correctly but its box measured as one
 * line tall — the count line below rendered on top of the wrapped second
 * line. See card.tsx and fallback.tsx for the fix (an explicit maxWidth on
 * the headline node itself, plus wordBreak for unbroken runs). These tests
 * fail against the pre-fix code — verified by hand against the commit before
 * the maxWidth/wordBreak lines were added.
 */
describe("caption layout", () => {
  it("SearchCard: count line starts below a wrapped headline's last line", async () => {
    const png = await render(
      <SearchCard paths={[]} clusters={[]} labels={LABELS} />,
      await loadFonts(),
    );
    const decoded = decodePng(png);
    const ink = hexToRgb(PALETTE.ink);
    const muted = hexToRgb(PALETTE.muted);
    const inkMaxY = maxYOfColor(decoded, ink);
    const mutedMinY = minYOfColor(decoded, muted);
    // Sanity: both colors were actually found (a blank/broken render would
    // otherwise vacuously satisfy the ordering check below).
    expect(inkMaxY).toBeGreaterThan(0);
    expect(mutedMinY).toBeLessThan(decoded.height);
    expect(mutedMinY).toBeGreaterThan(inkMaxY);
  });

  it("FallbackCard: count line starts below a wrapped headline's last line", async () => {
    const png = await render(
      <FallbackCard labels={{ ...LABELS, count: "No clinics match yet" }} />,
      await loadFonts(),
    );
    const decoded = decodePng(png);
    const ink = hexToRgb(PALETTE.ink);
    const muted = hexToRgb(PALETTE.muted);
    const inkMaxY = maxYOfColor(decoded, ink);
    const mutedMinY = minYOfColor(decoded, muted);
    expect(inkMaxY).toBeGreaterThan(0);
    expect(mutedMinY).toBeLessThan(decoded.height);
    expect(mutedMinY).toBeGreaterThan(inkMaxY);
  });

  it("SearchCard: an unbroken 80-char headline stays inside the plate", async () => {
    const png = await render(
      <SearchCard
        paths={[]}
        clusters={[]}
        labels={{ ...LABELS, headline: "A".repeat(80) }}
      />,
      await loadFonts(),
    );
    const decoded = decodePng(png);
    const ink = hexToRgb(PALETTE.ink);
    const inkMaxX = maxXOfColor(decoded, ink);
    expect(inkMaxX).toBeGreaterThan(0);
    // The plate's right edge is left(56) + maxWidth(880) = 936. Without
    // wordBreak, an 80-char run with no spaces has no wrap point and keeps
    // painting to the frame's right edge (x=1199) instead.
    expect(inkMaxX).toBeLessThan(950);
  });

  // The two tests above use the 34-char LABELS.headline, which wraps to
  // exactly 2 lines — that's the minimum case for the overlap bug, not the
  // fix's full stated scope (headlines up to label.ts's 80-char MAX_HEADLINE
  // clamp). A future line-height or padding change could reintroduce overlap
  // starting at any line count with nothing here to catch it, so the cases
  // below cover 2, 3, and 4 lines on both cards, each with a headline whose
  // line count was confirmed by counting the rendered ink row-bands rather
  // than assumed. This headline is 79 chars, all real words with spaces (not
  // the unbroken-run case above, which exercises wordBreak specifically) —
  // it wraps by ordinary word-boundary breaking.
  it("SearchCard: count line starts below a 3-line headline near the 80-char clamp", async () => {
    const headline =
      "Occupational therapy, speech therapy and early intervention clinics near Manila";
    expect(headline.length).toBeLessThanOrEqual(80);
    const png = await render(
      <SearchCard paths={[]} clusters={[]} labels={{ ...LABELS, headline }} />,
      await loadFonts(),
    );
    const decoded = decodePng(png);
    const ink = hexToRgb(PALETTE.ink);
    const muted = hexToRgb(PALETTE.muted);
    const inkMaxY = maxYOfColor(decoded, ink);
    const mutedMinY = minYOfColor(decoded, muted);
    expect(inkMaxY).toBeGreaterThan(0);
    expect(mutedMinY).toBeLessThan(decoded.height);
    expect(mutedMinY).toBeGreaterThan(inkMaxY);
  });

  // FallbackCard's plate has no padding, so its content width is the full
  // 880px maxWidth — 80px more than SearchCard's 800px. The same 79-char
  // headline used above wraps to 3 lines here where it wraps to 4 on
  // SearchCard, so both counts are covered on this card too: 3 lines here, 4
  // in the FallbackCard test further below.
  it("FallbackCard: count line starts below a 3-line headline near the 80-char clamp", async () => {
    const headline =
      "Occupational therapy, speech therapy and early intervention clinics near Manila";
    const png = await render(
      <FallbackCard
        labels={{ ...LABELS, headline, count: "No clinics match yet" }}
      />,
      await loadFonts(),
    );
    const decoded = decodePng(png);
    const ink = hexToRgb(PALETTE.ink);
    const muted = hexToRgb(PALETTE.muted);
    const inkMaxY = maxYOfColor(decoded, ink);
    const mutedMinY = minYOfColor(decoded, muted);
    expect(inkMaxY).toBeGreaterThan(0);
    expect(mutedMinY).toBeLessThan(decoded.height);
    expect(mutedMinY).toBeGreaterThan(inkMaxY);
  });

  // Confirmed to wrap to exactly 4 lines on SearchCard by counting the
  // rendered ink row-bands (a contiguous run of rows containing at least one
  // exact-match PALETTE.ink pixel): [261,312], [320,359], [379,430],
  // [438,477] — four bands, starts 59px apart, matching lineHeight 1.1 ×
  // 54px (band heights vary with whether a line has descenders).
  // 76 chars, ordinary space-separated English (ordinary word-boundary
  // wrapping, not wordBreak), under the 80-char clamp.
  it("SearchCard: count line starts below a 4-line headline near the 80-char clamp", async () => {
    const headline =
      "Occupational Physiotherapy Movement Wellness Developmental Pediatric Clinics";
    expect(headline.length).toBeLessThanOrEqual(80);
    const png = await render(
      <SearchCard paths={[]} clusters={[]} labels={{ ...LABELS, headline }} />,
      await loadFonts(),
    );
    const decoded = decodePng(png);
    const ink = hexToRgb(PALETTE.ink);
    const muted = hexToRgb(PALETTE.muted);
    const inkMaxY = maxYOfColor(decoded, ink);
    const mutedMinY = minYOfColor(decoded, muted);
    expect(inkMaxY).toBeGreaterThan(0);
    expect(mutedMinY).toBeLessThan(decoded.height);
    expect(mutedMinY).toBeGreaterThan(inkMaxY);
  });

  // Confirmed to wrap to exactly 4 lines on FallbackCard's wider 880px
  // content width by counting the rendered ink row-bands: [293,332],
  // [354,391], [411,450], [473,509] — four bands, ~59px apart, matching
  // lineHeight 1.1 × 54px. 74 chars, ordinary dictionary words separated by
  // spaces (ordinary word-boundary wrapping, not wordBreak), under the
  // 80-char clamp. Short words built from wide letterforms (W, M) is what
  // reaches 4 lines at this width: each word eats horizontal space while the
  // many word boundaries leave the wrapper no long run to pack.
  it("FallbackCard: count line starts below a 4-line headline near the 80-char clamp", async () => {
    const headline =
      "Wow Mom Wham Womb Yawn Vim Wax Zoom Mom Wow Wax Vim Yawn Womb Wham Mom Wow";
    expect(headline.length).toBeLessThanOrEqual(80);
    const png = await render(
      <FallbackCard
        labels={{ ...LABELS, headline, count: "No clinics match yet" }}
      />,
      await loadFonts(),
    );
    const decoded = decodePng(png);
    const ink = hexToRgb(PALETTE.ink);
    const muted = hexToRgb(PALETTE.muted);
    const inkMaxY = maxYOfColor(decoded, ink);
    const mutedMinY = minYOfColor(decoded, muted);
    expect(inkMaxY).toBeGreaterThan(0);
    expect(mutedMinY).toBeLessThan(decoded.height);
    expect(mutedMinY).toBeGreaterThan(inkMaxY);
  });
});
