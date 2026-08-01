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

interface SearchFiltersProps {
  serviceOptions: { slug: string; name: string }[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  showRadius: boolean;
}

const AGE_LABELS: Record<string, string> = {
  infants: "Infants",
  toddlers: "Toddlers",
  preschool: "Preschool",
  school_age: "School age",
  teenagers: "Teenagers",
  adults: "Adults",
};

/**
 * Filter controls. Filters describe listed services and attributes only —
 * they make no claim about clinical appropriateness for any person.
 */
export function SearchFilters({ serviceOptions, value, onChange, showRadius }: SearchFiltersProps) {
  function toggleList(key: "services" | "ages", item: string) {
    const list = value[key];
    onChange({
      ...value,
      [key]: list.includes(item) ? list.filter((v) => v !== item) : [...list, item],
    });
  }

  function setFlag(key: keyof FilterState, flag: boolean) {
    onChange({ ...value, [key]: flag });
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Services</legend>
        <div className="space-y-2">
          {serviceOptions.map((service) => (
            <div key={service.slug} className="flex items-center gap-2">
              <Checkbox
                id={`svc-${service.slug}`}
                checked={value.services.includes(service.slug)}
                onCheckedChange={() => toggleList("services", service.slug)}
              />
              <Label htmlFor={`svc-${service.slug}`} className="font-normal">
                {service.name}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Age groups served</legend>
        <div className="space-y-2">
          {AGE_GROUPS.map((age) => (
            <div key={age} className="flex items-center gap-2">
              <Checkbox
                id={`age-${age}`}
                checked={value.ages.includes(age)}
                onCheckedChange={() => toggleList("ages", age)}
              />
              <Label htmlFor={`age-${age}`} className="font-normal">
                {AGE_LABELS[age]}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">Options</legend>
        {(
          [
            ["verified", "Verified clinics only"],
            ["open", "Open now"],
            ["online", "Online services"],
            ["inperson", "In-person services"],
            ["accessible", "Wheelchair accessible"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <Label htmlFor={`opt-${key}`} className="font-normal">
              {label}
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
          <legend className="mb-2 text-sm font-semibold">
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

      <p className="text-xs text-muted-foreground">
        Filters describe listed services only — they aren&apos;t a clinical
        recommendation.
      </p>
    </div>
  );
}
