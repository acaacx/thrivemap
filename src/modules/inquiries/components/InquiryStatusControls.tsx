"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { setInquiryStatusAction } from "../actions";
import { canTransition, type InquiryStatus } from "../schemas";

// Native date input on purpose: Playwright drives it far more reliably than
// a Base UI date picker. Styled to match Input's classes for visual parity.
const DATE_INPUT_CLASSES =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80";

type Action = "confirmed" | "declined" | "closed" | null;

export function InquiryStatusControls({
  inquiryId,
  status,
  preferredDate,
}: {
  inquiryId: string;
  status: InquiryStatus;
  preferredDate: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmedDate, setConfirmedDate] = useState(preferredDate ?? "");
  const [declineArmed, setDeclineArmed] = useState(false);
  const [closeArmed, setCloseArmed] = useState(false);
  const [pending, setPending] = useState<Action>(null);

  const canConfirm = canTransition(status, "confirmed");
  const canDecline = canTransition(status, "declined");
  const canClose = canTransition(status, "closed");

  if (!canConfirm && !canDecline && !canClose) return null;

  async function submitStatus(
    target: "confirmed" | "declined" | "closed",
    date?: string,
  ) {
    setPending(target);
    try {
      const result = await setInquiryStatusAction({
        inquiryId,
        status: target,
        confirmedDate: date,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Status updated.");
      setDeclineArmed(false);
      setCloseArmed(false);
      setConfirming(false);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
      {canConfirm &&
        (confirming ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitStatus("confirmed", confirmedDate);
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="inquiry-confirmed-date" className="sr-only">
                Confirmed date
              </Label>
              <input
                id="inquiry-confirmed-date"
                name="confirmedDate"
                type="date"
                value={confirmedDate}
                onChange={(event) => setConfirmedDate(event.target.value)}
                className={DATE_INPUT_CLASSES}
                required
              />
            </div>
            <Button type="submit" size="sm" disabled={pending === "confirmed"}>
              {pending === "confirmed" && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              Confirm date
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={pending === "confirmed"}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button size="sm" onClick={() => setConfirming(true)}>
            Confirm
          </Button>
        ))}

      {canDecline && (
        <Button
          size="sm"
          variant="destructive"
          disabled={pending === "declined"}
          onClick={() => {
            if (!declineArmed) {
              setDeclineArmed(true);
              return;
            }
            submitStatus("declined");
          }}
        >
          {pending === "declined" && (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          )}
          {declineArmed ? "Really decline?" : "Decline"}
        </Button>
      )}

      {canClose && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending === "closed"}
          onClick={() => {
            if (!closeArmed) {
              setCloseArmed(true);
              return;
            }
            submitStatus("closed");
          }}
        >
          {pending === "closed" && (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          )}
          {closeArmed ? "Really close?" : "Close"}
        </Button>
      )}
    </div>
  );
}
