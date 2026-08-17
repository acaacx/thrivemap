"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { AGE_GROUPS } from "../schemas";

export interface FilterState {
  services: string[];
  ages: string[];
  verified: boolean;
  online: boolean;
  inperson: boolean;
  open: boolean;
  accessible: boolean;
  radius: number;
}

export type FilterFlagKey =
  "verified" | "online" | "inperson" | "open" | "accessible";

export const FILTER_FLAG_LABELS: Record<FilterFlagKey, string> = {
  verified: "Verified clinics only",
  open: "Open now",
  online: "Online therapy",
  inperson: "In-person sessions",
  accessible: "Wheelchair accessible",
};

export const AGE_LABELS: Record<string, string> = {
  infants: "Infants",
  toddlers: "Toddlers",
  preschool: "Preschool",
  school_age: "School age",
  teenagers: "Teenagers",
  adults: "Adults",
};

export const EMPTY_FILTER_STATE: Omit<FilterState, "radius"> = {
  services: [],
  ages: [],
  verified: false,
  online: false,
  inperson: false,
  open: false,
  accessible: false,
};

export function countActiveFilters(value: FilterState): number {
  return (
    value.services.length +
    value.ages.length +
    (Object.keys(FILTER_FLAG_LABELS) as FilterFlagKey[]).filter((k) => value[k])
      .length
  );
}

function toggleItem(list: string[], item: string) {
  return list.includes(item) ? list.filter((v) => v !== item) : [...list, item];
}

interface CheckboxListProps {
  idPrefix: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}

/** Shared checkbox list — same markup in the filter bar popovers and the sheet. */
function CheckboxList({
  idPrefix,
  options,
  selected,
  onToggle,
}: CheckboxListProps) {
  return (
    <div className="flex flex-col">
      {options.map((option) => {
        const id = `${idPrefix}-${option.value}`;
        return (
          <div
            key={option.value}
            className="flex min-h-11 items-center gap-3 rounded-md px-1"
          >
            <Checkbox
              id={id}
              checked={selected.includes(option.value)}
              onCheckedChange={() => onToggle(option.value)}
            />
            <Label htmlFor={id} className="flex-1 py-2 text-base font-normal">
              {option.label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}

export function ServiceCheckboxList({
  idPrefix,
  serviceOptions,
  value,
  onChange,
}: {
  idPrefix: string;
  serviceOptions: { slug: string; name: string }[];
  value: FilterState;
  onChange: (next: FilterState) => void;
}) {
  return (
    <CheckboxList
      idPrefix={idPrefix}
      options={serviceOptions.map((s) => ({ value: s.slug, label: s.name }))}
      selected={value.services}
      onToggle={(slug) =>
        onChange({ ...value, services: toggleItem(value.services, slug) })
      }
    />
  );
}

export function AgeCheckboxList({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: FilterState;
  onChange: (next: FilterState) => void;
}) {
  return (
    <CheckboxList
      idPrefix={idPrefix}
      options={AGE_GROUPS.map((age) => ({
        value: age,
        label: AGE_LABELS[age],
      }))}
      selected={value.ages}
      onToggle={(age) =>
        onChange({ ...value, ages: toggleItem(value.ages, age) })
      }
    />
  );
}

interface SearchFiltersProps {
  serviceOptions: { slug: string; name: string }[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  showRadius: boolean;
}

/**
 * Full filter panel (the "More filters" sheet). Filters describe listed
 * services and attributes only — they make no claim about clinical
 * appropriateness for any person.
 */
export function SearchFilters({
  serviceOptions,
  value,
  onChange,
  showRadius,
}: SearchFiltersProps) {
  function setFlag(key: FilterFlagKey, flag: boolean) {
    onChange({ ...value, [key]: flag });
  }

  return (
    <div className="flex flex-col gap-8">
      <fieldset>
        <legend className="mb-2 text-base font-semibold">Services</legend>
        <ServiceCheckboxList
          idPrefix="sheet-svc"
          serviceOptions={serviceOptions}
          value={value}
          onChange={onChange}
        />
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-base font-semibold">
          Age groups served
        </legend>
        <AgeCheckboxList
          idPrefix="sheet-age"
          value={value}
          onChange={onChange}
        />
      </fieldset>

      <fieldset className="flex flex-col">
        <legend className="mb-2 text-base font-semibold">Options</legend>
        {(Object.keys(FILTER_FLAG_LABELS) as FilterFlagKey[]).map((key) => (
          <div
            key={key}
            className="flex min-h-11 items-center justify-between gap-3 px-1"
          >
            <Label htmlFor={`opt-${key}`} className="text-base font-normal">
              {FILTER_FLAG_LABELS[key]}
            </Label>
            <Switch
              id={`opt-${key}`}
              checked={value[key]}
              onCheckedChange={(checked) => setFlag(key, checked)}
            />
          </div>
        ))}
      </fieldset>

      {showRadius && (
        <fieldset>
          <legend className="mb-3 text-base font-semibold">
            Distance: within {value.radius} km
          </legend>
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
        </fieldset>
      )}

      <p className="text-sm text-muted-foreground">
        Filters describe listed services only — they aren&apos;t a clinical
        recommendation.
      </p>
    </div>
  );
}
