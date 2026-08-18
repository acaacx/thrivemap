"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

export interface GeoResult {
  latitude: number;
  longitude: number;
  label: string;
}

export const YOUR_LOCATION_LABEL = "Your location";

/**
 * Browser geolocation behind an explicit click. Never called on mount.
 * On denial: a calm toast, then `onDenied` (the shell focuses the search
 * input) — the visitor is never blocked from continuing by hand.
 */
export function useGeolocate(
  onLocated: (loc: GeoResult) => void,
  onDenied?: () => void,
) {
  const [locating, setLocating] = useState(false);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      toast.error(
        "Location is not supported by this browser. Try searching by city instead.",
      );
      onDenied?.();
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onLocated({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: YOUR_LOCATION_LABEL,
        });
      },
      () => {
        setLocating(false);
        toast.info(
          "No problem — location stays off. Search by city, province, or barangay instead.",
        );
        onDenied?.();
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }, [onLocated, onDenied]);

  return { locate, locating };
}
