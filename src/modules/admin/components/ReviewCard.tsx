"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdminActionResult } from "../actions";

export interface ReviewActionSpec {
  label: string;
  /** Visual weight; destructive actions always require a reason. */
  variant?: "default" | "outline" | "destructive";
  requiresReason?: boolean;
  run: (reason: string) => Promise<AdminActionResult>;
}

/**
 * Shared decision footer for moderation cards: one reason field plus the
 * workspace's action buttons. Destructive/required actions refuse to run
 * without a reason, per the moderation policy.
 */
export function ReviewActions({
  actions,
  reasonLabel = "Reason / note",
  placeholder = "Visible to admins; required for destructive decisions.",
}: {
  actions: ReviewActionSpec[];
  reasonLabel?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const fieldId = useId();

  async function onRun(action: ReviewActionSpec) {
    setFeedback(null);
    if (
      (action.requiresReason || action.variant === "destructive") &&
      !reason.trim()
    ) {
      setFeedback(`“${action.label}” needs a reason.`);
      return;
    }
    setBusyLabel(action.label);
    try {
      const result = await action.run(reason.trim());
      if (result.error) {
        setFeedback(result.error);
      } else {
        // Success via toast: it lives in the root layout, so it survives the
        // refresh unmounting this card once the item is no longer decidable.
        toast.success(result.message ?? "Done.");
        setReason("");
        router.refresh();
      }
    } finally {
      setBusyLabel(null);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      {feedback && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
        >
          {feedback}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={fieldId} className="text-xs text-muted-foreground">
          {reasonLabel}
        </Label>
        <Textarea
          id={fieldId}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            size="sm"
            variant={action.variant ?? "default"}
            className="rounded-full"
            disabled={busyLabel !== null}
            onClick={() => onRun(action)}
          >
            {busyLabel === action.label && (
              <Loader2 aria-hidden className="mr-2 h-3.5 w-3.5 animate-spin" />
            )}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
