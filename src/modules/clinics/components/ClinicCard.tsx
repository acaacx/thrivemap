"use client";

import Link from "next/link";
import { Building2, ExternalLink, MapPin, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  lastVerifiedAt?: string | null;
  logoUrl?: string | null;
  latitude?: number;
  longitude?: number;
}

interface ClinicCardProps {
  clinic: ClinicCardData;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export function ClinicCard({ clinic, selected, onSelect }: ClinicCardProps) {
  const distance = formatDistanceKm(clinic.distanceKm);
  const directionsUrl =
    clinic.latitude != null && clinic.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${clinic.latitude},${clinic.longitude}`
      : null;

  return (
    <Card
      data-clinic-id={clinic.id}
      className={`transition-shadow ${selected ? "ring-2 ring-ring shadow-md" : "hover:shadow-md"}`}
      onClick={() => onSelect?.(clinic.id)}
    >
      <CardContent className="flex gap-4 p-4">
        <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary text-secondary-foreground">
          {/* Logo placeholder — real logos come via clinic_images in later stages */}
          <Building2 className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-base font-semibold leading-snug">
              <Link
                href={`/clinics/${clinic.slug}`}
                className="underline-offset-4 hover:underline focus-visible:underline"
              >
                {clinic.name}
              </Link>
            </h3>
            <VerificationBadge status={clinic.status} />
          </div>
          <p className="flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {[clinic.address, clinic.city, clinic.province]
                .filter(Boolean)
                .join(", ")}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {distance && <span>{distance} away</span>}
            {clinic.isOpenNow != null && (
              <span
                className={
                  clinic.isOpenNow ? "text-[var(--verified)] font-medium" : ""
                }
              >
                {clinic.isOpenNow ? "Open now" : "Closed now"}
              </span>
            )}
            {clinic.offersOnline && (
              <span className="inline-flex items-center gap-1">
                <Video className="size-3.5" aria-hidden /> Online services
              </span>
            )}
            {clinic.lastVerifiedAt && (
              <span>
                Verified{" "}
                {new Date(clinic.lastVerifiedAt).toLocaleDateString("en-PH", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
          {clinic.serviceNames && clinic.serviceNames.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {clinic.serviceNames.slice(0, 3).map((service) => (
                <Badge
                  key={service}
                  variant="secondary"
                  className="font-normal"
                >
                  {service}
                </Badge>
              ))}
              {clinic.serviceNames.length > 3 && (
                <Badge variant="secondary" className="font-normal">
                  +{clinic.serviceNames.length - 3} more
                </Badge>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              render={<Link href={`/clinics/${clinic.slug}`} />}
            >
              View details
            </Button>
            {directionsUrl && (
              <Button
                size="sm"
                variant="outline"
                render={
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                Directions
                <ExternalLink className="size-3.5" aria-hidden />
              </Button>
            )}
            <FavoriteButton
              clinicId={clinic.id}
              clinicName={clinic.name}
              className="ml-auto"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
