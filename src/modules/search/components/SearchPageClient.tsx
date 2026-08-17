"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Loader2, SearchX } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { cn } from "@/lib/utils";
import { ClinicCard } from "@/modules/clinics/components/ClinicCard";
import type { ClinicMapMarker } from "@/modules/maps/components/ClinicMap";
import { MapErrorBoundary } from "@/modules/maps/components/MapErrorBoundary";
import type { MapBounds } from "@/modules/maps/types";
import { ShareButton } from "@/modules/share/components/ShareButton";
import { ActiveFilterChips, deriveActiveChips } from "./ActiveFilterChips";
import { FilterBar } from "./FilterBar";
import { LocationSearchBox } from "./LocationSearchBox";
import {
  DESKTOP_VIEW_OPTIONS,
  MOBILE_VIEW_OPTIONS,
  MapListToggle,
} from "./MapListToggle";
import {
  EMPTY_FILTER_STATE,
  SearchFilters,
  countActiveFilters,
  type FilterState,
} from "./SearchFilters";
import type { SearchParams, SortOption } from "../schemas";

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
}

const METRO_MANILA = { latitude: 14.5995, longitude: 120.9842 };

const SORT_LABELS: Record<SortOption, string> = {
  nearest: "Nearest",
  relevance: "Most relevant",
  verified_first: "Verified first",
  recently_verified: "Recently verified",
  alphabetical: "Alphabetical",
};

function paramsToQueryString(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.lat != null) qs.set("lat", params.lat.toFixed(5));
  if (params.lng != null) qs.set("lng", params.lng.toFixed(5));
  if (params.radius !== 10) qs.set("radius", String(params.radius));
  if (params.north != null) qs.set("north", params.north.toFixed(5));
  if (params.south != null) qs.set("south", params.south.toFixed(5));
  if (params.east != null) qs.set("east", params.east.toFixed(5));
  if (params.west != null) qs.set("west", params.west.toFixed(5));
  if (params.services?.length) qs.set("services", params.services.join(","));
  if (params.ages?.length) qs.set("ages", params.ages.join(","));
  if (params.verified) qs.set("verified", "1");
  if (params.online) qs.set("online", "1");
  if (params.inperson) qs.set("inperson", "1");
  if (params.open) qs.set("open", "1");
  if (params.accessible) qs.set("accessible", "1");
  if (params.sort !== "nearest") qs.set("sort", params.sort);
  if (params.loc) qs.set("loc", params.loc);
  return qs.toString();
}

function toCardData(c: SearchClinicRow) {
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
  };
}

