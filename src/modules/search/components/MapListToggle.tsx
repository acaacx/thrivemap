"use client";

import { List, Map as MapIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

interface MapListToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  label: string;
  className?: string;
}

/**
 * Segmented control (icon + text on every segment). Selection is
 * conveyed with `aria-pressed`, a filled background, and a border —
 * never colour alone.
 */
export function MapListToggle<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: MapListToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-lg border border-border bg-card p-1",
        className,
      )}
    >
      {options.map(({ value: v, label: text, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={cn(
              "inline-flex h-full items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {text}
          </button>
        );
      })}
    </div>
  );
}

export const MOBILE_VIEW_OPTIONS: Option<"list" | "map">[] = [
  { value: "list", label: "List", icon: List },
  { value: "map", label: "Map", icon: MapIcon },
];

export const DESKTOP_VIEW_OPTIONS: Option<"split" | "list">[] = [
  { value: "split", label: "Map + list", icon: MapIcon },
  { value: "list", label: "List only", icon: List },
];
