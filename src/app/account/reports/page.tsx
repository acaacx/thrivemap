import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/modules/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { REPORT_TYPE_LABELS } from "@/modules/reports/report-types";

export default async function ReportsPage() {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: reports } = await supabase
    .from("clinic_reports")
    .select(
      "id, report_type, details, status, resolution_note, created_at, clinics ( name, slug )",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-semibold">Your reports</h1>
      {(reports ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No reports yet. Use &ldquo;Report incorrect information&rdquo; on any
          clinic page when something looks wrong.
        </div>
      ) : (
        (reports ?? []).map((report) => (
          <Card key={report.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {REPORT_TYPE_LABELS[report.report_type] ?? report.report_type}
                  {report.clinics && (
                    <>
                      {" — "}
                      <Link
                        href={`/clinics/${report.clinics.slug}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {report.clinics.name}
                      </Link>
                    </>
                  )}
                </p>
                {report.details && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {report.details}
                  </p>
                )}
                {report.resolution_note && (
                  <p className="mt-2 text-sm">
                    Resolution: {report.resolution_note}
                  </p>
                )}
              </div>
              <Badge
                variant={report.status === "resolved" ? "default" : "secondary"}
              >
                {report.status.replaceAll("_", " ")}
              </Badge>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