export function SearchPageClient({
  initialParams,
  initialResult,
  serviceOptions,
}: SearchPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [params, setParams] = useState<SearchParams>(initialParams);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [desktopView, setDesktopView] = useState<"split" | "list">("split");
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

  const queryString = paramsToQueryString(params);
  const initialQueryString = useMemo(
    () => paramsToQueryString(initialParams),
    [initialParams],
  );

  const { data, isFetching, isError, refetch } = useQuery<SearchResponse>({
    queryKey: ["clinic-search", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/search?${queryString}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    initialData: queryString === initialQueryString ? initialResult : undefined,
    placeholderData: (previous) => previous,
  });

  const applyParams = useCallback(
    (next: SearchParams) => {
      setExtraPages([]);
      setMoreCursor(undefined);
      setSelectedId(null);
      setParams(next);
      const qs = paramsToQueryString(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

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

  const mapCenter = useMemo(() => {
    if (params.lat != null && params.lng != null) {
      return { latitude: params.lat, longitude: params.lng };
    }
    if (clinics.length > 0) {
      return { latitude: clinics[0].latitude, longitude: clinics[0].longitude };
    }
    return METRO_MANILA;
  }, [params.lat, params.lng, clinics]);

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

  function expandSearchArea() {
    const hasCenter = params.lat != null && params.lng != null;
    applyParams({
      ...params,
      radius: hasCenter ? Math.min(100, Math.max(25, params.radius * 2)) : 50,
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

  const chips = deriveActiveChips({
    filters: filterState,
    serviceOptions,
    location: locationLabel,
    onFiltersChange,
    onClearLocation: clearLocation,
  });

  const selectedClinic = clinics.find((c) => c.clinic_id === selectedId);
  const showingMapDesktop = desktopView === "split";

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
        <ClinicMap
          markers={markers}
          center={mapCenter}
          zoom={params.lat != null ? 13 : 11}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            document
              .querySelector(`[data-clinic-id="${id}"]`)
              ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }}
          onMoved={(bounds, center) => setPendingBounds({ bounds, center })}
          className="h-full w-full"
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
      {/* Mobile preview for a selected marker */}
      {selectedClinic && (
        <div className="absolute inset-x-3 bottom-3 z-10 md:hidden">
          <ClinicCard clinic={toCardData(selectedClinic)} selected />
        </div>
      )}
    </div>
  );

  const resultsCount = clinics.length;
  const countLabel = `${resultsCount} clinic${resultsCount === 1 ? "" : "s"} found${
    params.loc ? ` near ${params.loc}` : params.q ? ` for “${params.q}”` : ""
  }`;

  return (
    <div className="flex flex-1 flex-col">
      {/* Toolbar */}
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1 lg:max-w-2xl">
              <LocationSearchBox
                submitLabel="Search"
                onLocation={({ latitude, longitude, label }) =>
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
                  })
                }
                onTextSearch={(text) =>
                  applyParams({
                    ...params,
                    q: text || undefined,
                    cursor: undefined,
                  })
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <ShareButton />
              <MapListToggle
                label="Choose list or map view"
                value={mobileView}
                onChange={setMobileView}
                options={MOBILE_VIEW_OPTIONS}
                className="md:hidden"
              />
              <MapListToggle
                label="Choose map and list, or list only"
                value={desktopView}
                onChange={setDesktopView}
                options={DESKTOP_VIEW_OPTIONS}
                className="hidden md:inline-flex"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterBar
              serviceOptions={serviceOptions}
              value={filterState}
              onChange={onFiltersChange}
              onOpenMore={() => setMoreOpen(true)}
              moreCount={moreCount}
              totalCount={activeFilterCount}
              className="min-w-0 flex-1"
            />
            <Select
              value={params.sort}
              items={SORT_LABELS}
              onValueChange={(sort) =>
                applyParams({
                  ...params,
                  sort: sort as SortOption,
                  cursor: undefined,
                })
              }
            >
              <SelectTrigger
                className="w-52 data-[size=default]:h-11"
                aria-label="Sort results"
              >
                <span className="text-muted-foreground">Sort:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORT_LABELS).map(([sortValue, label]) => (
                  <SelectItem key={sortValue} value={sortValue}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ActiveFilterChips chips={chips} onClearAll={clearFilters} />
        </div>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="left"
          className="w-full max-w-sm overflow-y-auto p-6"
        >
          <SheetHeader className="p-0 pb-4">
            <SheetTitle className="text-lg font-semibold">
              More filters
            </SheetTitle>
            <SheetDescription>
              Narrow results by service, age group, and listed options.
              {activeFilterCount > 0 &&
                ` ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active.`}
            </SheetDescription>
          </SheetHeader>
          <SearchFilters
            serviceOptions={serviceOptions}
            value={filterState}
            onChange={onFiltersChange}
            showRadius={params.lat != null}
          />
          <div className="mt-6 flex gap-2 border-t pt-4">
            <Button size="lg" onClick={() => setMoreOpen(false)}>
              Show {resultsCount} clinic{resultsCount === 1 ? "" : "s"}
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="lg" onClick={clearFilters}>
                Clear all
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Results + map split. The map stays mounted in every view — it is
          hidden with CSS so MapLibre keeps its viewport and pending
          "Search this area" state across toggles. */}
      <div
        className={cn(
          "mx-auto grid w-full max-w-[1600px] flex-1",
          showingMapDesktop
            ? "md:grid-cols-[minmax(360px,40%)_1fr]"
            : "md:grid-cols-1",
        )}
      >
        <section
          aria-label="Clinic results"
          className={cn(
            "min-h-0 overflow-y-auto px-4 py-4 sm:px-6 md:max-h-[calc(100vh-4rem)]",
            showingMapDesktop
              ? "md:border-r"
              : "md:mx-auto md:w-full md:max-w-3xl",
            mobileView === "map" ? "hidden md:block" : "",
          )}
        >
          <div
            aria-live="polite"
            className="mb-4 flex min-h-6 items-center gap-2 text-sm text-muted-foreground"
          >
            {isFetching && !data ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Searching for clinics…
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {countLabel}
                </span>
                {isFetching && (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Updating…
                  </span>
                )}
              </>
            )}
          </div>

          {isError && !data ? (
            <ErrorState
              title="We couldn't load clinics right now."
              body="Your search hasn't been lost — your location and filters are still set."
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          ) : (
            <div className="flex flex-col gap-(--stack-gap)">
              {clinics.map((clinic) => (
                <ClinicCard
                  key={clinic.clinic_id}
                  clinic={toCardData(clinic)}
                  selected={clinic.clinic_id === selectedId}
                  onSelect={setSelectedId}
                />
              ))}
              {clinics.length === 0 && !isFetching && (
                <EmptyState
                  icon={<SearchX className="size-5" aria-hidden />}
                  title="We couldn't find a matching clinic nearby."
                  body="Try a wider area or fewer filters. If you know a clinic here, you can suggest it so other families can find it too."
                  actions={
                    <>
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={expandSearchArea}
                      >
                        Expand search area
                      </Button>
                      {activeFilterCount > 0 && (
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => setMoreOpen(true)}
                        >
                          Remove a filter
                        </Button>
                      )}
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
            </div>
          )}

          {nextCursor && !isError && (
            <div className="py-6 text-center">
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
        </section>

        {/* Map */}
        <section
          aria-label="Map"
          className={cn(
            "min-h-[60vh] md:max-h-[calc(100vh-4rem)] md:min-h-0",
            mobileView === "list" ? "hidden" : "",
            showingMapDesktop ? "md:block" : "md:hidden",
          )}
        >
          {mapElement}
        </section>
      </div>
    </div>
  );
}
