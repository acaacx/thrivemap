"use client";

import { LocateFixed, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGeolocate, type GeoResult } from "../use-geolocate";

interface LocationPermissionPromptProps {
  onLocated: (loc: GeoResult) => void;
  /** After a denial the shell focuses the search input instead. */
  onDenied?: () => void;
  className?: string;
}

/**
 * Frames the value before asking: "Find support near you". Geolocation is
 * requested only on click, a denial never blocks, and the privacy line is
 * always in view.
 */
export function LocationPermissionPrompt({
  onLocated,
  onDenied,
  className,
}: LocationPermissionPromptProps) {
  const { locate, locating } = useGeolocate(onLocated, onDenied);
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">Find support near you</p>
        <p className="text-sm text-muted-foreground">
          Your precise location is used once to center the map and is never
          stored.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={locate}
        disabled={locating}
        className="shrink-0 text-primary hover:text-primary-hover"
      >
        {locating ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <LocateFixed className="size-4" aria-hidden />
        )}
        Use my location
      </Button>
    </div>
  );
}
