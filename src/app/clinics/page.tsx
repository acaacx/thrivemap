import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServices, searchClinics } from "@/modules/clinics/queries";
import { SearchPageClient } from "@/modules/search/components/SearchPageClient";
import { parseSearchParams } from "@/modules/search/schemas";

export const metadata: Metadata = {
  title: "Find clinics",
  description:
    "Search therapy centers and developmental clinics across the Philippines on an interactive map. Filter by service, age group, accessibility, and more.",
  alternates: { canonical: "/clinics" },
};

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
