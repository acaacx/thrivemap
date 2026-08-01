import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { approveClaim, rejectClaim, requestClaimInfo } from "@/modules/admin/actions";
import { ClaimDocumentList } from "@/modules/admin/components/ClaimDocumentList";
import { ReviewActions } from "@/modules/admin/components/ReviewCard";
import { getClaimDetail } from "@/modules/admin/server";

export default async function AdminClaimDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const { claimId } = await params;
  const claim = await getClaimDetail(claimId);
  if (!claim || !claim.clinics) notFound();

  const decidable = ["submitted", "under_review", "additional_information_required"].includes(
    claim.status,
  );

  return (
    <div>
      <nav className="text-sm text-muted-foreground">
        <Link className="hover:underline" href="/admin/claims">
          ← All claims
        </Link>
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-2xl font-semibold">
          Claim: {claim.clinics.name}
        </h1>
        <Badge variant="outline">{claim.status.replaceAll("_", " ")}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        <Link className="underline" href={`/clinics/${claim.clinics.slug}`}>
          View public listing
        </Link>{" "}
        · Listing status: {claim.clinics.status.replaceAll("_", " ")}
      </p>

      <dl className="mt-6 grid gap-3 rounded-2xl border bg-card p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Claimant</dt>
          <dd className="font-medium">{claim.full_name || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Work email</dt>
          <dd>{claim.work_email || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Mobile</dt>
          <dd>{claim.mobile_number || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Job title</dt>
          <dd>{claim.job_title || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Relationship</dt>
          <dd>{claim.relationship || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Business registration</dt>
          <dd>{claim.business_registration_info || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Consent given</dt>
          <dd>{claim.consent_given ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Submitted</dt>
          <dd>{new Date(claim.created_at).toLocaleString("en-PH")}</dd>
        </div>
      </dl>

      <section className="mt-6">
        <h2 className="font-heading text-lg font-semibold">Verification documents</h2>
        <div className="mt-3">
          <ClaimDocumentList documents={claim.clinic_claim_documents} />
        </div>
      </section>

      {claim.additional_info_request && (
        <p className="mt-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
          <span className="font-medium">Info requested:</span>{" "}
          {claim.additional_info_request}
        </p>
      )}
      {claim.decision_reason && (
        <p className="mt-6 rounded-xl border bg-card p-4 text-sm">
          <span className="font-medium">Decision reason:</span> {claim.decision_reason}
        </p>
      )}

      {decidable && (
        <div className="mt-6 rounded-2xl border bg-card p-5">
          <h2 className="font-heading text-lg font-semibold">Decision</h2>
          <ReviewActions
            actions={[
              { label: "Approve claim", run: approveClaim.bind(null, claim.id) },
              {
                label: "Request info",
                variant: "outline",
                requiresReason: true,
                run: requestClaimInfo.bind(null, claim.id),
              },
              {
                label: "Reject",
                variant: "destructive",
                run: rejectClaim.bind(null, claim.id),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
