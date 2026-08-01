"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { updateClinicHours } from "../actions";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface HourRow {
  day_of_week: number;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
}

interface PortalHoursFormProps {
  clinicId: string;
  directEdit: boolean;
  initial: HourRow[];
}

/** hh:mm[:ss] → hh:mm for <input type="time">. */
function toTimeInput(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

export function PortalHoursForm({ clinicId, directEdit, initial }: PortalHoursFormProps) {
  const [rows, setRows] = useState<HourRow[]>(() =>
    DAYS.map((_, day) => {
      const existing = initial.find((row) => row.day_of_week === day);
      return {
        day_of_week: day,
        is_closed: existing ? existing.is_closed : true,
        opens_at: toTimeInput(existing?.opens_at ?? null) || null,
        closes_at: toTimeInput(existing?.closes_at ?? null) || null,
      };
    }),
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function patchRow(day: number, patch: Partial<HourRow>) {
    setRows((current) =>
      current.map((row) => (row.day_of_week === day ? { ...row, ...patch } : row)),
    );
  }

  async function onSave() {
    setFeedback(null);
    setBusy(true);
    try {
      const result = await updateClinicHours(clinicId, { hours: rows });
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
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">Day</th>
              <th scope="col" className="px-4 py-3 font-medium">Open</th>
              <th scope="col" className="px-4 py-3 font-medium">Opens</th>
              <th scope="col" className="px-4 py-3 font-medium">Closes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day_of_week} className="border-b last:border-0">
                <th scope="row" className="px-4 py-2.5 text-left font-medium">
                  {DAYS[row.day_of_week]}
                </th>
                <td className="px-4 py-2.5">
                  <Checkbox
                    checked={!row.is_closed}
                    onCheckedChange={(checked) =>
                      patchRow(row.day_of_week, {
                        is_closed: checked !== true,
                        opens_at: checked === true ? (row.opens_at ?? "09:00") : row.opens_at,
                        closes_at: checked === true ? (row.closes_at ?? "17:00") : row.closes_at,
                      })
                    }
                    aria-label={`Open on ${DAYS[row.day_of_week]}`}
                  />
                </td>
                <td className="px-4 py-2.5">
                  <Input
                    type="time"
                    value={row.opens_at ?? ""}
                    disabled={row.is_closed}
                    onChange={(e) =>
                      patchRow(row.day_of_week, { opens_at: e.target.value || null })
                    }
                    aria-label={`${DAYS[row.day_of_week]} opening time`}
                    className="w-32"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <Input
                    type="time"
                    value={row.closes_at ?? ""}
                    disabled={row.is_closed}
                    onChange={(e) =>
                      patchRow(row.day_of_week, { closes_at: e.target.value || null })
                    }
                    aria-label={`${DAYS[row.day_of_week]} closing time`}
                    className="w-32"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button className="rounded-full" disabled={busy} onClick={onSave}>
          {busy && <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />}
          {directEdit ? "Publish changes" : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}
