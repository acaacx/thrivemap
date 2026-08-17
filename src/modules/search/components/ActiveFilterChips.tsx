"use client";

import { Button } from "@/components/ui/button";
import { FilterChip } from "./FilterChip";
import {
  AGE_LABELS,
  FILTER_FLAG_LABELS,
  type FilterFlagKey,
  type FilterState,
} from "./SearchFilters";

export interface ActiveChip {
  key: string;
  label: string;
  remove: () => void;
}

/**
 * Derives the visible chip list from filter state + location. Pure so it
 * can be unit-tested; the component just renders it.
 */
export function deriveActiveChips(args: {
  filters: FilterState;
  serviceOptions: { slug: string; name: string }[];
  location?: string | null;
  onFiltersChange: (next: FilterState) => void;
  onClearLocation?: () => void;
}): ActiveChip[] {
  const {
    filters,
    serviceOptions,
    location,
    onFiltersChange,
    onClearLocation,
  } = args;
  const chips: ActiveChip[] = [];

  if (location && onClearLocation) {
    chips.push({ key: "loc", label: location, remove: onClearLocation });
  }
  for (const slug of filters.services) {
    const name = serviceOptions.find((s) => s.slug === slug)?.name ?? slug;
    chips.push({
      key: `svc-${slug}`,
      label: name,
      remove: () =>
        onFiltersChange({
          ...filters,
          services: filters.services.filter((s) => s !== slug),
        }),
    });
  }
  for (const age of filters.ages) {
    chips.push({
      key: `age-${age}`,
      label: AGE_LABELS[age] ?? age,
      remove: () =>
        onFiltersChange({
          ...filters,
          ages: filters.ages.filter((a) => a !== age),
        }),
    });
  }
  for (const key of Object.keys(FILTER_FLAG_LABELS) as FilterFlagKey[]) {
    if (filters[key]) {
      chips.push({
        key,
        label: FILTER_FLAG_LABELS[key],
        remove: () => onFiltersChange({ ...filters, [key]: false }),
      });
    }
  }
  return chips;
}

interface ActiveFilterChipsProps {
  chips: ActiveChip[];
  onClearAll: () => void;
  className?: string;
}

export function ActiveFilterChips({
  chips,
  onClearAll,
  className,
}: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className={className}>
      <ul
        aria-label="Active filters"
        className="flex flex-wrap items-center gap-2"
      >
        {chips.map((chip) => (
          <li key={chip.key}>
            <FilterChip label={chip.label} onRemove={chip.remove} />
          </li>
        ))}
        <li>
          <Button variant="ghost" size="sm" onClick={onClearAll}>
            Clear filters
          </Button>
        </li>
      </ul>
    </div>
  );
}
