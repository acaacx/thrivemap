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
  className?: string;
}

const MAX_SERVICES = 3;

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
  className,
}: ClinicCardProps) {
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
