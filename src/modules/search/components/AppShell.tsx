"use client";

import type { ReactNode } from "react";
import { MotionProvider } from "@/components/motion-provider";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import {
  SearchUIProvider,
  useSearchUI,
  type SheetSnap,
} from "../search-ui-context";
import type { ShellView } from "../view-preference";
import { ClinicBottomSheet } from "./ClinicBottomSheet";

interface AppShellProps {
  /** Mobile List | Map. Desktop always shows both. */
  view: ShellView;
  /** Search input (+ optional heading) — top of the panel on every screen. */
  search: ReactNode;
  /** Filter row under the search. */
  filters?: ReactNode;
  /** Results header — pinned above the list; on mobile it is the sheet's
   *  always-visible row and drag area. */
  resultsHeader?: ReactNode;
  /** Results list, empty/error states — the scrolling region. */
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
 * fills the viewport and results live in a draggable bottom sheet over the
 * map (`view="map"`), or the list takes the whole area (`view="list"`). The
 * map is hidden with CSS, never unmounted, so MapLibre keeps its viewport.
 *
 * The results block is one DOM node in every layout — it only changes how
 * it is positioned — so cards, live regions and ids are never duplicated.
 */
export function AppShell({
  view,
  search,
  filters,
  resultsHeader,
  children,
  map,
  selectedId,
  initialSelectedId,
  onSelectedChange,
  initialSheetSnap,
}: AppShellProps) {
  return (
    <MotionProvider>
      <SearchUIProvider
        selectedId={selectedId}
        initialSelectedId={initialSelectedId}
        onSelectedChange={onSelectedChange}
        initialSheetSnap={initialSheetSnap}
      >
        <ShellLayout
          view={view}
          search={search}
          filters={filters}
          resultsHeader={resultsHeader}
          map={map}
        >
          {children}
        </ShellLayout>
      </SearchUIProvider>
    </MotionProvider>
  );
}

function ShellLayout({
  view,
  search,
  filters,
  resultsHeader,
  children,
  map,
}: Pick<
  AppShellProps,
  "view" | "search" | "filters" | "resultsHeader" | "children" | "map"
>) {
  const desktop = useIsDesktop();
  const { sheetSnap, setSheetSnap } = useSearchUI();
  const mapView = view === "map";
  const sheet = mapView && !desktop;

  return (
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

        <ClinicBottomSheet
          enabled={sheet}
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          header={resultsHeader}
        >
          {children}
        </ClinicBottomSheet>
      </section>

      <section
        aria-label="Map"
        className={cn("relative min-h-0 flex-1", !mapView && "hidden md:block")}
      >
        {map}
      </section>
    </div>
  );
}
