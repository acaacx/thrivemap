"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterChipProps {
  label: string;
  onRemove: () => void;
  className?: string;
}

/**
 * Removable active-filter chip. One tap target (the whole chip), an
 * explicit "×", and a screen-reader label that says what removing does.
 */
export function FilterChip({ label, onRemove, className }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter: ${label}`}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/40 bg-primary-subtle pl-3 pr-2 text-sm font-medium text-accent-foreground transition-colors duration-150 hover:border-primary hover:bg-primary-subtle/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <span aria-hidden>{label}</span>
      <X className="size-4" aria-hidden />
    </button>
  );
}
