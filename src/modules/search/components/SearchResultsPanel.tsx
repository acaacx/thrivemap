"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Loader2, SearchX } from "lucide-react";
import { LayoutGroup, m } from "motion/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { useIsDesktop } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { ClinicCard } from "@/modules/clinics/components/ClinicCard";
import { ClinicPreview, type ClinicPreviewData } from "./ClinicPreview";
import { SEARCH_RESULT_LAYOUT_TRANSITION } from "../motion";
import { useSearchUI } from "../search-ui-context";

export interface SearchClinicRow {
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

export function toClinicPreviewData(c: SearchClinicRow): ClinicPreviewData {
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
 * Results list + preview. Inside <AppShell> for the shared UI state. On
 * small screens the selected clinic's preview replaces the list (Back
 * returns); on desktop it sits above the list.
 */
export function SearchResults({
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
  const preview = selected ? toClinicPreviewData(selected) : null;
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
      {preview && !desktop && (
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
        <LayoutGroup id="clinic-search-results">
          {clinics.map((clinic) => (
            <m.div
              key={clinic.clinic_id}
              layout="position"
              layoutDependency={clinics}
              data-motion-result="position"
              transition={SEARCH_RESULT_LAYOUT_TRANSITION}
            >
              <ClinicCard
                variant="compact"
                clinic={toClinicPreviewData(clinic)}
                selected={clinic.clinic_id === selectedId}
                onSelect={select}
                onHoverChange={desktop ? setHovered : undefined}
              />
            </m.div>
          ))}
        </LayoutGroup>
        {children}
      </div>
    </>
  );
}

export function NoResultsState({
  canExpand,
  hasCoords,
  nextRadius,
  onExpand,
  activeFilterCount,
  onClearFilters,
}: {
  canExpand: boolean;
  hasCoords: boolean;
  nextRadius: number;
  onExpand: () => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}) {
  return (
    <EmptyState
      icon={<SearchX className="size-5" aria-hidden />}
      title="We couldn't find a matching clinic nearby."
      body="Try a wider area or fewer filters. If you know a clinic here, you can suggest it so other families can find it too."
      actions={
        <>
          {canExpand && (
            <Button variant="outline" size="lg" onClick={onExpand}>
              Expand search area
              {hasCoords && (
                <span className="font-normal text-muted-foreground">
                  to {nextRadius} km
                </span>
              )}
            </Button>
          )}
          {activeFilterCount > 0 && (
            <Button variant="outline" size="lg" onClick={onClearFilters}>
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
  );
}

export function LoadMoreButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <div className="py-4 text-center">
      <Button variant="outline" size="lg" onClick={onClick} disabled={loading}>
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Load more clinics
      </Button>
    </div>
  );
}
