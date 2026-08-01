"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VerificationBadge } from "@/modules/clinics/components/VerificationBadge";
import { LocationSearchBox } from "@/modules/search/components/LocationSearchBox";
import {
  findLikelyDuplicates,
  submitClinic,
  type DuplicateMatch,
} from "../actions";
import { suggestClinicSchema, type SuggestClinicInput } from "../schemas";

const ClinicMap = dynamic(
  () => import("@/modules/maps/components/ClinicMap").then((m) => m.ClinicMap),
  { ssr: false },
);

interface SuggestClinicFormProps {
  services: { slug: string; name: string }[];
  defaultEmail?: string;
}

export function SuggestClinicForm({
  services,
  defaultEmail,
}: SuggestClinicFormProps) {
  const form = useForm<SuggestClinicInput>({
    resolver: zodResolver(suggestClinicSchema),
    defaultValues: {
      clinic_name: "",
      address: "",
      service_slugs: [],
      submitter_email: defaultEmail ?? "",
      consent: undefined as unknown as true,
    },
  });

  const [pin, setPin] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [mapCenter, setMapCenter] = useState({
    latitude: 14.5995,
    longitude: 120.9842,
  });
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [phase, setPhase] = useState<"form" | "review" | "done">("form");
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setPinAndSync(location: { latitude: number; longitude: number }) {
    setPin(location);
    form.setValue("latitude", location.latitude);
    form.setValue("longitude", location.longitude);
  }

  async function onCheckAndReview(values: SuggestClinicInput) {
    setServerError(null);
    setSubmitting(true);
    try {
      const matches = await findLikelyDuplicates({
        name: values.clinic_name,
        latitude: values.latitude,
        longitude: values.longitude,
      });
      setDuplicates(matches);
      setPhase("review");
    } finally {
      setSubmitting(false);
    }
  }

  async function onFinalSubmit() {
    setServerError(null);
    setSubmitting(true);
    try {
      const result = await submitClinic(form.getValues());
      if (result.error) {
        setServerError(result.error);
        setPhase("form");
      } else {
        setSuccessMessage(result.message ?? "Submitted.");
        setPhase("done");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "done") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-[var(--verified)]/40 bg-[var(--verified)]/10 p-8 text-center"
      >
        <p className="font-heading text-xl font-semibold">
          Suggestion received
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{successMessage}</p>
        <Button className="mt-6 rounded-full" render={<Link href="/clinics" />}>
          Back to search
        </Button>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-heading text-xl font-semibold">
            {duplicates && duplicates.length > 0
              ? "Is it one of these?"
              : "Ready to submit"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {duplicates && duplicates.length > 0
              ? "We found similar listings. If your clinic is already here, no new suggestion is needed — you can report corrections on its page instead."
              : "No similar listings found. Review your details below and submit."}
          </p>
        </div>

        {duplicates && duplicates.length > 0 && (
          <ul className="space-y-2">
            {duplicates.map((match) => (
              <li
                key={match.slug}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4"
              >
                <div>
                  <Link
                    href={`/clinics/${match.slug}`}
                    target="_blank"
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {match.name}
                  </Link>
                  {match.city && (
                    <span className="ml-2 text-sm text-muted-foreground">
                      {match.city}
                    </span>
                  )}
                </div>
                <VerificationBadge status={match.status} />
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-xl border bg-secondary/40 p-4 text-sm">
          <p className="font-medium">{form.getValues("clinic_name")}</p>
          <p className="text-muted-foreground">{form.getValues("address")}</p>
        </div>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={onFinalSubmit}
            disabled={submitting}
            className="rounded-full"
          >
            {submitting && (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            )}
            {duplicates && duplicates.length > 0
              ? "It's not listed — submit my suggestion"
              : "Submit suggestion"}
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => setPhase("form")}
          >
            Back to edit
          </Button>
        </div>
      </div>
    );
  }

  const errors = form.formState.errors;

  return (
    <form
      onSubmit={form.handleSubmit(onCheckAndReview)}
      className="space-y-6"
      noValidate
    >
      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="clinic_name">Clinic name *</Label>
        <Input
          id="clinic_name"
          {...form.register("clinic_name")}
          aria-invalid={!!errors.clinic_name}
        />
        {errors.clinic_name && (
          <p className="text-sm text-destructive">
            {errors.clinic_name.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address">Full address *</Label>
        <Input
          id="address"
          placeholder="Unit/Building, Street, Barangay, City, Province"
          {...form.register("address")}
          aria-invalid={!!errors.address}
        />
        {errors.address && (
          <p className="text-sm text-destructive">{errors.address.message}</p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Map pin (optional but helpful)
        </legend>
        <p className="text-xs text-muted-foreground">
          Search a nearby area, then click the map to place the pin on the
          clinic.
        </p>
        <LocationSearchBox onLocation={(loc) => setMapCenter(loc)} />
        <div className="h-64 overflow-hidden rounded-xl border">
          <ClinicMap
            markers={
              pin
                ? [
                    {
                      id: "pin",
                      slug: "",
                      name: "Clinic location",
                      verified: false,
                      ...pin,
                    },
                  ]
                : []
            }
            center={pin ?? mapCenter}
            zoom={pin ? 16 : 12}
            onMapClick={setPinAndSync}
            className="h-full w-full"
          />
        </div>
        {pin && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden />
            Pin set at {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
            <button
              type="button"
              className="ml-2 underline underline-offset-2"
              onClick={() => {
                setPin(null);
                form.setValue("latitude", undefined);
                form.setValue("longitude", undefined);
              }}
            >
              Clear
            </button>
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            {...form.register("phone")}
            aria-invalid={!!errors.phone}
          />
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Clinic email</Label>
          <Input
            id="email"
            type="email"
            {...form.register("email")}
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            type="url"
            placeholder="https://…"
            {...form.register("website")}
            aria-invalid={!!errors.website}
          />
          {errors.website && (
            <p className="text-sm text-destructive">{errors.website.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="social_media_url">Facebook or social page</Label>
          <Input
            id="social_media_url"
            type="url"
            placeholder="https://…"
            {...form.register("social_media_url")}
            aria-invalid={!!errors.social_media_url}
          />
          {errors.social_media_url && (
            <p className="text-sm text-destructive">
              {errors.social_media_url.message}
            </p>
          )}
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          Services offered (if known)
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((service) => (
            <div key={service.slug} className="flex items-center gap-2">
              <Checkbox
                id={`suggest-svc-${service.slug}`}
                checked={form.watch("service_slugs").includes(service.slug)}
                onCheckedChange={(checked) => {
                  const current = form.getValues("service_slugs");
                  form.setValue(
                    "service_slugs",
                    checked
                      ? [...current, service.slug]
                      : current.filter((s) => s !== service.slug),
                  );
                }}
              />
              <Label
                htmlFor={`suggest-svc-${service.slug}`}
                className="font-normal"
              >
                {service.name}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes for our moderators</Label>
        <Textarea
          id="notes"
          rows={3}
          placeholder="Anything that helps us verify — how you know the clinic, landmarks, schedules…"
          {...form.register("notes")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reference_links">Reference links</Label>
        <Input
          id="reference_links"
          placeholder="Links that show the clinic exists (website, Facebook, news) — separate with spaces"
          {...form.register("reference_links")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="submitter_email">Your email (for updates)</Label>
        <Input
          id="submitter_email"
          type="email"
          {...form.register("submitter_email")}
          aria-invalid={!!errors.submitter_email}
        />
        {errors.submitter_email && (
          <p className="text-sm text-destructive">
            {errors.submitter_email.message}
          </p>
        )}
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="consent"
          checked={form.watch("consent") === true}
          onCheckedChange={(checked) =>
            form.setValue("consent", (checked === true) as true, {
              shouldValidate: true,
            })
          }
          aria-describedby="consent-error"
        />
        <Label htmlFor="consent" className="font-normal leading-snug">
          The information I&apos;m sharing is accurate to the best of my
          knowledge, and I understand it will be reviewed before publication.
        </Label>
      </div>
      {errors.consent && (
        <p id="consent-error" className="text-sm text-destructive">
          {errors.consent.message}
        </p>
      )}

      <Button type="submit" className="rounded-full" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Check for duplicates &amp; review
      </Button>
    </form>
  );
}
