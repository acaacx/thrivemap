import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchClinicsBasic } from "@/modules/admin/server";

export default async function AdminClinicsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const results = q ? await searchClinicsBasic(q) : [];

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Clinics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Find a clinic to open its moderation view (ratings, audit history).
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

      {q && (
        <ul className="mt-6 space-y-2">
          {results.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No clinics match “{q}”.
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
