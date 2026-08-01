import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listClaims } from "@/modules/admin/server";

const OPEN_STATUSES = ["submitted", "under_review", "additional_information_required"];

export default async function AdminClaimsPage() {
  const claims = await listClaims();
  const open = claims.filter((c) => OPEN_STATUSES.includes(c.status));
  const closed = claims.filter((c) => !OPEN_STATUSES.includes(c.status));

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Clinic claims</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Approving grants portal access, verifies the listing, and records a
        verification event.
      </p>

      {open.length === 0 ? (
        <p className="mt-8 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Queue is clear.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {open.map((claim) => (
            <li
              key={claim.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">{claim.clinics?.name ?? "Clinic"}</p>
                <p className="text-sm text-muted-foreground">
                  {claim.full_name || "Unnamed claimant"} ·{" "}
                  {new Date(claim.created_at).toLocaleDateString("en-PH")}
                </p>
              </div>
              <Badge variant="outline">{claim.status.replaceAll("_", " ")}</Badge>
              <Button
                size="sm"
                className="ml-auto rounded-full"
                render={<Link href={`/admin/claims/${claim.id}`} />}
              >
                Review
              </Button>
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
            {closed.map((claim) => (
              <li key={claim.id} className="rounded-lg border bg-card px-4 py-2.5">
                <Link className="font-medium hover:underline" href={`/admin/claims/${claim.id}`}>
                  {claim.clinics?.name ?? "Clinic"}
                </Link>{" "}
                <Badge variant="outline" className="ml-1">
                  {claim.status}
                </Badge>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
