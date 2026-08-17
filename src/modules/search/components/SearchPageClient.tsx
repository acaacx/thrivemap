"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { List, Loader2, Map as MapIcon, SlidersHorizontal } from "lucide-react";
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
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import dynamic from "next/dynamic";
import { ClinicCard } from "@/modules/clinics/components/ClinicCard";
import type { ClinicMapMarker } from "@/modules/maps/components/ClinicMap";
import { MapErrorBoundary } from "@/modules/maps/components/MapErrorBoundary";
import type { MapBounds } from "@/modules/maps/types";
import { ShareButton } from "@/modules/share/components/ShareButton";
import { LocationSearchBox } from "./LocationSearchBox";
import { SearchFilters, type FilterState } from "./SearchFilters";
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

  const { data, isFetching } = useQuery<SearchResponse>({
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
      router.replace(`${pathname}?${qs}`, { scroll: false });
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

  const activeFilterCount =
    filterState.services.length +
    filterState.ages.length +
    ["verified", "online", "inperson", "open", "accessible"].filter(
      (k) => filterState[k as keyof FilterState],
    ).length;

  const filtersPanel = (
    <SearchFilters
      serviceOptions={serviceOptions}
      value={filterState}
      onChange={onFiltersChange}
      showRadius={params.lat != null}
    />
  );

  const selectedClinic = clinics.find((c) => c.clinic_id === selectedId);

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
          <Button onClick={onSearchThisArea} className="rounded-full shadow-lg">
            Search this area
          </Button>
        </div>
      )}
      {/* Mobile bottom-sheet style preview for a selected marker */}
      {selectedClinic && (
        <div className="absolute inset-x-3 bottom-3 z-10 md:hidden">
          <ClinicCard
            clinic={{
              id: selectedClinic.clinic_id,
              slug: selectedClinic.slug,
              name: selectedClinic.name,
              status: selectedClinic.status,
              address: selectedClinic.address_line1,
              city: selectedClinic.city,
              province: selectedClinic.province,
              distanceKm: selectedClinic.distance_km,
              serviceNames: selectedClinic.service_names,
              isOpenNow: selectedClinic.is_open_now,
              offersOnline: selectedClinic.offers_online_services,
              latitude: selectedClinic.latitude,
              longitude: selectedClinic.longitude,
            }}
            selected
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      {/* Toolbar */}
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1 lg:max-w-xl">
            <LocationSearchBox
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
                  cursor: undefined,
                })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger
                render={<Button variant="outline" className="rounded-full" />}
              >
                <SlidersHorizontal className="size-4" aria-hidden />
                Filters
                {activeFilterCount > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </SheetTrigger>
              <SheetContent side="left" className="w-80 overflow-y-auto p-6">
                <SheetHeader className="p-0 pb-4">
                  <SheetTitle>Filter clinics</SheetTitle>
                </SheetHeader>
                {filtersPanel}
              </SheetContent>
            </Sheet>
            <Select
              value={params.sort}
              onValueChange={(sort) =>
                applyParams({
                  ...params,
                  sort: sort as SortOption,
                  cursor: undefined,
                })
              }
            >
              <SelectTrigger
                className="w-44 rounded-full"
                aria-label="Sort results"
              >
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
            <ShareButton />
            {/* Mobile list/map toggle */}
            <div
              className="flex rounded-full border p-0.5 md:hidden"
              role="group"
              aria-label="Toggle list or map view"
            >
              <Button
                size="sm"
                variant={mobileView === "list" ? "default" : "ghost"}
                className="rounded-full"
                onClick={() => setMobileView("list")}
                aria-pressed={mobileView === "list"}
              >
                <List className="size-4" aria-hidden /> List
              </Button>
              <Button
                size="sm"
                variant={mobileView === "map" ? "default" : "ghost"}
                className="rounded-full"
                onClick={() => setMobileView("map")}
                aria-pressed={mobileView === "map"}
              >
                <MapIcon className="size-4" aria-hidden /> Map
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Results + map split */}
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 md:grid-cols-[minmax(380px,42%)_1fr]">
        {/* Results list */}
        <section
          aria-label="Clinic results"
          className={`min-h-0 overflow-y-auto border-r px-4 py-4 sm:px-6 md:max-h-[calc(100vh-8.5rem)] ${
            mobileView === "map" ? "hidden md:block" : ""
          }`}
        >
          <div
            aria-live="polite"
            className="mb-3 text-sm text-muted-foreground"
          >
            {isFetching && !data ? (
              "Searching…"
            ) : (
              <>
                {clinics.length} clinic{clinics.length === 1 ? "" : "s"} found
                {params.loc ? ` near ${params.loc}` : ""}
                {isFetching && (
                  <Loader2
                    className="ml-2 inline size-3.5 animate-spin"
                    aria-hidden
                  />
                )}
              </>
            )}
          </div>
          <div className="space-y-3">
            {clinics.map((clinic) => (
              <ClinicCard
                key={clinic.clinic_id}
                clinic={{
                  id: clinic.clinic_id,
                  slug: clinic.slug,
                  name: clinic.name,
                  status: clinic.status,
                  address: clinic.address_line1,
                  city: clinic.city,
                  province: clinic.province,
                  distanceKm: clinic.distance_km,
                  serviceNames: clinic.service_names,
                  isOpenNow: clinic.is_open_now,
                  offersOnline: clinic.offers_online_services,
                  lastVerifiedAt: clinic.last_verified_at,
                  logoUrl: clinic.logo_url,
                  latitude: clinic.latitude,
                  longitude: clinic.longitude,
                }}
                selected={clinic.clinic_id === selectedId}
                onSelect={setSelectedId}
              />
            ))}
            {clinics.length === 0 && !isFetching && (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  No clinics found in this area yet.
                </p>
                <p className="mt-1">
                  Try widening the distance, removing filters, or searching a
                  nearby city. Know a clinic here?{" "}
                  <a
                    href="/suggest-clinic"
                    className="underline underline-offset-4"
                  >
                    Suggest it
                  </a>
                  .
                </p>
              </div>
            )}
          </div>
          {nextCursor && (
            <div className="py-4 text-center">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-full"
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
          className={`min-h-[60vh] md:block md:max-h-[calc(100vh-8.5rem)] md:min-h-0 ${
            mobileView === "list" ? "hidden" : ""
          }`}
        >
          {mapElement}
        </section>
      </div>
    </div>
  );
}
