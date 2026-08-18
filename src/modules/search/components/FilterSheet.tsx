"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { SortOption } from "../schemas";
import {
  SearchFilters,
  countActiveFilters,
  type FilterState,
} from "./SearchFilters";

export const SORT_LABELS: Record<SortOption, string> = {
  nearest: "Nearest",
  relevance: "Most relevant",
  verified_first: "Verified first",
  recently_verified: "Recently verified",
  alphabetical: "Alphabetical",
};

interface FilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOptions: { slug: string; name: string }[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  onClearAll: () => void;
  showRadius: boolean;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  /** Result count for the "Show N clinics" button; null before any search. */
  resultsCount: number | null;
}

/**
 * "More filters": every filter (services, age groups, options, distance)
 * plus sort, in one side sheet. Changes apply immediately — the primary
 * button just closes.
 */
export function FilterSheet({
  open,
  onOpenChange,
  serviceOptions,
  value,
  onChange,
  onClearAll,
  showRadius,
  sort,
  onSortChange,
  resultsCount,
}: FilterSheetProps) {
  const activeCount = countActiveFilters(value);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full max-w-sm overflow-y-auto p-6">
        <SheetHeader className="p-0 pb-4">
          <SheetTitle className="text-lg font-semibold">
            More filters
          </SheetTitle>
          <SheetDescription>
            Narrow results by service, age group, and listed options.
            {activeCount > 0 &&
              ` ${activeCount} filter${activeCount === 1 ? "" : "s"} active.`}
          </SheetDescription>
        </SheetHeader>
        <SearchFilters
          serviceOptions={serviceOptions}
          value={value}
          onChange={onChange}
          showRadius={showRadius}
        />
        <div className="mt-6 flex flex-col gap-2 border-t pt-4">
          <p className="text-sm font-semibold">Sort results</p>
          <Select
            value={sort}
            items={SORT_LABELS}
            onValueChange={(next) => onSortChange(next as SortOption)}
          >
            <SelectTrigger
              className="w-full data-[size=default]:h-11"
              aria-label="Sort results"
            >
              <span className="text-muted-foreground">Sort:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORT_LABELS).map(([sortValue, label]) => (
                <SelectItem key={sortValue} value={sortValue}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            &ldquo;Nearest&rdquo; orders by distance from the place you
            searched; it is not a rating.
          </p>
        </div>
        <div className="mt-6 flex gap-2 border-t pt-4">
          <Button size="lg" onClick={() => onOpenChange(false)}>
            {resultsCount == null
              ? "Done"
              : `Show ${resultsCount} clinic${resultsCount === 1 ? "" : "s"}`}
          </Button>
          {activeCount > 0 && (
            <Button variant="ghost" size="lg" onClick={onClearAll}>
              Clear all
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
