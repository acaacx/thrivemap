"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Map as MapIcon, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotionProvider } from "@/components/motion-provider";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import {
  SearchUIProvider,
  useSearchUI,
  type SheetSnap,
} from "../search-ui-context";
import type { ShellView } from "../view-preference";
import { ClinicBottomSheet, useHydrated } from "./ClinicBottomSheet";

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
  /** Controlled sheet position (mobile map view). */
  sheetSnap?: SheetSnap;
  initialSheetSnap?: SheetSnap;
  onSheetSnapChange?: (snap: SheetSnap) => void;
  /** Scroll offset of the results list to restore on mount (Back). */
  initialListScrollTop?: number;
}

/**
 * Full-height application shell under the compact header.
 *
 * Desktop (≥ md): two columns — panel 40% (search, filters, results scroll)
 * and a persistent map 60%. Mobile: search strip on top; below it the map
 * fills the viewport and results live in a draggable bottom sheet over the
 * map (`view="map"`), or the list takes the whole area (`view="list"`). The
 * map mounts the first time its pane is actually shown and is only hidden
 * with CSS after that, so MapLibre keeps its viewport across toggles.
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
  sheetSnap,
  initialSheetSnap,
  onSheetSnapChange,
  initialListScrollTop,
}: AppShellProps) {
  return (
    <MotionProvider>
      <SearchUIProvider
        selectedId={selectedId}
        initialSelectedId={initialSelectedId}
        onSelectedChange={onSelectedChange}
        sheetSnap={sheetSnap}
        initialSheetSnap={initialSheetSnap}
        onSheetSnapChange={onSheetSnapChange}
      >
        <ShellLayout
          view={view}
          search={search}
          filters={filters}
          resultsHeader={resultsHeader}
          map={map}
          initialListScrollTop={initialListScrollTop}
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
  initialListScrollTop,
}: Pick<
  AppShellProps,
  | "view"
  | "search"
  | "filters"
  | "resultsHeader"
  | "children"
  | "map"
  | "initialListScrollTop"
>) {
  const desktop = useIsDesktop();
  const { selectedId, sheetSnap, setSheetSnap } = useSearchUI();
  const mapView = view === "map";
  const sheet = mapView && !desktop;
  const [desktopMapOpen, setDesktopMapOpen] = useState(true);
  const showMapButtonRef = useRef<HTMLButtonElement>(null);
  const hideMapButtonRef = useRef<HTMLButtonElement>(null);
  const shouldFocusDesktopMapToggle = useRef(false);
  useEffect(() => {
    if (!shouldFocusDesktopMapToggle.current) {
      return;
    }

    const target = desktopMapOpen ? hideMapButtonRef : showMapButtonRef;
    target.current?.focus();
    shouldFocusDesktopMapToggle.current = false;
  }, [desktopMapOpen]);
  const toggleDesktopMap = (open: boolean) => {
    shouldFocusDesktopMapToggle.current = true;
    setDesktopMapOpen(open);
  };
  // The map pane is hidden with CSS on phones in list view. Don't mount
  // MapLibre behind it — an invisible 0x0 canvas still costs a WebGL context
  // plus the style, glyph and tile downloads. Once revealed it stays mounted,
  // so toggling List/Map keeps the camera instead of re-downloading.
  const [mapRevealed, setMapRevealed] = useState(false);
  if (!mapRevealed && (desktop || mapView)) {
    setMapRevealed(true);
  }
  // `data-hydrated` = the shell is interactive (tests wait on it before
  // clicking; a click before hydration is silently lost).
  const hydrated = useHydrated();

  return (
    <div
      data-slot="app-shell"
      data-hydrated={hydrated ? "" : undefined}
      data-desktop-map={desktopMapOpen ? "open" : "closed"}
      className={cn(
        "relative flex h-[calc(100dvh-var(--app-header-h))] min-h-0 flex-col overflow-hidden bg-background md:grid",
        "md:transition-[grid-template-columns] md:duration-200 md:ease-[cubic-bezier(0.22,0.61,0.36,1)] md:motion-reduce:transition-none",
        desktopMapOpen
          ? "md:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]"
          : "md:grid-cols-[minmax(0,1fr)_minmax(0,0fr)]",
      )}
    >
      <section
        aria-label="Search"
        className={cn("flex min-h-0 flex-col", desktopMapOpen && "md:border-r")}
      >
        <div className="flex flex-col gap-2 border-b bg-background px-3 pb-3 pt-3 sm:px-4">
          {search}
          {filters}
        </div>

        {!desktopMapOpen && (
          <div className="hidden shrink-0 justify-end border-b px-4 py-2 md:flex">
            <Button
              ref={showMapButtonRef}
              variant="outline"
              onClick={() => toggleDesktopMap(true)}
              aria-label="Show map"
            >
              <MapIcon aria-hidden />
              Show map
            </Button>
          </div>
        )}

        <ClinicBottomSheet
          enabled={sheet}
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          header={resultsHeader}
          initialScrollTop={initialListScrollTop}
        >
          {children}
        </ClinicBottomSheet>
      </section>

      <section
        aria-label="Map"
        aria-hidden={!desktopMapOpen && desktop ? true : undefined}
        inert={!desktopMapOpen && desktop ? true : undefined}
        className={cn(
          "relative min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          "md:transition-opacity md:duration-[160ms] md:ease-[cubic-bezier(0.22,0.61,0.36,1)] md:motion-reduce:transition-none",
          mapView ? "flex" : "hidden md:flex",
          !desktopMapOpen && "md:pointer-events-none md:opacity-0",
        )}
      >
        <div className="hidden min-h-[4.5rem] shrink-0 items-center justify-between gap-4 border-b bg-background px-5 md:flex">
          <div className="min-w-0">
            <h2 className="font-semibold">Map preview</h2>
            <p className="truncate text-sm text-muted-foreground">
              {selectedId
                ? "Showing area around selected clinic"
                : "Select a clinic to focus the map"}
            </p>
          </div>
          <Button
            ref={hideMapButtonRef}
            variant="ghost"
            onClick={() => toggleDesktopMap(false)}
            aria-label="Hide map"
          >
            <PanelRightClose aria-hidden />
            Hide map
          </Button>
        </div>
        <div className="relative min-h-0 flex-1">
          {mapRevealed ? map : null}
        </div>
      </section>
    </div>
  );
}
