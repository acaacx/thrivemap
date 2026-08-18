"use client";

import Link from "next/link";
import type { Ref } from "react";
import {
  ArrowLeft,
  Clock,
  Globe,
  MapPin,
  Navigation,
  Phone,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AccessibilityBadge,
  accessibilityKinds,
} from "@/modules/clinics/components/AccessibilityBadge";
import {
  formatCityDistance,
  type ClinicCardData,
} from "@/modules/clinics/components/ClinicCard";
import { VerificationBadge } from "@/modules/clinics/components/VerificationBadge";

export interface ClinicPreviewData extends ClinicCardData {
  phone?: string | null;
  website?: string | null;
}

interface ClinicPreviewProps {
  clinic: ClinicPreviewData;
  /** Dismiss the preview (Back on mobile, × on desktop). */
  onClose: () => void;
  /** `sheet` = mobile (back button, fills the sheet); `panel` = desktop card. */
  variant: "sheet" | "panel";
  className?: string;
  ref?: Ref<HTMLElement>;
}

/** Normalises a stored website into an absolute URL. */
function websiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * The selected clinic, from the search row alone (no extra fetch): what it
 * is, where it is, what it lists — then one primary action (View clinic)
 * and small secondary ones (Directions / Call / Website).
 */
export function ClinicPreview({
  clinic,
  onClose,
  variant,
  className,
  ref,
}: ClinicPreviewProps) {
  const where = formatCityDistance(clinic.city, clinic.distanceKm);
  const address = [clinic.address, clinic.city, clinic.province]
    .filter(Boolean)
    .join(", ");
  const services = clinic.serviceNames ?? [];
  const kinds = accessibilityKinds(clinic);
  const directionsUrl =
    clinic.latitude != null && clinic.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${clinic.latitude},${clinic.longitude}`
      : null;
  const headingId = `clinic-preview-${clinic.id}`;

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      data-slot="clinic-preview"
      data-clinic-preview-id={clinic.id}
      className={cn(
        "flex flex-col gap-3",
        variant === "panel" && "rounded-xl border border-primary bg-card p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {variant === "sheet" ? (
          <Button variant="ghost" size="lg" className="-ml-2" onClick={onClose}>
            <ArrowLeft aria-hidden />
            Back to results
          </Button>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">
            Selected clinic
          </p>
        )}
        {variant === "panel" && (
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Close preview"
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 id={headingId} className="text-lg font-semibold leading-snug">
            {clinic.name}
          </h3>
          <VerificationBadge status={clinic.status} />
        </div>
        {where && <p className="text-sm text-muted-foreground">{where}</p>}
      </div>

      {address && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
          <span>{address}</span>
        </p>
      )}

      {services.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Services">
          {services.map((service) => (
            <li key={service}>
              <Badge variant="tint" className="font-normal">
                {service}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {(clinic.isOpenNow != null || kinds.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {clinic.isOpenNow != null && (
            <span className="inline-flex items-center gap-1.5">
              <Clock
                className={cn(
                  "size-4",
                  clinic.isOpenNow ? "text-success" : "text-subtle",
                )}
                aria-hidden
              />
              {clinic.isOpenNow ? "Open now" : "Closed"}
            </span>
          )}
          {kinds.map((kind) => (
            <AccessibilityBadge key={kind} kind={kind} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          size="lg"
          render={<Link href={`/clinics/${clinic.slug}`} />}
          aria-label={`View clinic: ${clinic.name}`}
        >
          View clinic
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {directionsUrl && (
            <Button
              variant="outline"
              size="icon-lg"
              render={
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Directions to ${clinic.name} (opens Google Maps)`}
                />
              }
            >
              <Navigation aria-hidden />
            </Button>
          )}
          {clinic.phone && (
            <Button
              variant="outline"
              size="icon-lg"
              render={
                <a
                  href={`tel:${clinic.phone.replace(/\s+/g, "")}`}
                  aria-label={`Call ${clinic.name}`}
                />
              }
            >
              <Phone aria-hidden />
            </Button>
          )}
          {clinic.website && (
            <Button
              variant="outline"
              size="icon-lg"
              render={
                <a
                  href={websiteHref(clinic.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Website of ${clinic.name} (opens in a new tab)`}
                />
              }
            >
              <Globe aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
