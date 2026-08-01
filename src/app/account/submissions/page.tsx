import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/modules/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  additional_information_required: "More info needed",
  approved: "Approved",
  rejected: "Not approved",
};

export default async function SubmissionsPage() {
  await requireUser();
  const supabase = await createSupabaseServerClient();

  const [{ data: submissions }, { data: changeRequests }] = await Promise.all([
    supabase
      .from("clinic_submissions")
      .select("id, clinic_name, address, status, created_at, review_reason, created_clinic_id")
      .order("created_at", { ascending: false }),
    supabase
      .from("clinic_change_requests")
      .select("id, status, message, created_at, review_reason, clinics ( name, slug )")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="font-heading text-2xl font-semibold">Clinic suggestions</h1>
        {(submissions ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            <p>No suggestions yet.</p>
            <p className="mt-1">
              Know a clinic we&apos;re missing?{" "}
              <Link href="/suggest-clinic" className="underline underline-offset-4">
                Suggest it
              </Link>
            </p>
          </div>
        ) : (
          (submissions ?? []).map((submission) => (
            <Card key={submission.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{submission.clinic_name}</p>
                  <p className="text-sm text-muted-foreground">{submission.address}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sent{" "}
                    {new Date(submission.created_at).toLocaleDateString("en-PH", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  {submission.review_reason && (
                    <p className="mt-2 text-sm">{submission.review_reason}</p>
                  )}
                </div>
                <Badge variant={submission.status === "approved" ? "default" : "secondary"}>
                  {STATUS_LABELS[submission.status] ?? submission.status}
                </Badge>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold">Correction requests</h2>
        {(changeRequests ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No correction requests yet.</p>
        ) : (
          (changeRequests ?? []).map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    {request.clinics ? (
                      <Link
                        href={`/clinics/${request.clinics.slug}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {request.clinics.name}
                      </Link>
                    ) : (
                      "Clinic"
                    )}
                  </p>
                  {request.message && (
                    <p className="text-sm text-muted-foreground">{request.message}</p>
                  )}
                  {request.review_reason && (
                    <p className="mt-2 text-sm">{request.review_reason}</p>
                  )}
                </div>
                <Badge variant="secondary">
                  {STATUS_LABELS[request.status] ?? request.status.replaceAll("_", " ")}
                </Badge>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
