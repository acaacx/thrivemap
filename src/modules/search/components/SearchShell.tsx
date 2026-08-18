import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { getServices, searchClinics } from "@/modules/clinics/queries";
import type { SearchParams } from "../schemas";
import { SearchPageClient } from "./SearchPageClient";

interface SearchShellProps {
  params: SearchParams;
  /** Raw `?view=` / `?sel=` (UI state, not part of the search schema). */
  view?: string | null;
  selectedId?: string | null;
  /**
   * Homepage builds must succeed without a reachable database (CI builds
   * against placeholder env); ISR re-renders with live data once serving.
   */
  tolerateDataErrors?: boolean;
}

/**
 * The application shell as a server component: compact header + the search
 * client with its first page of results. Rendered by both `/` and
 * `/clinics` so the homepage *is* the app.
 */
export async function SearchShell({
  params,
  view = null,
  selectedId = null,
  tolerateDataErrors = false,
}: SearchShellProps) {
  const load = Promise.all([searchClinics(params), getServices()]);
  const [initialResult, services] = tolerateDataErrors
    ? await load.catch(
        () => [{ clinics: [], nextCursor: null }, []] as Awaited<typeof load>,
      )
    : await load;

  return (
    <>
      <SiteHeader variant="app" />
      <main id="main-content" className="flex flex-1 flex-col">
        <h1 className="sr-only">Find therapy centers near you</h1>
        <Suspense>
          <SearchPageClient
            initialParams={params}
            initialResult={initialResult}
            serviceOptions={services.map((s) => ({
              slug: s.slug,
              name: s.name,
            }))}
            initialView={view}
            initialSelectedId={selectedId}
          />
        </Suspense>
      </main>
    </>
  );
}
