"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitChangeRequest } from "../actions";

export function ChangeRequestForm({
  clinicId,
  clinicSlug,
}: {
  clinicId: string;
  clinicSlug: string;
}) {
  const [message, setMessage] = useState("");
  const [fieldHint, setFieldHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await submitChangeRequest({
        clinic_id: clinicId,
        message,
        field_hint: fieldHint,
      });
      if (result.error) setError(result.error);
      else setDone(result.message ?? "Sent.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div
        role="status"
        className="rounded-xl border border-success/40 bg-success-subtle p-8 text-center"
      >
        <p className="font-heading text-xl font-semibold">Request sent</p>
        <p className="mt-2 text-sm text-muted-foreground">{done}</p>
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
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}{" "}
          {error.includes("Sign in") && (
            <Link
              href={`/login?next=/clinics/${clinicSlug}/suggest-edit`}
              className="underline underline-offset-4"
            >
              Sign in
            </Link>
          )}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="field_hint">Which detail? (optional)</Label>
        <Input
          id="field_hint"
          value={fieldHint}
          onChange={(e) => setFieldHint(e.target.value)}
          maxLength={80}
          placeholder="e.g. Phone number, Opening hours, Services"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="message">What should change? *</Label>
        <Textarea
          id="message"
          rows={5}
          required
          minLength={10}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe the correction — include the right information if you know it."
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Send correction request
      </Button>
    </form>
  );
}
