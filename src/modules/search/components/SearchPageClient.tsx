"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Loader2, SearchX } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { ClinicCard } from "@/modules/clinics/components/ClinicCard";
import type {
  ClinicMapCamera,
  ClinicMapHandle,
  ClinicMapMarker,
} from "@/modules/maps/components/ClinicMap";
import { MapErrorBoundary } from "@/modules/maps/components/MapErrorBoundary";
import type { MapBounds } from "@/modules/maps/types";
import { ActiveFilterChips, deriveActiveChips } from "./ActiveFilterChips";
import { AppShell } from "./AppShell";
import { RESULTS_SCROLL_SLOT } from "./ClinicBottomSheet";
import { ClinicPreview, type ClinicPreviewData } from "./ClinicPreview";
import { FilterBar } from "./FilterBar";
import { FilterSheet } from "./FilterSheet";
import { LocationPermissionPrompt } from "./LocationPermissionPrompt";
import { LocationSearch } from "./LocationSearch";
import { MapListToggle } from "./MapListToggle";
import { ResultsHeader } from "./ResultsHeader";
import { ResultsPlaceholder } from "./ResultsPlaceholder";
import {
  EMPTY_FILTER_STATE,
  countActiveFilters,
  type FilterState,
} from "./SearchFilters";
import { ServiceChip } from "./ServiceChip";
import { useSearchUI, type SheetSnap } from "../search-ui-context";
import {
  readMatchingSnapshot,
  snapshotSearch,
  writeSnapshot,
} from "../search-snapshot";
import {
  buildShellUrl,
  cameraKey,
  hasSearchIntent,
  paramsToQueryString,
} from "../query-string";
import type { SearchParams } from "../schemas";
import type { GeoResult } from "../use-geolocate";
import {
  isShellView,
  readStoredView,
  resolveInitialView,
  writeStoredView,
  type ShellView,
} from "../view-preference";

// MapLibre is heavy — load it only on the client, after the list renders.
const ClinicMap = dynamic(
  () => import("@/modules/maps/components/ClinicMap").then((m) => m.ClinicMap),
  { ssr: false },
);

interface SearchClinicRow {
  clinic_id: string;
  slug: string;
  name: string;
  status: string;
  address_line1: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  latitude: number;
  longitude: number;
  distance_km: number | null;
  is_open_now: boolean | null;
  service_names: string[];
  offers_online_services: boolean;
  offers_in_person_services?: boolean;
  wheelchair_accessible?: boolean | null;
  phone?: string | null;
  website?: string | null;
  last_verified_at: string | null;
  logo_url: string | null;
}

interface SearchResponse {
  clinics: SearchClinicRow[];
  nextCursor: string | null;
}

interface SearchPageClientProps {
  initialParams: SearchParams;
  initialResult: SearchResponse;
  serviceOptions: { slug: string; name: string }[];
  /** `?view=` from the URL, if any. */
  initialView?: string | null;
  /** `?sel=` from the URL, if any. */
  initialSelectedId?: string | null;
}

/** Whole-country framing for the empty state and text-only searches. */
const PHILIPPINES = { latitude: 12.6, longitude: 122.5 };
const METRO_MANILA = { latitude: 14.5995, longitude: 120.9842 };
const SHORTCUT_COUNT = 5;

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function toCardData(c: SearchClinicRow): ClinicPreviewData {
  return {
    id: c.clinic_id,
    slug: c.slug,
    name: c.name,
    status: c.status,
    address: c.address_line1,
    city: c.city,
    province: c.province,
    distanceKm: c.distance_km,
    serviceNames: c.service_names,
    isOpenNow: c.is_open_now,
    offersOnline: c.offers_online_services,
    offersInPerson: c.offers_in_person_services,
    wheelchairAccessible: c.wheelchair_accessible,
    lastVerifiedAt: c.last_verified_at,
    logoUrl: c.logo_url,
    latitude: c.latitude,
    longitude: c.longitude,
    phone: c.phone ?? null,
    website: c.website ?? null,
  };
}

/**
 * The map pane — lives inside <AppShell> so it can read the shared UI state
 * (hovered card) and move the mobile sheet when a marker is tapped.
 */
