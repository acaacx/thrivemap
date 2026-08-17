"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nextStatuses, type ListingStatus } from "@/modules/clinics/lifecycle";
import { setClinicStatus } from "../actions";

const SELECT_CLASSES =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Human hints for the transitions an admin most often needs. */
const STATUS_HINTS: Partial<Record<ListingStatus, string>> = {
  pending_review: "Marks the draft as ready; publish from there.",
  published_unverified: "Goes live in search and on the map.",
  published_verified: "Live with the verified badge.",
  archived: "Hidden everywhere; can be restored to draft.",
  rejected: "Hidden; can be sent back to review.",
};

export function ClinicStatusCard({
  clinicId,
  status,
  canChange,
}: {
  clinicId: string;
  status: ListingStatus;
  canChange: boolean;
}) {
  const router = useRouter();
  const options = nextStatuses(status);
  const [target, setTarget] = useState<ListingStatus | "">(options[0] ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const selectId = useId();
  const reasonId = useId();

  async function onApply() {
    setFeedback(null);
    if (!target) return;
    if (!reason.trim()) {
      setFeedback("A reason is required for status changes.");
      return;
    }
    setBusy(true);
    try {
      const result = await setClinicStatus(clinicId, target, reason.trim());
      if (result.error) setFeedback(result.error);
      else {
        toast.success(result.message ?? "Status updated.");
        setReason("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-heading text-lg font-semibold">Listing status</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Currently <strong>{status.replaceAll("_", " ")}</strong>.
        {status === "draft" &&
          " Drafts are invisible to the public. Move to pending review, then publish."}
      </p>
      {!canChange ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Only administrators can change listing status.
        </p>
      ) : options.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No further transitions from this status.
        </p>
      ) : (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={selectId}>Move to</Label>
            <select
              id={selectId}
              className={SELECT_CLASSES}
              value={target}
              onChange={(e) => setTarget(e.target.value as ListingStatus)}
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            {target && STATUS_HINTS[target] && (
              <p className="text-xs text-muted-foreground">
                {STATUS_HINTS[target]}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={reasonId}>Reason</Label>
            <Textarea
              id={reasonId}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Recorded in the audit log."
            />
          </div>
          {feedback && (
            <p className="text-sm text-destructive" role="alert">
              {feedback}
            </p>
          )}
          <div>
            <Button onClick={onApply} disabled={busy || !target}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Change status
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
