"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { LocateFixed, Loader2, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
  /**
   * Called when the user submits free text that matched no suggestion.
   * Default navigates to /clinics?q=<text>.
   */
  onTextSearch?: (query: string) => void;
  autoFocus?: boolean;
  size?: "default" | "large";
  /** Label for the submit button. */
  submitLabel?: string;
}

/**
 * Accessible location search: combobox autocomplete + an explicit
 * "Find clinics" submit + "Use my location". Browser geolocation is
 * requested only after an explicit click. Enter with no highlighted
 * suggestion submits the form (first suggestion, else free-text search)
 * so the control never silently does nothing.
 */
export function LocationSearchBox({
  onLocation,
  onTextSearch,
  size = "default",
  submitLabel = "Find clinics",
}: LocationSearchBoxProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const listboxId = useId();
  const privacyId = useId();
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

  function submit() {
    if (busy) return;
    if (open && activeIndex >= 0 && suggestions[activeIndex]) {
      void choose(suggestions[activeIndex]);
      return;
    }
    if (suggestions.length > 0 && query.trim().length >= 2) {
      void choose(suggestions[0]);
      return;
    }
    const text = query.trim();
    if (onTextSearch) {
      onTextSearch(text);
      return;
    }
    // Free-text search (clinic name / place); empty query = every clinic.
    const params = new URLSearchParams();
    if (text) params.set("q", text);
    const qs = params.toString();
    router.push(qs ? `/clinics?${qs}` : "/clinics");
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
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
    // Enter falls through to the form's onSubmit → submit().
  }

  const large = size === "large";

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        role="search"
        aria-label="Find clinics by location"
        className={cn(
          "flex w-full flex-col gap-3",
          large ? "sm:flex-row sm:items-start" : "sm:flex-row sm:items-center",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-subtle"
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
            aria-describedby={privacyId}
            placeholder="City, province, or barangay"
            autoComplete="off"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className={cn("pl-11", large ? "h-13 text-base" : "h-11")}
          />
          {open && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Location suggestions"
              className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-soft"
            >
              {suggestions.map((s, index) => (
                <li
                  key={s.placeId}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-base",
                    index === activeIndex &&
                      "bg-primary-subtle text-accent-foreground",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void choose(s);
                  }}
                >
                  <MapPin className="size-4 shrink-0 text-subtle" aria-hidden />
                  <span className="truncate">{s.label}</span>
                  {s.kind && (
                    <span className="ml-auto shrink-0 text-sm capitalize text-subtle">
                      {s.kind}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={busy}
          className={cn("shrink-0", large ? "h-13 px-6" : "")}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Search className="size-4" aria-hidden />
          )}
          {submitLabel}
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-3 text-primary hover:text-primary-hover"
          onClick={useMyLocation}
          disabled={busy}
        >
          <LocateFixed aria-hidden />
          Use my location
        </Button>
        <p id={privacyId} className="text-sm text-subtle">
          Your precise location is not stored.
        </p>
      </div>
    </div>
  );
}
