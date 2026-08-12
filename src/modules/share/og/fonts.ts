import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Static, subset instances of the app's two families. Fraunces upstream is a
 * variable font with live axes (src/app/layout.tsx:8-12); satori wants a
 * static instance, so the axes are frozen at build time — see assets/README.md.
 *
 * These paths are dynamic, so the files only reach the serverless bundle via
 * outputFileTracingIncludes in next.config.ts.
 */

export interface LoadedFont {
  name: string;
  data: Buffer;
  weight: number;
  style: "normal";
}

const FILES = [
  { name: "Fraunces", file: "fraunces-display.ttf", weight: 600 },
  { name: "Nunito Sans", file: "nunito-sans-regular.ttf", weight: 400 },
  { name: "Nunito Sans", file: "nunito-sans-semibold.ttf", weight: 600 },
] as const;

let cached: Promise<LoadedFont[]> | undefined;

/** Read once per process — three disk reads per request would be waste. */
export function loadFonts(): Promise<LoadedFont[]> {
  cached ??= Promise.all(
    FILES.map(async (font) => ({
      name: font.name,
      weight: font.weight,
      style: "normal" as const,
      data: await readFile(join(process.cwd(), "assets/fonts", font.file)),
    })),
  );
  return cached;
}

/** Test seam. */
export function resetFontCacheForTesting(): void {
  cached = undefined;
}