function SearchMap({
  markers,
  markersStale,
  center,
  zoom,
  cameraKey: key,
  onMoved,
  initialCamera,
  cameraRef,
}: {
  markers: ClinicMapMarker[];
  markersStale: boolean;
  center: { latitude: number; longitude: number };
  zoom: number;
  cameraKey: string | null;
  onMoved: (
    bounds: MapBounds,
    center: { latitude: number; longitude: number },
  ) => void;
  initialCamera: ClinicMapCamera | null;
  cameraRef: React.RefObject<ClinicMapHandle | null>;
}) {
  const { selectedId, setSelected, hoveredId, setSheetSnap, sheetSnap } =
    useSearchUI();
  return (
    <ClinicMap
      markers={markers}
      markersStale={markersStale}
      center={center}
      zoom={zoom}
      cameraKey={key}
      selectedId={selectedId}
      hoveredId={hoveredId}
      onSelect={(id) => {
        setSelected(id);
        // Bring the card into view without moving the camera; on mobile
        // lift the sheet so the preview is readable.
        document
          .querySelector(`[data-clinic-id="${id}"]`)
          ?.scrollIntoView({ block: "nearest" });
        if (sheetSnap === "collapsed") setSheetSnap("mid");
      }}
      onMoved={onMoved}
      initialCamera={initialCamera}
      cameraRef={cameraRef}
      className="h-full w-full"
    />
  );
}

/**
 * Results list + preview. Inside <AppShell> for the shared UI state. On
 * small screens the selected clinic's preview replaces the list (Back
 * returns); on desktop it sits above the list.
 */
function SearchResults({
  clinics,
  children,
}: {
  clinics: SearchClinicRow[];
  /** Empty state / load-more — rendered after the cards. */
  children?: ReactNode;
}) {
  const desktop = useIsDesktop();
  const { selectedId, setSelected, setHovered, sheetSnap, setSheetSnap } =
    useSearchUI();
  const selected = selectedId
    ? clinics.find((c) => c.clinic_id === selectedId)
    : undefined;
  const preview = selected ? toCardData(selected) : null;
  const previewOnly = !!preview && !desktop;
  const previewRef = useRef<HTMLElement>(null);
  // Mobile: the preview replaces the list — start it at the top of the sheet.
  useEffect(() => {
    if (previewOnly) previewRef.current?.scrollIntoView({ block: "start" });
  }, [previewOnly, selectedId]);

  function select(id: string) {
    setSelected(id);
    if (!desktop && sheetSnap === "collapsed") setSheetSnap("mid");
  }

  return (
    <>
      {preview && (
        <ClinicPreview
          ref={previewRef}
          key={preview.id}
          clinic={preview}
          variant={desktop ? "panel" : "sheet"}
          onClose={() => setSelected(null)}
          // Desktop: pinned above the list while it scrolls beneath.
          className={desktop ? "sticky top-0 z-10" : undefined}
        />
      )}
      <div
        className={cn(
          "flex flex-col gap-(--stack-gap)",
          previewOnly && "hidden",
        )}
        aria-hidden={previewOnly || undefined}
      >
        {clinics.map((clinic) => (
          <ClinicCard
            key={clinic.clinic_id}
            variant="compact"
            clinic={toCardData(clinic)}
            selected={clinic.clinic_id === selectedId}
            onSelect={select}
            onHoverChange={desktop ? setHovered : undefined}
          />
        ))}
        {children}
      </div>
    </>
  );
}

/**
 * The application: search state lives in the URL (always written to
 * /clinics — the homepage renders the same shell), results come from
 * /api/search, and the layout is delegated to <AppShell>.
 *
 * URL updates use history.replaceState (integrated with the Next router)
 * rather than router.replace so a search from "/" does not swap route
 * segments and remount the map.
 */
