import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { siteConfig } from "@/lib/site-config";
import { getServices, searchClinics } from "@/modules/clinics/queries";
import { SearchPageClient } from "@/modules/search/components/SearchPageClient";
import { parseSearchParams } from "@/modules/search/schemas";
import { buildFallbackLabels } from "@/modules/share/og/label";

/** Query keys that change what the card shows. `cursor` deliberately does not. */
const CARD_PARAMS = [
  "q",
  "lat",
  "lng",
  "radius",
  "north",
  "south",
  "east",
  "west",
  "services",
  "ages",
  "verified",
  "online",
  "inperson",
  "open",
  "accessible",
  "loc",
] as const;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const raw = await searchParams;
  const params = parseSearchParams(raw);

  // Service names would cost a DB round trip in the metadata pass; label.ts
  // de-slugs when the map is empty, and the card image itself does the lookup
  // properly. A title reading "Occupational therapy" either way is worth more
  // than the query.
  const labels = buildFallbackLabels(params, {});

  const query = new URLSearchParams();
  for (const key of CARD_PARAMS) {
    const value = raw[key];
    const flat = Array.isArray(value) ? value[0] : value;
    if (flat) query.set(key, flat);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  // Crawlers need a fully-qualified og:image — metadataBase resolution is not
  // enough for every one of them, and there is no absoluteUrl() helper here.
  // NOTE: siteConfig.url falls back to http://localhost:3000 when
  // NEXT_PUBLIC_SITE_URL is unset, which would break every card on the site at
  // once with a perfectly healthy route. The deploy smoke check guards it.
  const imageUrl = `${siteConfig.url}/api/og/search${suffix}`;
  const pageUrl = `${siteConfig.url}/clinics${suffix}`;

  return {
    title: labels.headline,
    description: labels.description,
    // Canonical stays on the bare path for SEO; og:url carries the filters.
    // Facebook keys its cache on og:url, so a stripped one would collapse
    // every filter variant into a single shared preview. og:url also takes
    // precedence over rel=canonical for the crawler, so the two can diverge.
    alternates: { canonical: "/clinics" },
    openGraph: {
      // The root layout sets these too, but Next overwrites nested metadata
      // objects wholesale — no deep merge — so declaring openGraph here would
      // otherwise drop og:type, og:site_name and og:locale from this page.
      type: "website",
      siteName: siteConfig.name,
      locale: "en_PH",
      url: pageUrl,
      // Set explicitly: openGraph.title is not documented to inherit from
      // `title`, and the bare headline is wanted here anyway — og:site_name
      // already carries the brand and card width is scarce.
      title: labels.headline,
      description: labels.description,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: labels.alt }],
    },
  };
}

export default async function ClinicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = parseSearchParams(raw);
  const [initialResult, services] = await Promise.all([
    searchClinics(params),
    getServices(),
  ]);

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex flex-1 flex-col">
        <h1 className="sr-only">Find therapy and developmental clinics</h1>
        <Suspense>
          <SearchPageClient
            initialParams={params}
            initialResult={initialResult}
            serviceOptions={services.map((s) => ({
              slug: s.slug,
              name: s.name,
            }))}
          />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
