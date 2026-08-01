import { Badge } from "@/components/ui/badge";
import { discardCandidate } from "@/modules/admin/actions";
import { ReviewActions } from "@/modules/admin/components/ReviewCard";
import { listCandidates } from "@/modules/admin/server";

export default async function AdminCandidatesPage() {
  const candidates = await listCandidates();
  const open = candidates.filter((c) =>
    ["new", "under_review"].includes(c.status),
  );

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">
        External candidates
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Places found by external imports. The Google Nearby import job ships in
        a later stage — promotion to a listing happens there; until then you can
        discard noise.
      </p>

      {open.length === 0 ? (
        <p className="mt-8 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No candidates waiting. Imports are not yet enabled — this queue fills
          once the external import job is configured.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {open.map((candidate) => (
            <li key={candidate.id} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-lg font-semibold">
                  {candidate.normalized_name ?? "Unnamed place"}
                </p>
                <Badge variant="outline">{candidate.provider}</Badge>
                <Badge variant="outline">
                  {candidate.status.replaceAll("_", " ")}
                </Badge>
              </div>
              {candidate.normalized_address && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {candidate.normalized_address}
                </p>
              )}
              <ReviewActions
                actions={[
                  {
                    label: "Discard",
                    variant: "destructive",
                    run: discardCandidate.bind(null, candidate.id),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
