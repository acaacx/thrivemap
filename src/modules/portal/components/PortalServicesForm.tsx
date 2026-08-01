"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { updateClinicServices } from "../actions";

interface PortalServicesFormProps {
  clinicId: string;
  directEdit: boolean;
  services: { id: string; name: string; short_description: string | null }[];
  selectedIds: string[];
}

export function PortalServicesForm({
  clinicId,
  directEdit,
  services,
  selectedIds,
}: PortalServicesFormProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSave() {
    setFeedback(null);
    setBusy(true);
    try {
      const result = await updateClinicServices(clinicId, {
        service_ids: [...selected],
      });
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
    <div className="space-y-5">
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
      <ul className="grid gap-3 sm:grid-cols-2">
        {services.map((service) => (
          <li key={service.id}>
            <label className="flex h-full cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 text-sm hover:border-primary/40">
              <Checkbox
                checked={selected.has(service.id)}
                onCheckedChange={() => toggle(service.id)}
                aria-label={service.name}
              />
              <span>
                <span className="font-medium">{service.name}</span>
                {service.short_description && (
                  <span className="mt-0.5 block text-muted-foreground">
                    {service.short_description}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button
          className="rounded-full"
          disabled={busy || selected.size === 0}
          onClick={onSave}
        >
          {busy && (
            <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
          )}
          {directEdit ? "Publish changes" : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}
