"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { MapErrorBoundary } from "@/modules/maps/components/MapErrorBoundary";

const ClinicMap = dynamic(
  () => import("@/modules/maps/components/ClinicMap").then((m) => m.ClinicMap),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-56 place-items-center bg-secondary text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  },
);

interface ClinicProfileMapProps {
  clinicId: string;
  slug: string;
  clinicName: string;
  latitude: number;
  longitude: number;
  verified: boolean;
  /** Formatted address shown if the map itself cannot render. */
  address?: string | null;
}

export function ClinicProfileMap(props: ClinicProfileMapProps) {
  return (
    <div className="h-56">
      <MapErrorBoundary
        fallback={
          <div className="grid h-full place-items-center bg-secondary px-4">
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {props.address || props.clinicName}
                <span className="mt-0.5 block text-xs">
                  Map unavailable in this browser.
                </span>
              </span>
            </p>
          </div>
        }
      >
        <ClinicMap
          markers={[
            {
              id: props.clinicId,
              slug: props.slug,
              name: props.clinicName,
              latitude: props.latitude,
              longitude: props.longitude,
              verified: props.verified,
            },
          ]}
          center={{ latitude: props.latitude, longitude: props.longitude }}
          zoom={15}
          className="h-full w-full"
        />
      </MapErrorBoundary>
    </div>
  );
}
