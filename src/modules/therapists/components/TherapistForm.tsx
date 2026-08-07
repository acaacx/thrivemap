"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { therapistInputSchema, type TherapistInput } from "../schemas";

// therapistInputSchema uses .optional().transform() on credentials/bio, so
// its zod input type (raw form values, credentials/bio optional keys) and
// output type (TherapistInput, credentials/bio required `string | undefined`
// keys) differ. useForm needs both: the input shape for defaultValues/
// register, the output shape for the parsed values handed to onSubmit.
type TherapistFormValues = z.input<typeof therapistInputSchema>;

interface TherapistFormProps {
  initial?: TherapistInput;
  submitLabel: string;
  onSubmit: (values: TherapistInput) => Promise<{ error?: string }>;
  onCancel?: () => void;
}

export function TherapistForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: TherapistFormProps) {
  const uid = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [specialtiesText, setSpecialtiesText] = useState(
    (initial?.specialties ?? []).join(", "),
  );
  const form = useForm<TherapistFormValues, unknown, TherapistInput>({
    resolver: zodResolver(therapistInputSchema),
    defaultValues: initial ?? {
      full_name: "",
      credentials: "",
      profession: "",
      specialties: [],
      bio: "",
    },
  });

  async function submit(values: TherapistInput) {
    setServerError(null);
    const specialties = specialtiesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const parsed = therapistInputSchema.safeParse({ ...values, specialties });
    if (!parsed.success) {
      setServerError(
        parsed.error.issues[0]?.message ?? "Please review the form.",
      );
      return;
    }
    const result = await onSubmit(parsed.data);
    if (result.error) setServerError(result.error);
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {serverError}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-name`}>Full name</Label>
          <Input id={`${uid}-name`} {...form.register("full_name")} />
          {form.formState.errors.full_name && (
            <p className="text-sm text-destructive">
              {form.formState.errors.full_name.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-credentials`}>
            Credentials (optional, e.g. OTRP)
          </Label>
          <Input
            id={`${uid}-credentials`}
            {...form.register("credentials")}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-profession`}>Profession</Label>
        <Input
          id={`${uid}-profession`}
          placeholder="e.g. Occupational Therapist"
          {...form.register("profession")}
        />
        {form.formState.errors.profession && (
          <p className="text-sm text-destructive">
            {form.formState.errors.profession.message}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-specialties`}>
          Specialties (comma-separated, up to 10)
        </Label>
        <Input
          id={`${uid}-specialties`}
          value={specialtiesText}
          onChange={(e) => setSpecialtiesText(e.target.value)}
          placeholder="e.g. Sensory integration, Fine motor skills"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${uid}-bio`}>Short bio (optional)</Label>
        <Textarea id={`${uid}-bio`} rows={4} {...form.register("bio")} />
        {form.formState.errors.bio && (
          <p className="text-sm text-destructive">
            {form.formState.errors.bio.message}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
