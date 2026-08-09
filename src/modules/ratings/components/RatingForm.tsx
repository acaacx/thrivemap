"use client";

import { useId, useState, useTransition } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteRating, upsertRating } from "../actions";
import { ratingInputSchema, type RatingInput } from "../schemas";
import type { OwnRating } from "../queries";

const DIMENSIONS: Array<{ name: keyof RatingInput; legend: string }> = [
  { name: "communication", legend: "Communication & responsiveness" },
  { name: "sensoryFriendliness", legend: "Sensory-friendliness" },
  { name: "affirmingApproach", legend: "Neurodiversity-affirming approach" },
  { name: "scheduling", legend: "Scheduling & waiting time" },
];

const EMPTY_VALUES = {
  communication: undefined,
  sensoryFriendliness: undefined,
  affirmingApproach: undefined,
  scheduling: undefined,
} as unknown as RatingInput;

interface RatingFormProps {
  clinicId: string;
  slug: string;
  own: OwnRating | null;
}

export function RatingForm({ clinicId, slug, own }: RatingFormProps) {
  const uid = useId();
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [removePending, startRemove] = useTransition();

  const form = useForm<RatingInput>({
    // react-hook-form marks a radio "checked" on mount by strictly
    // comparing defaultValues against the DOM input's `.value`, which is
    // always a string — so numeric defaults (own.communication is a
    // number from the DB) never match and the form renders with nothing
    // selected. Stringify to match, same cast EMPTY_VALUES already uses
    // for its placeholder `undefined`s.
    defaultValues:
      own && !own.voided
        ? ({
            communication: String(own.communication),
            sensoryFriendliness: String(own.sensoryFriendliness),
            affirmingApproach: String(own.affirmingApproach),
            scheduling: String(own.scheduling),
          } as unknown as RatingInput)
        : EMPTY_VALUES,
  });

  // Voided rows are frozen at the RLS layer (update is rejected once
  // voided_at is set), so the form must never let a submit reach the
  // server for this state — render read-only and stop here.
  if (own?.voided) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <p className="text-sm font-medium text-muted-foreground">
          This rating was removed by moderators.
        </p>
        <div className="space-y-4 opacity-60">
          {DIMENSIONS.map(({ name, legend }) => (
            <StarFieldset
              key={name}
              uid={uid}
              name={name}
              legend={legend}
              disabled
              checkedValue={own[name]}
            />
          ))}
        </div>
      </div>
    );
  }

  async function submit(raw: RatingInput) {
    setFeedback(null);
    // Native radio groups always report string values regardless of the
    // declared RatingInput type, so re-parse through the schema (mirrors
    // the server-side validation in upsertRating) rather than trusting TS.
    const parsed = ratingInputSchema.safeParse({
      communication: Number(raw.communication),
      sensoryFriendliness: Number(raw.sensoryFriendliness),
      affirmingApproach: Number(raw.affirmingApproach),
      scheduling: Number(raw.scheduling),
    });
    if (!parsed.success) {
      setFeedback({
        kind: "error",
        text: "Please rate all four areas from 1 to 5.",
      });
      return;
    }
    const result = await upsertRating(clinicId, slug, parsed.data);
    setFeedback(
      result.error
        ? { kind: "error", text: result.error }
        : { kind: "ok", text: result.message ?? "Rating saved." },
    );
  }

  function remove() {
    setFeedback(null);
    startRemove(async () => {
      const result = await deleteRating(clinicId, slug);
      if (result.error) {
        setFeedback({ kind: "error", text: result.error });
        return;
      }
      setFeedback({ kind: "ok", text: result.message ?? "Rating removed." });
      form.reset(EMPTY_VALUES);
    });
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-5" noValidate>
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
      <div className="space-y-4">
        {DIMENSIONS.map(({ name, legend }) => (
          <StarFieldset
            key={name}
            uid={uid}
            name={name}
            legend={legend}
            register={form.register}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          className="rounded-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && (
            <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
          )}
          {own ? "Update rating" : "Save rating"}
        </Button>
        {own && (
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            disabled={removePending}
            onClick={remove}
          >
            {removePending && (
              <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
            )}
            Remove my rating
          </Button>
        )}
      </div>
    </form>
  );
}

function StarFieldset({
  uid,
  name,
  legend,
  register,
  disabled,
  checkedValue,
}: {
  uid: string;
  name: keyof RatingInput;
  legend: string;
  register?: UseFormRegister<RatingInput>;
  disabled?: boolean;
  checkedValue?: number;
}) {
  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const id = `${uid}-${name}-${n}`;
          return (
            <span key={n}>
              <input
                type="radio"
                id={id}
                value={n}
                aria-label={`${n} stars`}
                className="peer sr-only"
                {...(register
                  ? register(name)
                  : { name, defaultChecked: checkedValue === n, disabled })}
              />
              <label
                htmlFor={id}
                className="grid size-9 cursor-pointer place-items-center rounded-lg border text-sm font-medium text-muted-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed"
              >
                {n}
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}
