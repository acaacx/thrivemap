"use client";

import { List, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShellView } from "../view-preference";

interface MapListToggleProps {
  value: ShellView;
  onChange: (value: ShellView) => void;
  className?: string;
}

const OPTIONS: { value: ShellView; label: string; icon: typeof List }[] = [
  { value: "list", label: "List", icon: List },
  { value: "map", label: "Map", icon: MapIcon },
];

/**
 * Segmented control (icon + text on both segments) exposed as a radiogroup:
 * arrow keys move between segments, selection is a filled background plus a
 * border — never colour alone.
 */
export function MapListToggle({
  value,
  onChange,
  className,
}: MapListToggleProps) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const index = OPTIONS.findIndex((o) => o.value === value);
    const nextIndex =
      e.key === "ArrowRight"
        ? (index + 1) % OPTIONS.length
        : (index - 1 + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[nextIndex].value);
    const target =
      e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[
        nextIndex
      ];
    target?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Show results as list or map"
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-lg border border-border bg-card p-1",
        className,
      )}
    >
      {OPTIONS.map(({ value: v, label, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(v)}
            className={cn(
              "inline-flex h-full min-w-16 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150 ease-calm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
