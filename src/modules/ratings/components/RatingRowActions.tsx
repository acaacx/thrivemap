"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { unvoidRating, voidRating } from "../admin-actions";

/** Per-row void/unvoid toggle for the admin ratings panel. */
export function RatingRowActions({
  ratingId,
  voided,
}: {
  ratingId: string;
  voided: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setBusy(true);
    try {
      const result = voided
        ? await unvoidRating(ratingId)
        : await voidRating(ratingId);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
      } else {
        toast.success(result.message ?? "Done.");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={voided ? "outline" : "destructive"}
        className="rounded-full text-xs"
        disabled={busy}
        onClick={onClick}
      >
        {busy && (
          <Loader2 aria-hidden className="mr-1.5 h-3 w-3 animate-spin" />
        )}
        {voided ? "Restore" : "Void"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
