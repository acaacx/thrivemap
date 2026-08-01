import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  mergeDuplicatePair,
  resolveDuplicateCandidate,
} from "@/modules/admin/actions";
import { ReviewActions } from "@/modules/admin/components/ReviewCard";
import { ScanButton } from "@/modules/admin/components/ScanButton";
import { listDuplicates } from "@/modules/admin/server";

export default async function AdminDuplicatesPage() {
  const candidates = await listDuplicates();
  const pending = candidates.filter((c) => c.status === "pending");
  const resolved = candidates.filter((c) => c.status !== "pending");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-2xl font-semibold">
          Duplicate candidates
        </h1>
        <div className="ml-auto">
          <ScanButton />
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Pairs flagged by the detection job. Merging keeps one listing, moves
        favorites/claims/reports across, and archives the other — always manual,
        always audited.
      </p>

      {pending.length === 0 ? (
        <p className="mt-8 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No pending pairs. Run a scan to re-check the directory.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {pending.map((candidate) => {
            const fields = (candidate.matching_fields ?? {}) as Record<
              string,
              unknown
            >;
            return (
              <li key={candidate.id} className="rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    {(Number(candidate.similarity_score) * 100).toFixed(0)}%
                    match
                  </Badge>
                  {fields.same_phone === true && (
                    <Badge variant="outline">same phone</Badge>
                  )}
                  {fields.same_website_domain === true && (
                    <Badge variant="outline">same website</Badge>
                  )}
                  {typeof fields.distance_m === "number" && (
                    <Badge variant="outline">
                      {Math.round(fields.distance_m)} m apart
                    </Badge>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["A", candidate.clinic_a],
                      ["B", candidate.clinic_b],
                    ] as const
                  ).map(([side, clinic]) => (
                    <div
                      key={side}
                      className="rounded-xl border bg-background p-4"
                    >
                      <p className="text-xs font-medium text-muted-foreground">
                        Listing {side}
                      </p>
                      <Link
                        href={`/clinics/${clinic?.slug}`}
                        className="mt-1 block font-heading text-lg font-semibold hover:underline"
                      >
                        {clinic?.name ?? "Missing clinic"}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {clinic?.status.replaceAll("_", " ")}
                      </p>
                    </div>
                  ))}
                </div>
                <ReviewActions
                  reasonLabel="Merge reason (required for merges)"
                  actions={[
                    {
                      label: "Keep A, merge B into it",
                      requiresReason: true,
                      run: mergeDuplicatePair.bind(null, candidate.id, "a"),
                    },
                    {
                      label: "Keep B, merge A into it",
                      requiresReason: true,
                      run: mergeDuplicatePair.bind(null, candidate.id, "b"),
                    },
                    {
                      label: "Not a duplicate",
                      variant: "outline",
                      run: resolveDuplicateCandidate.bind(
                        null,
                        candidate.id,
                        "not_duplicate",
                      ),
                    },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}

      {resolved.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Resolved ({resolved.length})
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {resolved.map((candidate) => (
              <li
                key={candidate.id}
                className="rounded-lg border bg-card px-4 py-2.5"
              >
                <span className="font-medium">
                  {candidate.clinic_a?.name} ↔ {candidate.clinic_b?.name}
                </span>{" "}
                <Badge variant="outline" className="ml-1">
                  {candidate.status.replaceAll("_", " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
