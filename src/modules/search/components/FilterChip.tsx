"use client";

import { ChevronDown, X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const chipBase =
  "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border text-sm font-medium transition-colors duration-150 ease-calm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";
const chipIdle =
  "border-input bg-card text-foreground hover:bg-muted aria-expanded:bg-muted";
const chipActive =
  "border-primary bg-primary-subtle text-accent-foreground hover:bg-primary-subtle/70";

type BaseProps = {
  label: ReactNode;
  className?: string;
};

type ToggleChipProps = BaseProps & {
  kind?: "toggle";
  pressed: boolean;
  onClick: () => void;
  icon?: ReactNode;
} & Omit<ComponentProps<"button">, "onClick" | "children">;

type MenuChipProps = BaseProps & {
  kind: "menu";
  /** Something is chosen inside — draws the chip filled. */
  active: boolean;
  icon?: ReactNode;
} & Omit<ComponentProps<"button">, "children">;

type RemovableChipProps = BaseProps & {
  kind?: "removable";
  onRemove: () => void;
  label: string;
};

export type FilterChipProps =
  ToggleChipProps | MenuChipProps | RemovableChipProps;

/**
 * Pill-shaped filter control, three flavours with one look:
 * - toggle: on/off (`aria-pressed`) — Online, Accessible, Open now
 * - menu: opens a popover/sheet (chevron; pass through as a trigger)
 * - removable: an applied filter with an explicit "×"
 * 44px-tall touch target via padding; state is border + fill + text, never
 * colour alone.
 */
export function FilterChip(props: FilterChipProps) {
  if ("onRemove" in props) {
    const { label, onRemove, className } = props;
    return (
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className={cn(chipBase, chipActive, "pl-3.5 pr-2.5", className)}
      >
        <span aria-hidden>{label}</span>
        <X className="size-4" aria-hidden />
      </button>
    );
  }
  if (props.kind === "menu") {
    const { label, active, icon, className, kind: _kind, ...rest } = props;
    void _kind;
    return (
      <button
        type="button"
        className={cn(
          chipBase,
          active ? chipActive : chipIdle,
          "pl-3.5 pr-2.5",
          className,
        )}
        {...rest}
      >
        {icon}
        {label}
        <ChevronDown className="size-4 text-subtle" aria-hidden />
      </button>
    );
  }
  const {
    label,
    pressed,
    onClick,
    icon,
    className,
    kind: _kind,
    ...rest
  } = props;
  void _kind;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        chipBase,
        pressed ? chipActive : chipIdle,
        "px-3.5",
        className,
      )}
      {...rest}
    >
      {icon}
      {label}
    </button>
  );
}
