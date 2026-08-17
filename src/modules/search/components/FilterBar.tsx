"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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
  /** Filters that only live in the sheet (shown on desktop). */
  moreCount: number;
  /** All active filters (shown on mobile, where the sheet holds everything). */
  totalCount: number;
  className?: string;
}

/**
 * The visible filter row: two multi-select popovers, three plain toggles,
 * and "More filters". On small screens only "More filters" shows (the sheet
 * holds everything) so the toolbar stays short. Every control is a labelled button — no icon-only
 * meanings. Trigger labels avoid the word "filters" (only "More filters"
 * carries it) so the button is unambiguous for people and for tests.
 */
export function FilterBar({
  serviceOptions,
  value,
  onChange,
  onOpenMore,
  moreCount,
  totalCount,
  className,
}: FilterBarProps) {
  function setFlag(key: FilterFlagKey, flag: boolean) {
    onChange({ ...value, [key]: flag });
  }

  const toggles: { key: FilterFlagKey; label: string }[] = [
    { key: "online", label: FILTER_FLAG_LABELS.online },
    { key: "accessible", label: "Accessibility" },
    { key: "open", label: FILTER_FLAG_LABELS.open },
  ];

  return (
    <div
      role="group"
      aria-label="Refine results"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="lg"
              className="hidden md:inline-flex"
              aria-pressed={value.services.length > 0}
            />
          }
        >
          Service
          {value.services.length > 0 && (
            <span className="text-sm text-muted-foreground">
              · {value.services.length}
            </span>
          )}
          <ChevronDown aria-hidden className="text-subtle" />
        </PopoverTrigger>
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

      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="lg"
              className="hidden md:inline-flex"
              aria-pressed={value.ages.length > 0}
            />
          }
        >
          Age group
          {value.ages.length > 0 && (
            <span className="text-sm text-muted-foreground">
              · {value.ages.length}
            </span>
          )}
          <ChevronDown aria-hidden className="text-subtle" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          <p className="px-1 pb-1 text-sm font-semibold">Age groups served</p>
          <AgeCheckboxList
            idPrefix="bar-age"
            value={value}
            onChange={onChange}
          />
        </PopoverContent>
      </Popover>

      {toggles.map(({ key, label }) => (
        <Button
          key={key}
          type="button"
          variant="outline"
          size="lg"
          className="hidden md:inline-flex"
          aria-pressed={value[key]}
          onClick={() => setFlag(key, !value[key])}
          title={
            key === "accessible" ? FILTER_FLAG_LABELS.accessible : undefined
          }
        >
          {label}
        </Button>
      ))}

      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={onOpenMore}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal aria-hidden />
        More filters
        {moreCount > 0 && (
          <span className="text-sm text-muted-foreground">· {moreCount}</span>
        )}
        {moreCount === 0 && totalCount > 0 && (
          <span className="text-sm text-muted-foreground md:hidden">
            · {totalCount}
          </span>
        )}
      </Button>
    </div>
  );
}
