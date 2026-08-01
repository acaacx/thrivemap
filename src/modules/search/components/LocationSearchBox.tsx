"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { LocateFixed, Loader2, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Suggestion {
  placeId: string;
  label: string;
  kind?: string;
}

interface LocationSearchBoxProps {
  /** Called with a chosen location; default navigates to /clinics. */
  onLocation?: (loc: {
    latitude: number;
    longitude: number;
    label: string;
  }) => void;
  autoFocus?: boolean;
  size?: "default" | "large";
}

/**
 * Accessible location autocomplete (combobox pattern) with a
 * "Use my location" affordance. Browser geolocation is requested only after
 * an explicit click, with a plain-language explanation shown beforehand.
 */
export function LocationSearchBox({
  onLocation,
  size = "default",
}: LocationSearchBoxProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const listboxId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shortQuery = query.trim().length < 2;
    const timeout = setTimeout(
      async () => {
        if (shortQuery) {
          setSuggestions([]);
          setOpen(false);
          return;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const res = await fetch(
            `/api/locations?q=${encodeURIComponent(query)}`,
            {
              signal: controller.signal,
            },
          );
          if (!res.ok) return;
          const json = (await res.json()) as { suggestions?: Suggestion[] };
          setSuggestions(json.suggestions ?? []);
          setOpen((json.suggestions ?? []).length > 0);
          setActiveIndex(-1);
        } catch {
          // aborted or offline — ignore
        }
      },
      shortQuery ? 0 : 250,
    );
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function go(latitude: number, longitude: number, label: string) {
    if (onLocation) {
      onLocation({ latitude, longitude, label });
      return;
    }
    const params = new URLSearchParams({
      lat: latitude.toFixed(5),
      lng: longitude.toFixed(5),
      loc: label,
    });
    router.push(`/clinics?${params.toString()}`);
  }

  async function choose(suggestion: Suggestion) {
    setOpen(false);
    setQuery(suggestion.label);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/locations?placeId=${encodeURIComponent(suggestion.placeId)}`,
      );
      const json = (await res.json()) as {
        location?: { latitude: number; longitude: number; label: string };
      };
      if (json.location) {
        go(
          json.location.latitude,
          json.location.longitude,
          json.location.label,
        );
      } else {
        toast.error("Could not find that location. Try another search.");
      }
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.error(
        "Location is not supported by this browser. Try searching by city instead.",
      );
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy(false);
        go(
          position.coords.latitude,
          position.coords.longitude,
          "Your location",
        );
      },
      () => {
        setBusy(false);
        toast.info(
          "No problem — location stays off. Search by city, province, or barangay instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      void choose(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const inputClasses =
    size === "large"
      ? "h-13 rounded-full pl-11 text-base"
      : "h-10 rounded-full pl-10";

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex w-full items-center gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0
                ? `${listboxId}-option-${activeIndex}`
                : undefined
            }
            aria-label="Search by city, province, or barangay"
            placeholder="City, province, or barangay…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className={inputClasses}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 rounded-full"
          onClick={useMyLocation}
          disabled={busy}
          title="Uses your browser location once to center the search. Your precise location is not stored."
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <LocateFixed className="size-4" aria-hidden />
          )}
          <span className="hidden sm:inline">Use my location</span>
        </Button>
      </div>
      <p className="mt-1.5 pl-4 text-xs text-muted-foreground">
        “Use my location” asks your browser once, only to center the map — we
        don’t store your precise location.
      </p>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Location suggestions"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg"
        >
          {suggestions.map((s, index) => (
            <li
              key={s.placeId}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm ${
                index === activeIndex ? "bg-accent text-accent-foreground" : ""
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                void choose(s);
              }}
            >
              <MapPin
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span>{s.label}</span>
              {s.kind && (
                <span className="ml-auto text-xs capitalize text-muted-foreground">
                  {s.kind}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
