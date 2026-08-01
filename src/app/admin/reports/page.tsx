import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { resolveReport } from "@/modules/admin/actions";
import { ReviewActions } from "@/modules/admin/components/ReviewCard";
import { listReports } from "@/modules/admin/server";

const OPEN_STATUSES = ["open", "under_review"];

export default async function AdminReportsPage() {
  const reports = await listReports();
  const open = reports.filter((r) => OPEN_STATUSES.includes(r.status));
  const closed = reports.filter((r) => !OPEN_STATUSES.includes(r.status));

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Listing reports</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Problems flagged by visitors. Resolve after fixing the listing, or
        dismiss with a note.
      </p>

      {open.length === 0 ? (
        <p className="mt-8 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Queue is clear.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {open.map((report) => (
            <li key={report.id} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/clinics/${report.clinics?.slug}`}
                  className="font-heading text-lg font-semibold hover:underline"
                >
                  {report.clinics?.name ?? "Clinic"}
                </Link>
                <Badge variant="outline">{report.report_type.replaceAll("_", " ")}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(report.created_at).toLocaleString("en-PH")}
                </span>
              </div>
              {report.details && (
                <p className="mt-2 text-sm text-muted-foreground">{report.details}</p>
              )}
              <ReviewActions
                reasonLabel="Resolution note (required)"
                actions={[
                  {
                    label: "Resolve",
                    requiresReason: true,
                    run: resolveReport.bind(null, report.id, "resolved"),
                  },
                  {
                    label: "Dismiss",
                    variant: "destructive",
                    run: resolveReport.bind(null, report.id, "dismissed"),
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
            {closed.map((report) => (
              <li key={report.id} className="rounded-lg border bg-card px-4 py-2.5">
                <span className="font-medium">{report.clinics?.name ?? "Clinic"}</span>{" "}
                <Badge variant="outline" className="ml-1">
                  {report.status}
                </Badge>
                {report.resolution_note && (
                  <span className="ml-2 text-muted-foreground">{report.resolution_note}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
