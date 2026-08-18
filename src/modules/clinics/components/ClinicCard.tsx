"use client";

import Link from "next/link";
import {
  Accessibility,
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDistanceKm } from "@/lib/format";
import { FavoriteButton } from "@/modules/favorites/components/FavoriteButton";
import { AccessibilityBadge, accessibilityKinds } from "./AccessibilityBadge";
import { VerificationBadge } from "./VerificationBadge";

export interface ClinicCardData {
  id: string;
  slug: string;
  name: string;
  status: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  distanceKm?: number | null;
  serviceNames?: string[];
  isOpenNow?: boolean | null;
  offersOnline?: boolean;
  offersInPerson?: boolean;
  wheelchairAccessible?: boolean | null;
  lastVerifiedAt?: string | null;
  logoUrl?: string | null;
  latitude?: number;
  longitude?: number;
}

interface ClinicCardProps {
  clinic: ClinicCardData;
  selected?: boolean;
  onSelect?: (id: string) => void;
  /** Pointer enters / leaves the card (the map echoes it). */
  onHoverChange?: (id: string | null) => void;
  /**
   * `compact` — the results-list card: name + status, "City · 2.1 km",
   * ≤3 services, open/closed, one CTA. `default` — the fuller card used on
   * service / location / favourites pages.
   */
  variant?: "default" | "compact";
  className?: string;
}

const MAX_SERVICES = 3;

/** "Quezon City · 2.1 km" (either half may be missing). */
export function formatCityDistance(
  city: string | null | undefined,
  distanceKm: number | null | undefined,
): string {
  return [city, formatDistanceKm(distanceKm)].filter(Boolean).join(" · ");
}

/**
 * One predictable card shape everywhere a clinic is listed:
 * name + status → location → distance/open → services → attributes → actions.
 * Selection is shown with a stronger border (plus the map pin), never a
 * shadow or hue alone.
 */
export function ClinicCard({
  clinic,
  selected,
  onSelect,
  onHoverChange,
  variant = "default",
  className,
}: ClinicCardProps) {
  if (variant === "compact") {
    return (
      <CompactClinicCard
        clinic={clinic}
        selected={selected}
        onSelect={onSelect}
        onHoverChange={onHoverChange}
        className={className}
      />
    );
  }
  const distance = formatDistanceKm(clinic.distanceKm);
  const directionsUrl =
    clinic.latitude != null && clinic.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${clinic.latitude},${clinic.longitude}`
      : null;
  const location = [clinic.address, clinic.city, clinic.province]
    .filter(Boolean)
    .join(", ");
  const services = clinic.serviceNames ?? [];
  const attributes = [
    clinic.wheelchairAccessible === true && {
      key: "wheelchair",
      icon: Accessibility,
      label: "Wheelchair accessible",
    },
    clinic.offersOnline && {
      key: "online",
      icon: Video,
      label: "Online sessions",
    },
  ].filter(Boolean) as { key: string; icon: typeof Video; label: string }[];

  return (
    <Card
      data-clinic-id={clinic.id}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "transition-colors duration-150",
        selected
          ? "border-primary bg-primary-subtle/30"
          : "hover:border-primary/40",
        onSelect && "cursor-pointer",
        className,
      )}
      onClick={() => onSelect?.(clinic.id)}
    >
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="text-lg font-semibold leading-snug">
            <Link
              href={`/clinics/${clinic.slug}`}
              className="rounded-sm underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {clinic.name}
            </Link>
          </h3>
          <VerificationBadge status={clinic.status} />
        </div>

        {location && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin
              className="mt-0.5 size-4 shrink-0 text-subtle"
              aria-hidden
            />
            <span className="min-w-0 truncate">{location}</span>
          </p>
        )}

        {(distance || clinic.isOpenNow != null) && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {distance && (
              <span className="inline-flex items-center gap-1.5">
                <Navigation className="size-4 text-subtle" aria-hidden />
                {distance} away
              </span>
            )}
            {clinic.isOpenNow != null && (
              <span className="inline-flex items-center gap-1.5">
                <Clock
                  className={cn(
                    "size-4",
                    clinic.isOpenNow ? "text-success" : "text-subtle",
                  )}
                  aria-hidden
                />
                {clinic.isOpenNow ? "Open now" : "Closed now"}
              </span>
            )}
          </p>
        )}

        {services.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Services">
            {services.slice(0, MAX_SERVICES).map((service) => (
              <li key={service}>
                <Badge variant="tint" className="font-normal">
                  {service}
                </Badge>
              </li>
            ))}
            {services.length > MAX_SERVICES && (
              <li>
                <Badge variant="outline" className="font-normal">
                  +{services.length - MAX_SERVICES} more
                </Badge>
              </li>
            )}
          </ul>
        )}

        {attributes.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground">
            {attributes.map(({ key, icon: Icon, label }) => (
              <li key={key} className="inline-flex items-center gap-1.5">
                <Icon className="size-4 text-subtle" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="lg"
            render={<Link href={`/clinics/${clinic.slug}`} />}
            aria-label={`View clinic: ${clinic.name}`}
          >
            View clinic
          </Button>
          {directionsUrl && (
            <Button
              size="lg"
              variant="outline"
              render={
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Directions to ${clinic.name} (opens Google Maps)`}
                />
              }
            >
              Directions
              <ExternalLink className="size-4" aria-hidden />
            </Button>
          )}
          <FavoriteButton
            clinicId={clinic.id}
            clinicName={clinic.name}
            className="ml-auto size-11"
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Results-list card. One primary action; the whole card selects (mirrors to
 * the map). Selection is a 2px teal ring plus the map pin — never colour
 * alone. Wording stays neutral: distance and listed services, no claims.
 */
