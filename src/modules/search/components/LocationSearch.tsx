"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type Ref } from "react";
import { LocateFixed, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MotionProvider } from "@/components/motion-provider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SearchAutocomplete, type Suggestion } from "./SearchAutocomplete";
import { useGeolocate, type GeoResult } from "../use-geolocate";

export interface LocationSearchProps {
  /** Called with a chosen location; default navigates to /clinics. */
  onLocation?: (loc: GeoResult) => void;
  /**
   * Called when the user submits free text that matched no suggestion.
   * Default navigates to /clinics?q=<text>.
   */
  onTextSearch?: (query: string) => void;
  /** Text shown in the field on mount / when it changes (e.g. `?loc=`). */
  initialQuery?: string;
  placeholder?: string;
  /** Show the inline "Use my location" icon button inside the field. */
  showLocate?: boolean;
  /** Called after location permission was denied / unavailable. */
  onLocateDenied?: () => void;
  /** Called when the visitor clears the field (the shell drops the location). */
  onClear?: () => void;
  /** Label for the submit button. */
  submitLabel?: string;
  /** Visually hide the submit button (Enter still submits). */
  hideSubmit?: boolean;
  size?: "default" | "large";
  ref?: Ref<HTMLInputElement>;
  className?: string;
}

/**
 * Accessible location search: combobox autocomplete + explicit submit +
 * optional inline "Use my location". Browser geolocation is requested only
 * after an explicit click. Enter with no highlighted suggestion submits the
 * form (first suggestion, else free-text search) so the control never
 * silently does nothing.
 */
export function LocationSearch({
  onLocation,
  onTextSearch,
  initialQuery = "",
  placeholder = "City, province, or barangay",
  showLocate = true,
  onLocateDenied,
  onClear,
  submitLabel = "Search",
  hideSubmit = false,
  size = "default",
  ref,
  className,
}: LocationSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const listboxId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // The visitor's own typing must not be overwritten by a stale prop; only
  // follow initialQuery when it actually changes (new URL / cleared).
  const lastInitial = useRef(initialQuery);

  useEffect(() => {
    if (initialQuery !== lastInitial.current) {
      lastInitial.current = initialQuery;
      setQuery(initialQuery);
      setOpen(false);
    }
  }, [initialQuery]);

  useEffect(() => {
    const shortQuery = query.trim().length < 2;
    // Don't re-fetch for the label we just chose.
    if (query === lastInitial.current && query !== "") return;
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
            { signal: controller.signal },
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

  function go(loc: GeoResult) {
    lastInitial.current = loc.label;
    setQuery(loc.label);
    if (onLocation) {
      onLocation(loc);
      return;
    }
    const params = new URLSearchParams({
      lat: loc.latitude.toFixed(5),
      lng: loc.longitude.toFixed(5),
      loc: loc.label,
    });
    router.push(`/clinics?${params.toString()}`);
  }

  const { locate, locating } = useGeolocate(go, () => {
    inputRef.current?.focus();
    onLocateDenied?.();
  });

  async function choose(suggestion: Suggestion) {
    setOpen(false);
    lastInitial.current = suggestion.label;
    setQuery(suggestion.label);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/locations?placeId=${encodeURIComponent(suggestion.placeId)}`,
      );
      const json = (await res.json()) as { location?: GeoResult };
      if (json.location) {
        go(json.location);
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

  function clear() {
    lastInitial.current = "";
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
    onClear?.();
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
  const working = busy || locating;
  const trailing = (query ? 1 : 0) + (showLocate ? 1 : 0);

  return (
    <MotionProvider>
      <div ref={containerRef} className={cn("relative w-full", className)}>
        <form
          role="search"
          aria-label="Find clinics by location"
          className="flex w-full items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-subtle"
            />
            <Input
              ref={(node) => {
                inputRef.current = node;
                if (typeof ref === "function") ref(node);
                else if (ref) ref.current = node;
              }}
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                activeIndex >= 0 && open
                  ? `${listboxId}-option-${activeIndex}`
                  : undefined
              }
              aria-label="Search by city, province, or barangay"
              placeholder={placeholder}
              autoComplete="off"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              className={cn(
                "pl-11",
                large ? "h-13 text-base" : "h-11 text-base",
                trailing === 2 && "pr-24",
                trailing === 1 && "pr-13",
              )}
            />
            <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
              {query && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Clear search"
                  onClick={clear}
                  className="text-subtle hover:text-foreground"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              )}
              {showLocate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Use my location"
                  title="Use my location"
                  onClick={locate}
                  disabled={working}
                  className="text-primary hover:text-primary-hover"
                >
                  {locating ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <LocateFixed className="size-4" aria-hidden />
                  )}
                </Button>
              )}
            </div>
            <SearchAutocomplete
              id={listboxId}
              open={open}
              suggestions={suggestions}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              onChoose={(s) => void choose(s)}
            />
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={busy}
            aria-label={submitLabel}
            className={cn(
              "shrink-0 px-0 sm:px-4",
              large ? "h-13 sm:px-6" : "w-11 sm:w-auto",
              hideSubmit && "sr-only",
            )}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Search className="size-4" aria-hidden />
            )}
            <span className={cn(!large && "sr-only sm:not-sr-only")}>
              {submitLabel}
            </span>
          </Button>
        </form>
      </div>
    </MotionProvider>
  );
}
