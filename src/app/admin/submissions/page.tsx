import { Badge } from "@/components/ui/badge";
import {
  approveSubmission,
  rejectSubmission,
  requestSubmissionInfo,
} from "@/modules/admin/actions";
import { ReviewActions } from "@/modules/admin/components/ReviewCard";
import { listSubmissions } from "@/modules/admin/server";

const OPEN_STATUSES = [
  "submitted",
  "under_review",
  "additional_information_required",
];

export default async function AdminSubmissionsPage() {
  const submissions = await listSubmissions();
  const open = submissions.filter((s) => OPEN_STATUSES.includes(s.status));
  const closed = submissions.filter((s) => !OPEN_STATUSES.includes(s.status));

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">
        Clinic submissions
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Approving publishes the clinic as an unverified listing and runs a
        duplicate scan.
      </p>

      {open.length === 0 ? (
        <p className="mt-8 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Queue is clear.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {open.map((submission) => (
            <li key={submission.id} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-lg font-semibold">
                  {submission.clinic_name}
                </p>
                <Badge variant="outline">
                  {submission.status.replaceAll("_", " ")}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(submission.created_at).toLocaleString("en-PH")}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Address</dt>
                  <dd>{submission.address}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Map pin</dt>
                  <dd>
                    {submission.latitude != null
                      ? `${submission.latitude.toFixed(5)}, ${submission.longitude?.toFixed(5)}`
                      : "None — request info before approving"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd>
                    {[submission.phone, submission.email, submission.website]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Services</dt>
                  <dd>{submission.service_slugs.join(", ") || "—"}</dd>
                </div>
                {submission.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Notes</dt>
                    <dd>{submission.notes}</dd>
                  </div>
                )}
              </dl>
              <ReviewActions
                actions={[
                  {
                    label: "Approve & publish",
                    run: approveSubmission.bind(null, submission.id),
                  },
                  {
                    label: "Request info",
                    variant: "outline",
                    requiresReason: true,
                    run: requestSubmissionInfo.bind(null, submission.id),
                  },
                  {
                    label: "Reject",
                    variant: "destructive",
                    run: rejectSubmission.bind(null, submission.id),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Decided ({closed.length})
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {closed.map((submission) => (
              <li
                key={submission.id}
                className="rounded-lg border bg-card px-4 py-2.5"
              >
                <span className="font-medium">{submission.clinic_name}</span>{" "}
                <Badge variant="outline" className="ml-1">
                  {submission.status}
                </Badge>
                {submission.review_reason && (
                  <span className="ml-2 text-muted-foreground">
                    {submission.review_reason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
