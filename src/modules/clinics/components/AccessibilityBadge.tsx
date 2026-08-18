import { Accessibility, Video, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AccessibilityKind = "online" | "wheelchair";

const META: Record<AccessibilityKind, { icon: LucideIcon; label: string }> = {
  online: { icon: Video, label: "Online" },
  wheelchair: { icon: Accessibility, label: "Wheelchair" },
};

/**
 * Small neutral meta chip for a listed access option (icon + word, never
 * colour alone). Renders only when the clinic has explicitly listed it.
 */
export function AccessibilityBadge({
  kind,
  className,
}: {
  kind: AccessibilityKind;
  className?: string;
}) {
  const { icon: Icon, label } = META[kind];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3.5 text-subtle" aria-hidden />
      {label}
    </span>
  );
}

/** The chips a clinic row earns from its listed options, in a fixed order. */
export function accessibilityKinds(clinic: {
  offersOnline?: boolean | null;
  wheelchairAccessible?: boolean | null;
}): AccessibilityKind[] {
  const kinds: AccessibilityKind[] = [];
  if (clinic.offersOnline) kinds.push("online");
  if (clinic.wheelchairAccessible === true) kinds.push("wheelchair");
  return kinds;
}
