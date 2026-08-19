"use client";

import { SlidersHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  formatCountChip,
  formatDistanceChip,
  formatServiceChip,
} from "../filter-chip-labels";
import { FilterChip } from "./FilterChip";
import {
  AgeCheckboxList,
  FILTER_FLAG_LABELS,
  ServiceCheckboxList,
  type FilterFlagKey,
  type FilterState,
} from "./SearchFilters";

interface FilterBarProps {
  serviceOptions: { slug: string; name: string }[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  /** Opens the full "More filters" sheet. */
  onOpenMore: () => void;
  /** Filters that only live in the sheet (verified, in-person). */
  moreCount: number;
  /** Distance chip only makes sense once the search has coordinates. */
  showDistance: boolean;
  className?: string;
}

/**
 * Primary chip row — Service · Distance · Age group · Online · Accessible ·
 * Open now · More filters. Primary filters scroll while More filters stays
 * visible at the edge, so the complete filter sheet never becomes hidden.
 * chips open a small popover; toggles flip in place; everything else lives
 * in the sheet. Only "More filters" carries the word "filters" so the button
 * stays unambiguous for people and for tests.
 */
export function FilterBar({
  serviceOptions,
  value,
  onChange,
  onOpenMore,
  moreCount,
  showDistance,
  className,
}: FilterBarProps) {
  function setFlag(key: FilterFlagKey, flag: boolean) {
    onChange({ ...value, [key]: flag });
  }

  const toggles: { key: FilterFlagKey; label: string; title?: string }[] = [
    { key: "online", label: "Online", title: FILTER_FLAG_LABELS.online },
    {
      key: "accessible",
      label: "Accessible",
      title: FILTER_FLAG_LABELS.accessible,
    },
    { key: "open", label: FILTER_FLAG_LABELS.open },
  ];

  return (
    <div
      role="group"
      aria-label="Refine results"
      className={cn(
        "-mx-3 flex min-w-0 items-center gap-2 px-3 py-0.5 sm:-mx-4 sm:px-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Popover>
          <PopoverTrigger
            render={
              <FilterChip
                kind="menu"
                label={formatServiceChip(value.services, serviceOptions)}
                active={value.services.length > 0}
                aria-label={
                  value.services.length > 0
                    ? `Service: ${formatServiceChip(value.services, serviceOptions)}`
                    : "Service"
                }
              />
            }
          />
          <PopoverContent align="start" className="w-80 p-3">
            <p className="px-1 pb-1 text-sm font-semibold">Services</p>
            <ServiceCheckboxList
              idPrefix="bar-svc"
              serviceOptions={serviceOptions}
              value={value}
              onChange={onChange}
            />
          </PopoverContent>
        </Popover>

        {showDistance && (
          <Popover>
            <PopoverTrigger
              render={
                <FilterChip
                  kind="menu"
                  label={formatDistanceChip(value.radius)}
                  active={value.radius !== 10}
                  aria-label={`Distance: ${formatDistanceChip(value.radius)}`}
                />
              }
            />
            <PopoverContent align="start" className="w-72 p-4">
              <p className="pb-3 text-sm font-semibold">
                Distance: within {value.radius} km
              </p>
              <Slider
                aria-label="Search radius in kilometers"
                min={1}
                max={50}
                step={1}
                value={value.radius}
                onValueChange={(v) =>
                  onChange({ ...value, radius: Array.isArray(v) ? v[0] : v })
                }
              />
            </PopoverContent>
          </Popover>
        )}

        <Popover>
          <PopoverTrigger
            render={
              <FilterChip
                kind="menu"
                label={formatCountChip("Age group", value.ages.length)}
                active={value.ages.length > 0}
              />
            }
          />
          <PopoverContent align="start" className="w-72 p-3">
            <p className="px-1 pb-1 text-sm font-semibold">Age groups served</p>
            <AgeCheckboxList
              idPrefix="bar-age"
              value={value}
              onChange={onChange}
            />
          </PopoverContent>
        </Popover>

        {toggles.map(({ key, label, title }) => (
          <FilterChip
            key={key}
            label={label}
            pressed={value[key]}
            onClick={() => setFlag(key, !value[key])}
            title={title}
            aria-label={title}
          />
        ))}
      </div>

      <FilterChip
        kind="menu"
        label={formatCountChip("More filters", moreCount)}
        active={moreCount > 0}
        icon={<SlidersHorizontal className="size-4" aria-hidden />}
        onClick={onOpenMore}
        aria-haspopup="dialog"
        className="bg-card shadow-[-12px_0_16px_-14px_color-mix(in_oklab,var(--foreground)_28%,transparent)]"
      />
    </div>
  );
}
