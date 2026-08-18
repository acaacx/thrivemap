"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSyncExternalStore } from "react";
import { formatDistanceKm } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  SNAPSHOT_KEY,
  distanceKm,
  parseSnapshot,
  snapshotOrigin,
  type SearchSnapshot,
} from "@/modules/search/search-snapshot";

// getSnapshot must return a stable reference while the stored value is
// unchanged, so parse only when the raw string differs.
let cachedRaw: string | null | undefined;
let cachedValue: SearchSnapshot | null = null;
function getSnapshot(): SearchSnapshot | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(SNAPSHOT_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parseSnapshot(raw);
  }
  return cachedValue;
}
function subscribe() {
  // Only the search shell writes the snapshot, never while this page is open.
  return () => {};
}

/** The referring search (this tab), or null on a cold visit / SSR. */
function useSearchSnapshot(): SearchSnapshot | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/**
 * "Back to results" — returns to the exact search the visitor came from
 * (URL + restored map / scroll / sheet), or to the plain search when there
 * is none. Server-renders the plain link so the page never jumps.
 */
export function BackToResults({ className }: { className?: string }) {
  const snapshot = useSearchSnapshot();
  return (
    <Link
      href={snapshot?.url ?? "/clinics"}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back to results
    </Link>
  );
}

/**
 * "2.1 km from your search" — only when the referring search had
 * coordinates. Renders nothing otherwise (and on the server).
 */
export function DistanceFromSearch({
  latitude,
  longitude,
  className,
}: {
  latitude: number;
  longitude: number;
  className?: string;
}) {
  const snapshot = useSearchSnapshot();
  const origin = snapshotOrigin(snapshot);
  if (!origin) return null;
  const label = formatDistanceKm(distanceKm(origin, { latitude, longitude }));
  if (!label) return null;
  return (
    <span className={cn("text-muted-foreground", className)}>
      {label} from your search
    </span>
  );
}
