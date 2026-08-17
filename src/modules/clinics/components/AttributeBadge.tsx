import { Check, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AttributeBadgeProps {
  label: string;
  /**
   * true  → "✓ label"; false → "– Not listed as …" (only when the fact is
   * explicitly recorded as false); undefined/null → not rendered.
   */
  value: boolean | null | undefined;
  icon?: LucideIcon;
  className?: string;
}

/**
 * A single clinic attribute as icon + label. Never colour alone; the ✓ / –
 * glyph carries the meaning. Renders nothing when the data isn't known so
 * we never imply an attribute the clinic hasn't listed.
 */
export function AttributeBadge({
  label,
  value,
  icon: Icon,
  className,
}: AttributeBadgeProps) {
  if (value == null) return null;
  const Glyph = value ? Check : Minus;
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 text-sm",
        value ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      <Glyph
        className={cn(
          "size-4 shrink-0",
          value ? "text-success" : "text-subtle",
        )}
        aria-hidden
      />
      {Icon && <Icon className="size-4 shrink-0 text-subtle" aria-hidden />}
      <span>{value ? label : `Not listed as ${label.toLowerCase()}`}</span>
    </span>
  );
}
