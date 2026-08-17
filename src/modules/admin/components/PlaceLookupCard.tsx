"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addPlaceCandidateAction,
  lookupPlacesByNameAction,
  type PlaceLookupHit,
} from "../actions";

/**
 * By-name Places lookup for centers the admin already knows. Runs
 * synchronously (no job) and writes nothing until a hit is added.
 */
export function PlaceLookupCard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [hits, setHits] = useState<PlaceLookupHit[] | null>(null);
  const [query, setQuery] = useState("");
  const [searching, startSearch] = useTransition();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [adding, startAdd] = useTransition();

  function onSearch(event: React.FormEvent) {
    event.preventDefault();
    startSearch(async () => {
      const result = await lookupPlacesByNameAction(name, city || undefined);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setHits(result.hits);
      setQuery(result.query);
    });
  }

  function onAdd(hit: PlaceLookupHit) {
    setAddingId(hit.externalId);
    startAdd(async () => {
      const result = await addPlaceCandidateAction(hit);
      setAddingId(null);
      if (result.error) toast.error(result.error);
      else {
        toast.success(result.message ?? "Candidate added.");
        setHits((prev) =>
          prev
            ? prev.map((h) =>
                h.externalId === hit.externalId
                  ? { ...h, alreadyCandidate: true }
                  : h,
              )
            : prev,
        );
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-6 rounded-2xl border bg-card p-5">
      <h2 className="font-heading text-lg font-semibold">
        Look up a center by name
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Already know a center? Search Google Places for it directly and add the
        right hit as a candidate — no import job, nothing written until you
        click Add.
      </p>
      <form
        onSubmit={onSearch}
        className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="lookup-name">Center name</Label>
          <Input
            id="lookup-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bright Steps Therapy Center"
            maxLength={80}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lookup-city">City (optional)</Label>
          <Input
            id="lookup-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Quezon City"
            maxLength={60}
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={searching || name.trim().length < 2}>
          {searching ? "Searching…" : "Search"}
        </Button>
      </form>

      {hits && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">
            {hits.length === 0
              ? `No places found for “${query}”.`
              : `${hits.length} result${hits.length === 1 ? "" : "s"} for “${query}”`}
          </p>
          {hits.length > 0 && (
            <ul className="mt-2 divide-y rounded-lg border">
              {hits.map((hit) => (
                <li
                  key={hit.externalId}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{hit.name}</p>
                    {hit.address && (
                      <p className="text-xs text-muted-foreground">
                        {hit.address}
                      </p>
                    )}
                  </div>
                  {hit.alreadyCandidate ? (
                    <Badge variant="outline">Already a candidate</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAdd(hit)}
                      disabled={adding && addingId === hit.externalId}
                    >
                      {adding && addingId === hit.externalId
                        ? "Adding…"
                        : "Add as candidate"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
