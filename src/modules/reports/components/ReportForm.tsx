"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitClinicReport } from "@/modules/submissions/actions";
import {
  REPORT_TYPES,
  REPORT_TYPE_LABELS,
} from "@/modules/reports/report-types";

export function ReportForm({
  clinicId,
  clinicSlug,
}: {
  clinicId: string;
  clinicSlug: string;
}) {
  const [reportType, setReportType] = useState<string>("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!reportType) {
      setError("Choose what's wrong first.");
      return;
    }
    setPending(true);
    try {
      const result = await submitClinicReport({
        clinic_id: clinicId,
        report_type: reportType,
        details,
      });
      if (result.error) setError(result.error);
      else setMessage(result.message ?? "Report received.");
    } finally {
      setPending(false);
    }
  }

  if (message) {
    return (
      <div
        role="status"
        className="rounded-xl border border-success/40 bg-success-subtle p-8 text-center"
      >
        <p className="font-heading text-xl font-semibold">Thank you</p>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Button
          className="mt-6"
          render={<Link href={`/clinics/${clinicSlug}`} />}
        >
          Back to clinic page
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <fieldset>
        <legend className="mb-3 text-sm font-medium">
          What&apos;s incorrect? *
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {REPORT_TYPES.map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition-colors ${
                reportType === value
                  ? "border-primary bg-secondary/60"
                  : "hover:bg-secondary/40"
              }`}
            >
              <input
                type="radio"
                name="report_type"
                value={value}
                checked={reportType === value}
                onChange={() => setReportType(value)}
                className="accent-[var(--primary)]"
              />
              {REPORT_TYPE_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="details">Details (optional)</Label>
        <Textarea
          id="details"
          rows={4}
          maxLength={2000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Tell us what you found — correct phone number, new address, closure date…"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Send report
      </Button>
      <p className="text-xs text-muted-foreground">
        Reports can be sent without an account. Signed-in reports appear in your
        account so you can track their status.
      </p>
    </form>
  );
}
