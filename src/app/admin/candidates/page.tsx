import { Badge } from "@/components/ui/badge";
import {
  attachCandidateAction,
  discardCandidate,
  promoteCandidateAction,
} from "@/modules/admin/actions";
import { ImportTriggerCard } from "@/modules/admin/components/ImportTriggerCard";
import { PlaceLookupCard } from "@/modules/admin/components/PlaceLookupCard";
import { ReviewActions } from "@/modules/admin/components/ReviewCard";
import {
  listCandidateMatches,
  listCandidates,
  listImportCities,
  listRecentImportJobs,
} from "@/modules/admin/server";
import { IMPORT_SERVICE_TERMS } from "@/modules/imports/query";

export default async function AdminCandidatesPage() {
  const [candidates, cities, recentJobs] = await Promise.all([
    listCandidates(),
    listImportCities(),
    listRecentImportJobs(),
  ]);
  const open = candidates.filter((c) =>
    ["new", "under_review"].includes(c.status),
  );
  const matches = await listCandidateMatches(open.map((c) => c.id));

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">
        External candidates
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Places found by imports. Promote a candidate into a draft listing,
        attach it to a clinic we already have, or discard noise. Nothing here is
        public until a draft is reviewed and published.
      </p>

      <PlaceLookupCard />

      <ImportTriggerCard terms={IMPORT_SERVICE_TERMS} cities={cities} />

      {recentJobs.length > 0 && (
        <section className="mt-4 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Recent imports</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {recentJobs.map((job) => {
              const query =
                job.payload &&
                typeof job.payload === "object" &&
                "query" in job.payload
                  ? String((job.payload as { query?: unknown }).query ?? "")
                  : "";
              return (
                <li key={job.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{job.status}</Badge>
                  <span>{query || "(no query)"}</span>
                  {job.last_error && (
                    <span className="text-destructive">{job.last_error}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {open.length === 0 ? (
        <p className="mt-8 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No candidates waiting. Look up a center by name or queue an import
          above to fill this list.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {open.map((candidate) => {
            const candidateMatches = matches[candidate.id] ?? [];
            return (
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
                {candidateMatches.length > 0 && (
                  <div className="mt-3 rounded-lg border border-dashed p-3">
                    <p className="text-sm font-medium">Possible matches</p>
                    <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                      {candidateMatches.map((match) => (
                        <li
                          key={match.clinic_id}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <a
                            className="underline underline-offset-2"
                            href={`/clinics/${match.clinic_slug}`}
                          >
                            {match.clinic_name}
                          </a>
                          {match.same_place_id && (
                            <Badge variant="outline">same place id</Badge>
                          )}
                          <span>
                            {Math.round(match.name_similarity * 100)}% name
                          </span>
                          {match.distance_m !== null && (
                            <span>{Math.round(match.distance_m)} m away</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ReviewActions
                  actions={[
                    {
                      label: "Promote",
                      run: promoteCandidateAction.bind(null, candidate.id),
                    },
                    ...candidateMatches.map((match) => ({
                      label: `Attach to ${match.clinic_name}`,
                      variant: "outline" as const,
                      run: attachCandidateAction.bind(
                        null,
                        candidate.id,
                        match.clinic_id,
                      ),
                    })),
                    {
                      label: "Discard",
                      variant: "destructive" as const,
                      run: discardCandidate.bind(null, candidate.id),
                    },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
