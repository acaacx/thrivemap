"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CONVERSATION_REPORT_TYPES,
  REPORT_TYPE_LABELS,
} from "@/modules/reports/report-types";
import { reportInquiryAction } from "../actions";

// Native select on purpose: consistent with other native-driven forms in
// this app, and simpler for Playwright than a Base UI listbox.
const SELECT_CLASSES =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export function ReportInquiryDialog({
  inquiryId,
  open,
  onOpenChange,
}: {
  inquiryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reportType, setReportType] = useState<string>("other");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await reportInquiryAction({
        inquiryId,
        reportType,
        details,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Report submitted.");
      setDetails("");
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report this conversation</DialogTitle>
          <DialogDescription>
            Reporting shares this conversation with our moderators.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-inquiry-type">What&apos;s wrong?</Label>
            <select
              id="report-inquiry-type"
              className={SELECT_CLASSES}
              value={reportType}
              onChange={(event) => setReportType(event.target.value)}
            >
              {CONVERSATION_REPORT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {REPORT_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-inquiry-details">Details (optional)</Label>
            <Textarea
              id="report-inquiry-details"
              rows={4}
              maxLength={2000}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Tell us what's wrong with this conversation…"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              Submit report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