export function SearchPageClient({
  initialParams,
  initialResult,
  serviceOptions,
  initialView = null,
  initialSelectedId = null,
}: SearchPageClientProps) {
  const [params, setParams] = useState<SearchParams>(initialParams);
  const [selectedId, setSelectedIdState] = useState<string | null>(
    initialSelectedId,
  );
  // Back from a clinic page: the UI state saved when leaving (map camera,
  // list scroll, sheet height). Matched on the canonical URL of *this*
  // render's params (window.location still points at the previous page
  // while a client navigation renders). Client-only; nothing rendered
  // during hydration depends on it.
  const [snapshot] = useState(() =>
    readMatchingSnapshot(
      snapshotSearch(
        buildShellUrl({
          params: initialParams,
          view: isShellView(initialView) ? initialView : null,
          selectedId: initialSelectedId,
        }),
      ),
    ),
  );
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(
    () => snapshot?.sheetSnap ?? "collapsed",
  );
  const mapCameraRef = useRef<ClinicMapHandle | null>(null);
  const initialCamera = useMemo<ClinicMapCamera | null>(
    () =>
      snapshot?.mapCenter && snapshot.mapZoom != null
        ? { center: snapshot.mapCenter, zoom: snapshot.mapZoom }
        : null,
    [snapshot],
  );
  // Inline hint after location permission was denied / unavailable.
  const [locationHint, setLocationHint] = useState(false);
  // View: an explicit choice this session > the link's `?view=` > the device
  // preference (localStorage, read after hydration) > map.
  const [chosenView, setChosenView] = useState<ShellView | null>(null);
  const storedView = useSyncExternalStore(
    subscribeToStorage,
    readStoredView,
    () => null,
  );
  const view = chosenView ?? resolveInitialView(initialView, storedView);
  // Only write `view=` to the URL once the visitor (or the link) chose one.
  const [viewInUrl, setViewInUrl] = useState(initialView != null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pendingBounds, setPendingBounds] = useState<{
    bounds: MapBounds;
    center: { latitude: number; longitude: number };
  } | null>(null);
  const [extraPages, setExtraPages] = useState<SearchClinicRow[]>([]);
  // undefined = no page loaded past the first, so the first page's cursor
  // applies; null = the last page came back without one.
  const [moreCursor, setMoreCursor] = useState<string | null | undefined>(
    undefined,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const syncUrl = useCallback(
    (next: {
      params: SearchParams;
      view: ShellView;
      selectedId: string | null;
    }) => {
      if (typeof window === "undefined") return;
      const url = buildShellUrl({
        params: next.params,
        view: viewInUrl ? next.view : null,
        selectedId: next.selectedId,
      });
      window.history.replaceState(window.history.state, "", url);
    },
    [viewInUrl],
  );

  const queryString = paramsToQueryString(params);
  const initialQueryString = useMemo(
    () => paramsToQueryString(initialParams),
    [initialParams],
  );

  const { data, isFetching, isError, isPlaceholderData, refetch } =
    useQuery<SearchResponse>({
      queryKey: ["clinic-search", queryString],
      queryFn: async () => {
        const res = await fetch(`/api/search?${queryString}`);
        if (!res.ok) throw new Error("Search failed");
        return res.json();
      },
      initialData:
        queryString === initialQueryString ? initialResult : undefined,
      placeholderData: (previous) => previous,
    });

  const applyParams = useCallback(
    (next: SearchParams) => {
      setExtraPages([]);
      setMoreCursor(undefined);
      setSelectedIdState(null);
      setParams(next);
      syncUrl({ params: next, view, selectedId: null });
    },
    [syncUrl, view],
  );

  const setSelectedId = useCallback(
    (id: string | null) => {
      setSelectedIdState(id);
      syncUrl({ params, view, selectedId: id });
    },
    [params, syncUrl, view],
  );

  const setView = useCallback(
    (next: ShellView) => {
      setViewInUrl(true);
      setChosenView(next);
      writeStoredView(next);
      const url = buildShellUrl({ params, view: next, selectedId });
      window.history.replaceState(window.history.state, "", url);
    },
    [params, selectedId],
  );

  // Save where the visitor is before a clinic page opens (any link into
  // /clinics/<slug> from the results: card title, "View clinic", preview).
  const saveSnapshot = useCallback(() => {
    const list = document.querySelector<HTMLElement>(
      `[data-slot="${RESULTS_SCROLL_SLOT}"]`,
    );
    const camera = mapCameraRef.current?.getCamera() ?? null;
    writeSnapshot({
      url: buildShellUrl({
        params,
        view: viewInUrl ? view : null,
        selectedId,
      }),
      listScrollTop: list?.scrollTop ?? 0,
      mapCenter: camera?.center ?? null,
      mapZoom: camera?.zoom ?? null,
      sheetSnap,
      selectedId,
    });
  }, [params, selectedId, sheetSnap, view, viewInUrl]);

  function onResultsClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (/^\/clinics\/[^/?#]+/.test(href)) saveSnapshot();
  }

  const clinics = useMemo(
    () => [...(data?.clinics ?? []), ...extraPages],
    [data, extraPages],
  );

  const nextCursor =
    moreCursor === undefined ? (data?.nextCursor ?? null) : moreCursor;

  const markers: ClinicMapMarker[] = useMemo(
    () =>
      clinics.map((c) => ({
        id: c.clinic_id,
        slug: c.slug,
        name: c.name,
        latitude: c.latitude,
        longitude: c.longitude,
        verified: c.status === "published_verified",
      })),
    [clinics],
  );

  const searching = hasSearchIntent(params);
  const hasCoords = params.lat != null && params.lng != null;

  // "First" load = no search results have been on screen yet (fresh visit,
  // or the first search from the empty prompt — the prompt's data is not a
  // result list). Later fetches keep the previous results visible.
  const [shownResults, setShownResults] = useState(false);
  const haveFreshResults = searching && !!data && !isPlaceholderData;
  // Latches on the render fresh results arrive (state adjusted during
  // render, the React-sanctioned way to derive a sticky flag).
  if (haveFreshResults && !shownResults) setShownResults(true);
  const firstLoad = searching && isFetching && !shownResults;
  const updating = searching && isFetching && shownResults;

  // Nothing to scroll (no results / failed) — lift the collapsed sheet so
  // the explanation and its actions are on screen. Once per occurrence.
  const noResults =
    searching && !isFetching && (isError || (data?.clinics.length ?? 0) === 0);
  const [liftedFor, setLiftedFor] = useState<string | null>(null);
  if (noResults && liftedFor !== queryString) {
    setLiftedFor(queryString);
    if (sheetSnap === "collapsed") setSheetSnap("mid");
  }

  const mapCenter = useMemo(() => {
    if (params.lat != null && params.lng != null) {
      return { latitude: params.lat, longitude: params.lng };
    }
    if (!searching) return PHILIPPINES;
    if (clinics.length > 0) {
      return { latitude: clinics[0].latitude, longitude: clinics[0].longitude };
    }
    return METRO_MANILA;
  }, [params.lat, params.lng, clinics, searching]);
  const mapZoom = hasCoords ? 13 : searching ? 11 : 5.5;

  const filterState: FilterState = {
    services: params.services ?? [],
    ages: params.ages ?? [],
    verified: params.verified ?? false,
    online: params.online ?? false,
    inperson: params.inperson ?? false,
    open: params.open ?? false,
    accessible: params.accessible ?? false,
    radius: params.radius,
  };

  function onFiltersChange(next: FilterState) {
    applyParams({
      ...params,
      services: next.services.length ? next.services : undefined,
      ages: next.ages.length ? (next.ages as SearchParams["ages"]) : undefined,
      verified: next.verified || undefined,
      online: next.online || undefined,
      inperson: next.inperson || undefined,
      open: next.open || undefined,
      accessible: next.accessible || undefined,
      radius: next.radius,
      cursor: undefined,
    });
  }

  function clearFilters() {
    onFiltersChange({ ...EMPTY_FILTER_STATE, radius: params.radius });
  }

  function clearLocation() {
    applyParams({
      ...params,
      lat: undefined,
      lng: undefined,
      north: undefined,
      south: undefined,
      east: undefined,
      west: undefined,
      loc: undefined,
      q: undefined,
      cursor: undefined,
    });
  }

  function onLocation({ latitude, longitude, label }: GeoResult) {
    applyParams({
      ...params,
      lat: latitude,
      lng: longitude,
      north: undefined,
      south: undefined,
      east: undefined,
      west: undefined,
      loc: label,
      q: undefined,
      cursor: undefined,
    });
  }

  function toggleService(slug: string) {
    const current = filterState.services;
    onFiltersChange({
      ...filterState,
      services: current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug],
    });
  }

  const nextRadius = !hasCoords
    ? 50
    : params.radius < 25
      ? 25
      : params.radius < 50
        ? 50
        : 100;
  const canExpand = !hasCoords || params.radius < 100;

  function expandSearchArea() {
    applyParams({
      ...params,
      radius: nextRadius,
      north: undefined,
      south: undefined,
      east: undefined,
      west: undefined,
      cursor: undefined,
    });
  }

  function onSearchThisArea() {
    if (!pendingBounds) return;
    applyParams({
      ...params,
      lat: pendingBounds.center.latitude,
      lng: pendingBounds.center.longitude,
      north: pendingBounds.bounds.north,
      south: pendingBounds.bounds.south,
      east: pendingBounds.bounds.east,
      west: pendingBounds.bounds.west,
      loc: undefined,
      cursor: undefined,
    });
    setPendingBounds(null);
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/search?${queryString}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (res.ok) {
        const page = (await res.json()) as SearchResponse;
        setExtraPages((prev) => [...prev, ...page.clinics]);
        setMoreCursor(page.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const activeFilterCount = countActiveFilters(filterState);
  // Filters that only live in the "More filters" sheet.
  const moreCount =
    (filterState.verified ? 1 : 0) + (filterState.inperson ? 1 : 0);

  const locationLabel = params.loc ?? (params.q ? `“${params.q}”` : null);
  const serviceLabel =
    filterState.services.length > 0
      ? filterState.services
          .slice(0, 2)
          .map((slug) => serviceOptions.find((s) => s.slug === slug)?.name)
          .filter(Boolean)
          .join(", ") +
        (filterState.services.length > 2
          ? ` +${filterState.services.length - 2}`
          : "")
      : null;

  // The search field itself shows (and clears) the place, so chips are
  // filters only.
  const chips = deriveActiveChips({
    filters: filterState,
    serviceOptions,
    onFiltersChange,
  });

  const resultsCount = clinics.length;

  const mapElement = (
    <div className="relative h-full min-h-[320px]">
      <MapErrorBoundary
        fallback={
          <div className="grid h-full min-h-[320px] place-items-center bg-secondary px-4 text-center text-sm text-muted-foreground">
            Map unavailable in this browser. All clinics are shown in the
            results list.
          </div>
        }
      >
        <SearchMap
          markers={markers}
          markersStale={isPlaceholderData}
          center={mapCenter}
          zoom={mapZoom}
          cameraKey={cameraKey(params)}
          onMoved={(bounds, center) => setPendingBounds({ bounds, center })}
          initialCamera={initialCamera}
          cameraRef={mapCameraRef}
        />
      </MapErrorBoundary>
      {pendingBounds && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <Button
            onClick={onSearchThisArea}
            size="lg"
            className="border border-primary-hover"
          >
            Search this area
          </Button>
        </div>
      )}
    </div>
  );

  const toggle = (
    <MapListToggle value={view} onChange={setView} className="md:hidden" />
  );

  const searchBlock = (
    <>
      {!searching && (
        <h2 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">
          Where are you looking for support?
        </h2>
      )}
      <LocationSearch
        ref={searchInputRef}
        initialQuery={params.loc ?? params.q ?? ""}
        onLocation={onLocation}
        onTextSearch={(text) =>
          applyParams({ ...params, q: text || undefined, cursor: undefined })
        }
        onLocateDenied={() => {
          setLocationHint(true);
          searchInputRef.current?.focus();
        }}
        onClear={() => {
          if (locationLabel) clearLocation();
        }}
      />
      {locationHint && (
        <p
          id="location-hint"
          role="status"
          className="text-sm text-muted-foreground"
        >
          Location is off — that&apos;s fine. Type a city, province, or barangay
          above to search.
        </p>
      )}
    </>
  );

  const filtersBlock = (
    <div className="flex flex-col gap-2">
      <FilterBar
        serviceOptions={serviceOptions}
        value={filterState}
        onChange={onFiltersChange}
        onOpenMore={() => setMoreOpen(true)}
        moreCount={moreCount}
        showDistance={hasCoords}
      />
      <ActiveFilterChips chips={chips} onClearAll={clearFilters} />
    </div>
  );

  const shortcuts = serviceOptions.slice(0, SHORTCUT_COUNT);

  const emptyHeader = (
    <div className="flex items-center justify-between gap-3 md:hidden">
      <p className="text-sm text-muted-foreground">
        Search a place, or start with a service.
      </p>
      {toggle}
    </div>
  );

  const resultsHeader = (
    <ResultsHeader
      count={resultsCount}
      context={[serviceLabel, locationLabel]}
      loading={firstLoad}
      updating={updating}
      error={isError && !data}
      trailing={toggle}
    />
  );

  return (
    <>
      <AppShell
        view={view}
        search={searchBlock}
        filters={filtersBlock}
        resultsHeader={searching ? resultsHeader : emptyHeader}
        map={mapElement}
        selectedId={selectedId}
        onSelectedChange={setSelectedId}
        sheetSnap={sheetSnap}
        onSheetSnapChange={setSheetSnap}
        initialListScrollTop={snapshot?.listScrollTop}
      >
        {!searching ? (
          <>
            <LocationPermissionPrompt
              onLocated={onLocation}
              onDenied={() => {
                setLocationHint(true);
                searchInputRef.current?.focus();
              }}
            />
            {shortcuts.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Popular services
                </p>
                <ul className="flex flex-wrap gap-2" aria-label="Services">
                  {shortcuts.map((service) => (
                    <li key={service.slug}>
                      <ServiceChip
                        label={service.name}
                        pressed={filterState.services.includes(service.slug)}
                        onClick={() => toggleService(service.slug)}
                      />
                    </li>
                  ))}
                  {serviceOptions.length > SHORTCUT_COUNT && (
                    <li>
                      <ServiceChip
                        label="More"
                        more
                        onClick={() => setMoreOpen(true)}
                      />
                    </li>
                  )}
                </ul>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Or{" "}
              <button
                type="button"
                className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => applyParams({ ...params, sort: "alphabetical" })}
              >
                browse every clinic
              </button>
              .
            </p>
          </>
        ) : isError && !data ? (
          <ErrorState
            title="We couldn't load clinics right now."
            body="Your search hasn't been lost — your location and filters are still set."
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        ) : firstLoad ? (
          <ResultsPlaceholder />
        ) : (
          <div className="contents" onClickCapture={onResultsClickCapture}>
            {isError && (
              <ErrorState
                title="We couldn't refresh these results."
                body="Showing the last results we had. Your location and filters are still set."
                onRetry={() => void refetch()}
                retrying={isFetching}
                className="p-4 sm:p-4"
              />
            )}
            <SearchResults clinics={clinics}>
              {clinics.length === 0 && !isFetching && (
                <EmptyState
                  icon={<SearchX className="size-5" aria-hidden />}
                  title="We couldn't find a matching clinic nearby."
                  body="Try a wider area or fewer filters. If you know a clinic here, you can suggest it so other families can find it too."
                  actions={
                    <>
                      {canExpand && (
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={expandSearchArea}
                        >
                          Expand search area
                          {hasCoords && (
                            <span className="font-normal text-muted-foreground">
                              to {nextRadius} km
                            </span>
                          )}
                        </Button>
                      )}
                      {activeFilterCount > 0 && (
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={clearFilters}
                        >
                          Remove filters
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="lg"
                        render={<Link href="/services" />}
                      >
                        Browse all services
                      </Button>
                      <Button
                        variant="ghost"
                        size="lg"
                        render={<Link href="/suggest-clinic" />}
                      >
                        Suggest a clinic
                      </Button>
                    </>
                  }
                />
              )}
              {nextCursor && (
                <div className="py-4 text-center">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore && (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    )}
                    Load more clinics
                  </Button>
                </div>
              )}
            </SearchResults>
          </div>
        )}
      </AppShell>

      <FilterSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        serviceOptions={serviceOptions}
        value={filterState}
        onChange={onFiltersChange}
        onClearAll={clearFilters}
        showRadius={hasCoords}
        sort={params.sort}
        onSortChange={(sort) =>
          applyParams({ ...params, sort, cursor: undefined })
        }
        resultsCount={searching ? resultsCount : null}
      />
    </>
  );
}
