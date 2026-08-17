import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getServices } from "@/modules/clinics/queries";
import { parseSearchParams, type SearchParams } from "@/modules/search/schemas";
import { loadPhOutline, ringsToPaths } from "@/modules/share/og/basemap";
import { resolveCardData } from "@/modules/share/og/bbox";
import { SearchCard } from "@/modules/share/og/card";
import { FallbackCard } from "@/modules/share/og/fallback";
import { loadFonts } from "@/modules/share/og/fonts";
import { buildFallbackLabels, buildLabels } from "@/modules/share/og/label";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  clusterPins,
  createProjector,
  fitBBox,
} from "@/modules/share/og/projection";

/**
 * Open Graph card for a filtered /clinics search.
 *
 * The file convention (opengraph-image.tsx) receives `params` only, never
 * `searchParams`, so it structurally cannot see filters — hence a route
 * handler. Middleware does not run here: the matcher in src/middleware.ts
 * excludes api/ via negative lookahead.
 */

/** Explicit because the font and geometry loaders use node:fs. */
export const runtime = "nodejs";

/**
 * Whole-path budget. A crawler waits a few seconds; this leaves headroom for
 * TLS, cold start, and transfer. Blowing it renders the fallback, which
 * expires in 60s rather than a day — see CACHE_FALLBACK.
 */
const RENDER_BUDGET_MS = 2000;

/** Pins closer than this collapse into one larger circle. */
const CLUSTER_DISTANCE_PX = 14;

const CACHE_FULL = "public, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_FALLBACK = "public, s-maxage=60, stale-while-revalidate=300";

function headers(variant: "full" | "fallback"): Record<string, string> {
  return {
    "Content-Type": "image/png",
    "Cache-Control": variant === "full" ? CACHE_FULL : CACHE_FALLBACK,
    // The deploy smoke check reads this: a tracing miss produces a fallback,
    // which is otherwise indistinguishable from a working card.
    "x-og-card": variant,
  };
}

/** Rejects after the budget so a hung query cannot stall the crawler. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`og card exceeded ${ms}ms budget`)),
      ms,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Slug → display name. Failure is survivable: label.ts de-slugs instead. */
async function serviceNames(): Promise<Record<string, string>> {
  try {
    const services = await getServices();
    return Object.fromEntries(services.map((s) => [s.slug, s.name]));
  } catch (error) {
    console.error("og card: getServices failed", error);
    return {};
  }
}

async function renderFull(params: SearchParams, names: Record<string, string>) {
  const [data, rings, fonts] = await Promise.all([
    resolveCardData(params),
    loadPhOutline(),
    loadFonts(),
  ]);
  if (!data) return null;

  const bbox = fitBBox(data.bbox, CARD_WIDTH, CARD_HEIGHT);
  const project = createProjector(bbox, CARD_WIDTH, CARD_HEIGHT);
  const paths = ringsToPaths(rings, project);
  const clusters = clusterPins(
    data.pins.map((pin) => project(pin.longitude, pin.latitude)),
    CLUSTER_DISTANCE_PX,
  );

  // The caption reports pins found, not circles drawn.
  const labels = buildLabels({
    params,
    pinCount: data.pins.length,
    atCap: data.atCap,
    serviceNames: names,
  });

  return new ImageResponse(
    <SearchCard paths={paths} clusters={clusters} labels={labels} />,
    { width: CARD_WIDTH, height: CARD_HEIGHT, fonts, headers: headers("full") },
  );
}

async function renderFallback(
  params: SearchParams,
  names: Record<string, string>,
) {
  const labels = buildFallbackLabels(params, names);
  // Fonts are best-effort here: a font read failure is one of the reasons we
  // are on this path at all, and satori has a bundled default.
  let fonts: Awaited<ReturnType<typeof loadFonts>> | undefined;
  try {
    fonts = await loadFonts();
  } catch (error) {
    console.error("og card: font load failed on the fallback path", error);
  }

  return new ImageResponse(<FallbackCard labels={labels} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    ...(fonts ? { fonts } : {}),
    headers: headers("fallback"),
  });
}

export async function GET(request: NextRequest) {
  // parseSearchParams is tolerant by design: it drops invalid keys and retries
  // rather than throwing, so hostile params degrade to a PH-wide card.
  const params = parseSearchParams(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const names = await serviceNames();

  try {
    const full = await withDeadline(
      renderFull(params, names),
      RENDER_BUDGET_MS,
    );
    if (full) return full;
  } catch (error) {
    console.error("og card: falling back", error);
  }

  try {
    return await renderFallback(params, names);
  } catch (error) {
    // Nothing renders. Better an empty 200 the crawler ignores than a 500 it
    // remembers as a broken URL.
    console.error("og card: fallback render failed", error);
    return new Response(null, { status: 200, headers: headers("fallback") });
  }
}
