"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title: string;
  /** What happened / whether anything was lost, in plain language. */
  body?: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  className?: string;
}

/**
 * Error state that explains what happened, reassures nothing was lost,
 * and offers one clear action.
 */
export function ErrorState({
  title,
  body,
  onRetry,
  retryLabel = "Try again",
  retrying,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-4 rounded-xl border border-warning/40 bg-warning-subtle/60 p-6 sm:p-8",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className="mt-0.5 size-5 shrink-0 text-warning"
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          {body && (
            <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
              {body}
            </p>
          )}
        </div>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="lg"
          onClick={onRetry}
          disabled={retrying}
        >
          <RotateCcw aria-hidden className={cn(retrying && "animate-spin")} />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
