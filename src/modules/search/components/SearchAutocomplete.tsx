"use client";

import { AnimatePresence, m } from "motion/react";
import {
  Building2,
  Landmark,
  Map as MapIcon,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface Suggestion {
  placeId: string;
  label: string;
  kind?: string;
}

/**
 * "Quezon City, Metro Manila" → primary "Quezon City", secondary
 * "Metro Manila". Labels without a comma have no secondary line.
 */
export function splitSuggestionLabel(label: string): {
  primary: string;
  secondary: string | null;
} {
  const index = label.indexOf(",");
  if (index === -1) return { primary: label.trim(), secondary: null };
  const primary = label.slice(0, index).trim();
  const secondary = label.slice(index + 1).trim();
  return { primary, secondary: secondary || null };
}

const KIND_ICONS: Record<string, LucideIcon> = {
  city: Building2,
  municipality: Building2,
  province: MapIcon,
  region: MapIcon,
  barangay: MapPin,
  landmark: Landmark,
  poi: Landmark,
};

export function suggestionIcon(kind?: string): LucideIcon {
  return (kind && KIND_ICONS[kind.toLowerCase()]) || MapPin;
}

interface SearchAutocompleteProps {
  id: string;
  open: boolean;
  suggestions: Suggestion[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onChoose: (suggestion: Suggestion) => void;
  className?: string;
}

/**
 * The listbox half of the location combobox. Owned by LocationSearch, which
 * keeps the input, ARIA wiring, and keyboard handling. Each option carries a
 * kind icon plus a two-line label so "Quezon City" and "Quezon (province)"
 * read differently at a glance.
 */
export function SearchAutocomplete({
  id,
  open,
  suggestions,
  activeIndex,
  onActiveIndexChange,
  onChoose,
  className,
}: SearchAutocompleteProps) {
  return (
    <AnimatePresence>
      {open && suggestions.length > 0 && (
        <m.ul
          key="listbox"
          id={id}
          role="listbox"
          aria-label="Location suggestions"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
          className={cn(
            "absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-soft",
            className,
          )}
        >
          {suggestions.map((s, index) => {
            const { primary, secondary } = splitSuggestionLabel(s.label);
            const Icon = suggestionIcon(s.kind);
            const active = index === activeIndex;
            return (
              <li
                key={s.placeId}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={active}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2",
                  active && "bg-primary-subtle text-accent-foreground",
                )}
                onMouseEnter={() => onActiveIndexChange(index)}
                onMouseDown={(e) => {
                  // Keep focus in the input so blur doesn't close us first.
                  e.preventDefault();
                  onChoose(s);
                }}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-subtle",
                    active && "bg-card text-accent-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-base leading-snug">
                    {primary}
                  </span>
                  {secondary && (
                    <span className="truncate text-sm leading-snug text-muted-foreground">
                      {secondary}
                    </span>
                  )}
                </span>
                {s.kind && (
                  <span className="ml-auto shrink-0 text-xs capitalize text-subtle">
                    {s.kind}
                  </span>
                )}
              </li>
            );
          })}
        </m.ul>
      )}
    </AnimatePresence>
  );
}
