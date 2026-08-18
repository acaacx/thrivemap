"use client";

import type { ReactNode } from "react";
import { MotionProvider } from "@/components/motion-provider";
import { cn } from "@/lib/utils";
import { SearchUIProvider, type SheetSnap } from "../search-ui-context";
import type { ShellView } from "../view-preference";

interface AppShellProps {
  /** Mobile List | Map. Desktop always shows both. */
  view: ShellView;
  /** Search input (+ optional heading) — top of the panel on every screen. */
  search: ReactNode;
  /** Filter row under the search. */
  filters?: ReactNode;
  /** Results header, list, empty/error states — the scrolling region. */
  children: ReactNode;
  map: ReactNode;
  /** Controlled selection — the search page mirrors it to the URL and map. */
  selectedId?: string | null;
  initialSelectedId?: string | null;
  onSelectedChange?: (id: string | null) => void;
  initialSheetSnap?: SheetSnap;
}

/**
 * Full-height application shell under the compact header.
 *
 * Desktop (≥ md): two columns — panel 40% (search, filters, results scroll)
 * and a persistent map 60%. Mobile: search strip on top; below it the map
 * fills the viewport and results sit in a bottom panel over the map
 * (`view="map"`), or the list takes the whole area (`view="list"`). The map
 * is hidden with CSS, never unmounted, so MapLibre keeps its viewport.
 *
 * The results block is one DOM node in every layout — it only changes how
 * it is positioned — so cards, live regions and ids are never duplicated.
 * On mobile it is the placeholder where `ClinicBottomSheet` mounts.
 */
export function AppShell({
  view,
  search,
  filters,
  children,
  map,
  selectedId,
  initialSelectedId,
  onSelectedChange,
  initialSheetSnap,
}: AppShellProps) {
  const mapView = view === "map";
  return (
    <MotionProvider>
      <SearchUIProvider
        selectedId={selectedId}
        initialSelectedId={initialSelectedId}
        onSelectedChange={onSelectedChange}
        initialSheetSnap={initialSheetSnap}
      >
        <div
          data-slot="app-shell"
          className="relative flex h-[calc(100dvh-var(--app-header-h))] min-h-0 flex-col overflow-hidden bg-background md:grid md:grid-cols-[minmax(340px,2fr)_3fr]"
        >
          <section
            aria-label="Search"
            className="flex min-h-0 flex-col md:border-r"
          >
            <div className="flex flex-col gap-2 border-b bg-background px-3 pb-3 pt-3 sm:px-4">
              {search}
              {filters}
            </div>

            <div
              data-slot="results-region"
              role="region"
              aria-label="Search results"
              className={cn(
                "min-h-0 overflow-y-auto overscroll-contain bg-background",
                mapView
                  ? "absolute inset-x-0 bottom-0 z-10 max-h-[46%] rounded-t-xl border-t md:static md:max-h-none md:flex-1 md:rounded-none md:border-t-0"
                  : "flex-1",
              )}
            >
              {mapView && (
                <div
                  aria-hidden
                  className="grid place-items-center pt-2 md:hidden"
                >
                  <span className="h-1 w-10 rounded-full bg-border" />
                </div>
              )}
              <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
                {children}
              </div>
            </div>
          </section>

          <section
            aria-label="Map"
            className={cn(
              "relative min-h-0 flex-1",
              !mapView && "hidden md:block",
            )}
          >
            {map}
          </section>
        </div>
      </SearchUIProvider>
    </MotionProvider>
  );
}
