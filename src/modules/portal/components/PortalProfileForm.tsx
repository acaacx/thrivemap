"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateClinicProfile } from "../actions";
import { portalProfileSchema, type PortalProfileInput } from "../schemas";

interface PortalProfileFormProps {
  clinicId: string;
  directEdit: boolean;
  initial: PortalProfileInput;
}

export function PortalProfileForm({
  clinicId,
  directEdit,
  initial,
}: PortalProfileFormProps) {
  const form = useForm<PortalProfileInput>({
    resolver: zodResolver(portalProfileSchema),
    defaultValues: initial,
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function onSubmit(values: PortalProfileInput) {
    setFeedback(null);
    setBusy(true);
    try {
      const result = await updateClinicProfile(clinicId, values);
      setFeedback(
        result.error
          ? { kind: "error", text: result.error }
          : { kind: "ok", text: result.message ?? "Saved." },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-5"
      noValidate
    >
      {!directEdit && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-muted-foreground">
          This listing isn&apos;t verified yet, so edits are reviewed by a
          moderator before going live.
        </p>
      )}
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
        <Label htmlFor="portal-description">Description</Label>
        <Textarea
          id="portal-description"
          rows={5}
          {...form.register("description")}
        />
        <FieldError message={form.formState.errors.description?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="portal-phone">Phone</Label>
          <Input id="portal-phone" type="tel" {...form.register("phone")} />
          <FieldError message={form.formState.errors.phone?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="portal-email">Email</Label>
          <Input id="portal-email" type="email" {...form.register("email")} />
          <FieldError message={form.formState.errors.email?.message} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="portal-website">Website</Label>
        <Input
          id="portal-website"
          placeholder="https://…"
          {...form.register("website")}
        />
        <FieldError message={form.formState.errors.website?.message} />
      </div>

      <fieldset className="space-y-3 rounded-xl border bg-card p-4">
        <legend className="px-1 text-sm font-medium">Service delivery</legend>
        <CheckboxRow
          form={form}
          name="offers_in_person_services"
          label="In-person sessions"
        />
        <CheckboxRow
          form={form}
          name="offers_online_services"
          label="Online sessions"
        />
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border bg-card p-4">
        <legend className="px-1 text-sm font-medium">Accessibility</legend>
        <CheckboxRow
          form={form}
          name="wheelchair_accessible"
          label="Wheelchair accessible"
        />
        <div className="space-y-1.5">
          <Label htmlFor="portal-access-notes">Accessibility notes</Label>
          <Textarea
            id="portal-access-notes"
            rows={2}
            placeholder="Ramps, elevators, sensory-friendly waiting area…"
            {...form.register("accessibility_notes")}
          />
        </div>
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" className="rounded-full" disabled={busy}>
          {busy && (
            <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
          )}
          {directEdit ? "Publish changes" : "Submit for review"}
        </Button>
      </div>
    </form>
  );
}

function CheckboxRow({
  form,
  name,
  label,
}: {
  form: ReturnType<typeof useForm<PortalProfileInput>>;
  name:
    | "offers_in_person_services"
    | "offers_online_services"
    | "wheelchair_accessible";
  label: string;
}) {
  const value = form.watch(name);
  return (
    <label className="flex items-center gap-3 text-sm">
      <Checkbox
        checked={value}
        onCheckedChange={(checked) => form.setValue(name, checked === true)}
        aria-label={label}
      />
      {label}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}
