"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminUpdateClinicIdentity } from "../actions";
import {
  adminClinicIdentitySchema,
  type AdminClinicIdentityInput,
} from "../schemas";

export function ClinicIdentityForm({
  clinicId,
  initial,
  hasLocation,
}: {
  clinicId: string;
  initial: AdminClinicIdentityInput;
  hasLocation: boolean;
}) {
  const router = useRouter();
  const form = useForm<
    AdminClinicIdentityInput,
    unknown,
    AdminClinicIdentityInput
  >({
    resolver: zodResolver(adminClinicIdentitySchema),
    defaultValues: initial,
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function onSubmit(values: AdminClinicIdentityInput) {
    setFeedback(null);
    setBusy(true);
    try {
      const result = await adminUpdateClinicIdentity(clinicId, values);
      if (result.error) setFeedback({ kind: "error", text: result.error });
      else {
        setFeedback({ kind: "ok", text: result.message ?? "Saved." });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
    >
      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.kind === "error"
              ? "border-destructive/40 bg-destructive/10"
              : "border-[var(--verified)]/40 bg-[var(--verified)]/10"
          }`}
        >
          {feedback.text}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="admin-clinic-name">Clinic name</Label>
        <Input id="admin-clinic-name" {...form.register("name")} />
        {form.formState.errors.name?.message && (
          <p className="text-xs text-destructive" role="alert">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="admin-clinic-address">Primary address line</Label>
        <Input
          id="admin-clinic-address"
          disabled={!hasLocation}
          {...form.register("address_line1")}
        />
        <p className="text-xs text-muted-foreground">
          {hasLocation
            ? "City and province come from the pinned location and are not edited here."
            : "This clinic has no location yet, so there is no address to edit."}
        </p>
        {form.formState.errors.address_line1?.message && (
          <p className="text-xs text-destructive" role="alert">
            {form.formState.errors.address_line1.message}
          </p>
        )}
      </div>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        Save name &amp; address
      </Button>
    </form>
  );
}
