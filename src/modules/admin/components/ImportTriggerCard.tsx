"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { triggerCandidateImportAction } from "../actions";
import { OTHER_IMPORT_CITY } from "../schemas";

// Native selects on purpose: the municipality list is long and Playwright's
// selectOption is far less flaky than driving a Base UI listbox.
const SELECT_CLASSES =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ImportTriggerCard({
  terms,
  cities,
}: {
  terms: readonly { slug: string; label: string }[];
  cities: { id: string; city: string; province: string }[];
}) {
  const router = useRouter();
  const [termSlug, setTermSlug] = useState(terms[0]?.slug ?? "");
  const [locationId, setLocationId] = useState(cities[0]?.id ?? "");
  const [cityText, setCityText] = useState("");
  const [pending, startTransition] = useTransition();
  const isOther = locationId === OTHER_IMPORT_CITY;

  function onQueue() {
    startTransition(async () => {
      const result = await triggerCandidateImportAction(
        termSlug,
        locationId,
        isOther ? cityText : undefined,
      );
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.message ?? "Import queued.");
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-6 rounded-2xl border bg-card p-5">
      <h2 className="font-heading text-lg font-semibold">Run an import</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Queues a Google Places search for one service in one city. Results land
        here for review — nothing publishes automatically.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="import-term">Service</Label>
          <select
            id="import-term"
            className={SELECT_CLASSES}
            value={termSlug}
            onChange={(e) => setTermSlug(e.target.value)}
          >
            {terms.map((term) => (
              <option key={term.slug} value={term.slug}>
                {term.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="import-city">City</Label>
          <select
            id="import-city"
            className={SELECT_CLASSES}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.city} — {city.province}
              </option>
            ))}
            <option value={OTHER_IMPORT_CITY}>Other city (type it in)…</option>
          </select>
        </div>
        <Button
          onClick={onQueue}
          disabled={pending || !locationId || (isOther && !cityText.trim())}
        >
          {pending ? "Queueing…" : "Queue import"}
        </Button>
      </div>
      {isOther && (
        <div className="mt-4 grid gap-1.5 sm:max-w-sm">
          <Label htmlFor="import-city-text">City name</Label>
          <Input
            id="import-city-text"
            value={cityText}
            onChange={(e) => setCityText(e.target.value)}
            placeholder="e.g. Iloilo City"
            maxLength={60}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Letters only. Sent as “&lt;service&gt; in &lt;city&gt;,
            Philippines”.
          </p>
        </div>
      )}
    </section>
  );
}
