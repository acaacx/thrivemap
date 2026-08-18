"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ResultsHeaderProps {
  count: number;
  /** e.g. ["Speech Therapy", "Quezon City"] → "Speech Therapy · Quezon City". */
  context?: (string | null | undefined)[];
  /** First load — nothing to show yet. */
  loading?: boolean;
  /** Refetch while previous results stay on screen. */
  updating?: boolean;
  /** Right-aligned control (List | Map toggle on small screens). */
  trailing?: ReactNode;
  className?: string;
}

/**
 * One line of context ("Speech Therapy · Quezon City") and one line of
 * count ("12 clinics found"). The count is announced politely; the phrasing
 * "clinics found" is part of the e2e contract.
 */
export function ResultsHeader({
  count,
  context = [],
  loading = false,
  updating = false,
  trailing,
  className,
}: ResultsHeaderProps) {
  const contextLine = context.filter(Boolean).join(" · ");
  return (
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col">
        {contextLine && (
          <p className="truncate text-sm font-medium text-accent-foreground">
            {contextLine}
          </p>
        )}
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Finding therapy centers nearby…
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">
                {count} clinic{count === 1 ? "" : "s"} found
              </span>
              {updating && (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Updating…
                </span>
              )}
            </>
          )}
        </p>
      </div>
      {trailing}
    </div>
  );
}
