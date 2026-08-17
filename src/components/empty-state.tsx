import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  /** Obvious next actions — buttons or links. */
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * Reassuring empty state: says what happened in plain words and offers
 * clear next steps. Bordered, not dashed; no illustration.
 */
export function EmptyState({
  title,
  body,
  actions,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-6 sm:p-8",
        className,
      )}
    >
      {icon && (
        <span className="grid size-10 place-items-center rounded-lg bg-secondary text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-lg font-semibold text-foreground">{title}</p>
        {body && (
          <div className="max-w-prose text-base leading-relaxed text-muted-foreground">
            {body}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
