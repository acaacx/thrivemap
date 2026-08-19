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

// Native select on purpose — matches ImportTriggerCard's city picker, and is
// far less flaky than driving a Base UI listbox in Playwright.
const SELECT_CLASSES =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Sentinel select value meaning "don't change the assigned city". */
const KEEP_CURRENT_LOCATION = "";

export function ClinicIdentityForm({
  clinicId,
  initial,
  hasLocation,
  cities,
  currentLocationLabel,
}: {
  clinicId: string;
  initial: AdminClinicIdentityInput;
  hasLocation: boolean;
  cities: { id: string; city: string; province: string }[];
  currentLocationLabel: string | null;
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
  const [locationId, setLocationId] = useState(
    initial.locationId ?? KEEP_CURRENT_LOCATION,
  );

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
            ? "City and province are set separately below."
            : "This clinic has no location yet, so there is no address to edit."}
        </p>
        {form.formState.errors.address_line1?.message && (
          <p className="text-xs text-destructive" role="alert">
            {form.formState.errors.address_line1.message}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="admin-clinic-location">City &amp; province</Label>
        <select
          id="admin-clinic-location"
          className={SELECT_CLASSES}
          disabled={!hasLocation}
          value={locationId}
          onChange={(e) => {
            const value = e.target.value;
            setLocationId(value);
            form.setValue(
              "locationId",
              value === KEEP_CURRENT_LOCATION ? undefined : value,
              { shouldDirty: true },
            );
          }}
        >
          <option value={KEEP_CURRENT_LOCATION}>
            {currentLocationLabel
              ? `— keep current: ${currentLocationLabel} —`
              : "— keep current —"}
          </option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.city} — {city.province}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {hasLocation
            ? "The nearest seeded city is only a guess — correct it here if it's wrong."
            : "This clinic has no location yet, so there is no city to assign."}
        </p>
        {form.formState.errors.locationId?.message && (
          <p className="text-xs text-destructive" role="alert">
            {form.formState.errors.locationId.message}
          </p>
        )}
      </div>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        Save name, address &amp; city
      </Button>
    </form>
  );
}