function CompactClinicCard({
  clinic,
  selected,
  onSelect,
  onHoverChange,
  className,
}: Omit<ClinicCardProps, "variant">) {
  const services = clinic.serviceNames ?? [];
  const where = formatCityDistance(clinic.city, clinic.distanceKm);
  const kinds = accessibilityKinds(clinic);
  // A temporarily closed listing should not also read "Open now".
  const showOpen =
    clinic.isOpenNow != null && clinic.status !== "temporarily_closed";

  return (
    <Card
      size="sm"
      data-clinic-id={clinic.id}
      data-variant="compact"
      aria-current={selected ? "true" : undefined}
      className={cn(
        "gap-2 transition-[box-shadow,border-color] duration-150",
        selected
          ? "border-primary ring-2 ring-primary"
          : "hover:border-primary/40",
        onSelect && "cursor-pointer",
        className,
      )}
      onClick={() => onSelect?.(clinic.id)}
      onMouseEnter={onHoverChange ? () => onHoverChange(clinic.id) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(null) : undefined}
    >
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-semibold leading-snug">
            <Link
              href={`/clinics/${clinic.slug}`}
              className="rounded-sm underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={(e) => e.stopPropagation()}
            >
              {clinic.name}
            </Link>
          </h3>
          <VerificationBadge status={clinic.status} />
        </div>

        {where && <p className="text-sm text-muted-foreground">{where}</p>}

        {services.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Services">
            {services.slice(0, MAX_SERVICES).map((service) => (
              <li key={service}>
                <Badge variant="tint" className="font-normal">
                  {service}
                </Badge>
              </li>
            ))}
            {services.length > MAX_SERVICES && (
              <li>
                <Badge variant="outline" className="font-normal">
                  +{services.length - MAX_SERVICES}
                </Badge>
              </li>
            )}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {showOpen && (
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
          <Button
            size="lg"
            variant={selected ? "default" : "outline"}
            className="ml-auto"
            render={<Link href={`/clinics/${clinic.slug}`} />}
            aria-label={`View clinic: ${clinic.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            View clinic
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
