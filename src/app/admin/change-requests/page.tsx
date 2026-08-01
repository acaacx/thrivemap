import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  approveChangeRequest,
  rejectChangeRequest,
} from "@/modules/admin/actions";
import { ReviewActions } from "@/modules/admin/components/ReviewCard";
import { listChangeRequests } from "@/modules/admin/server";

const OPEN_STATUSES = ["submitted", "under_review"];

function renderValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function AdminChangeRequestsPage() {
  const requests = await listChangeRequests();
  const open = requests.filter((r) => OPEN_STATUSES.includes(r.status));
  const closed = requests.filter((r) => !OPEN_STATUSES.includes(r.status));

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Change requests</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Corrections from caregivers and unverified clinic representatives.
        Approving applies the change to the live listing.
      </p>

      {open.length === 0 ? (
        <p className="mt-8 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Queue is clear.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {open.map((request) => {
            const changes = (request.changes ?? {}) as Record<
              string,
              { from: unknown; to: unknown }
            >;
            return (
              <li key={request.id} className="rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/clinics/${request.clinics?.slug}`}
                    className="font-heading text-lg font-semibold hover:underline"
                  >
                    {request.clinics?.name ?? "Clinic"}
                  </Link>
                  <Badge variant="outline">
                    {request.status.replaceAll("_", " ")}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(request.created_at).toLocaleString("en-PH")}
                  </span>
                </div>
                {request.message && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {request.message}
                  </p>
                )}
                {Object.keys(changes).length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                          <th scope="col" className="px-3 py-2 font-medium">
                            Field
                          </th>
                          <th scope="col" className="px-3 py-2 font-medium">
                            From
                          </th>
                          <th scope="col" className="px-3 py-2 font-medium">
                            To
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(changes).map(([field, change]) => (
                          <tr
                            key={field}
                            className="border-b last:border-0 align-top"
                          >
                            <th
                              scope="row"
                              className="px-3 py-2 text-left font-medium"
                            >
                              {field.replaceAll("_", " ")}
                            </th>
                            <td className="px-3 py-2 text-muted-foreground">
                              {renderValue(change?.from)}
                            </td>
                            <td className="px-3 py-2">
                              {renderValue(change?.to)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <ReviewActions
                  actions={[
                    {
                      label: "Approve & apply",
                      run: approveChangeRequest.bind(null, request.id),
                    },
                    {
                      label: "Reject",
                      variant: "destructive",
                      run: rejectChangeRequest.bind(null, request.id),
                    },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}

      {closed.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Decided ({closed.length})
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {closed.map((request) => (
              <li
                key={request.id}
                className="rounded-lg border bg-card px-4 py-2.5"
              >
                <span className="font-medium">
                  {request.clinics?.name ?? "Clinic"}
                </span>{" "}
                <Badge variant="outline" className="ml-1">
                  {request.status}
                </Badge>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
