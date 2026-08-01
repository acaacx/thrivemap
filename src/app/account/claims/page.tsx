import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/modules/auth/server";
import { getOwnClaims } from "@/modules/claims/queries";

export const metadata: Metadata = {
  title: "Your claims",
  robots: { index: false },
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  additional_information_required: "Needs more info",
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Revoked",
};

export default async function AccountClaimsPage() {
  const user = await requireUser();
  const claims = await getOwnClaims(user.id);

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Your claims</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Clinic listings you&apos;ve claimed as a representative.
      </p>
      {claims.length === 0 ? (
        <p className="mt-8 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No claims yet. Find your clinic in the{" "}
          <Link className="underline" href="/clinics">
            directory
          </Link>{" "}
          and choose “Claim this clinic” on its page.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {claims.map((claim) => (
            <li key={claim.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/clinics/${claim.clinics?.slug}/claim`}
                  className="font-medium hover:underline"
                >
                  {claim.clinics?.name ?? "Clinic"}
                </Link>
                <Badge variant="outline">
                  {STATUS_LABELS[claim.status] ?? claim.status}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(claim.created_at).toLocaleDateString("en-PH", {
                    dateStyle: "medium",
                  })}
                </span>
              </div>
              {claim.status === "additional_information_required" &&
                claim.additional_info_request && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Moderator note: {claim.additional_info_request}
                  </p>
                )}
              {claim.status === "rejected" && claim.decision_reason && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Reason: {claim.decision_reason}
                </p>
              )}
              {claim.status === "approved" && (
                <p className="mt-2 text-sm">
                  <Link className="underline" href="/clinic-portal">
                    Manage this clinic in the portal →
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
