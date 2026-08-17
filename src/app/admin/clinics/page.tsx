import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CLINIC_STATUS_FILTERS,
  listClinicsByStatus,
  searchClinicsBasic,
  type ClinicStatusFilter,
  type ClinicSummary,
} from "@/modules/admin/server";

function isStatusFilter(
  value: string | undefined,
): value is ClinicStatusFilter {
  return (
    value !== undefined &&
    (CLINIC_STATUS_FILTERS as readonly string[]).includes(value)
  );
}

export default async function AdminClinicsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const statusFilter = isStatusFilter(status) ? status : null;
  let results: ClinicSummary[] = [];
  if (q) results = await searchClinicsBasic(q);
  else if (statusFilter) results = await listClinicsByStatus(statusFilter);
  const showList = Boolean(q) || statusFilter !== null;

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Clinics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Find a clinic to edit its listing, change its status, or moderate
        ratings. Imported drafts live under <em>draft</em>.
      </p>

      <form className="mt-6 flex max-w-md gap-2" action="/admin/clinics">
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name or slug…"
          aria-label="Search clinics"
        />
        <Button type="submit" variant="outline" className="shrink-0">
          Search
        </Button>
      </form>

      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Filter by status">
        {CLINIC_STATUS_FILTERS.map((filter) => {
          const active = !q && statusFilter === filter;
          return (
            <li key={filter}>
              <Link
                href={`/admin/clinics?status=${filter}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-muted"
                }`}
              >
                {filter.replaceAll("_", " ")}
              </Link>
            </li>
          );
        })}
      </ul>

      {showList && (
        <ul className="mt-6 space-y-2">
          {results.length === 0 && (
            <li className="text-sm text-muted-foreground">
              {q
                ? `No clinics match “${q}”.`
                : `No clinics with status “${statusFilter?.replaceAll("_", " ")}”.`}
            </li>
          )}
          {results.map((clinic) => (
            <li
              key={clinic.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/clinics/${clinic.id}`}
                  className="font-medium hover:underline"
                >
                  {clinic.name}
                </Link>
                <p className="text-xs text-muted-foreground">{clinic.slug}</p>
              </div>
              <Badge variant="outline" className="shrink-0 text-xs">
                {clinic.status.replaceAll("_", " ")}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
