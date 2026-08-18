"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceChipProps {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  /** "More" variant — points onward instead of toggling. */
  more?: boolean;
  className?: string;
}

/**
 * Service shortcut for the empty state. A real button with `aria-pressed`
 * (state is border + fill + text, never colour alone), 44px tall.
 */
export function ServiceChip({
  label,
  pressed = false,
  onClick,
  icon: Icon,
  more = false,
  className,
}: ServiceChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={more ? undefined : pressed}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-150 ease-calm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        pressed
          ? "border-primary bg-primary-subtle text-accent-foreground"
          : "border-border bg-card text-foreground hover:border-primary/60 hover:bg-primary-subtle/40",
        className,
      )}
    >
      {Icon && <Icon className="size-4 text-subtle" aria-hidden />}
      {label}
      {more && <ChevronRight className="size-4 text-subtle" aria-hidden />}
    </button>
  );
}
