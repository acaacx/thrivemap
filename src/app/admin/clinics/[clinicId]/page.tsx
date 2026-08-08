import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getClinicSummary } from "@/modules/admin/server";
import { AdminRatingsPanel } from "@/modules/ratings/components/AdminRatingsPanel";

export default async function AdminClinicDetailPage({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  const clinic = await getClinicSummary(clinicId);
  if (!clinic) notFound();

  return (
    <div>
      <nav className="text-sm text-muted-foreground">
        <Link className="hover:underline" href="/admin/clinics">
          ← Clinics
        </Link>
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-2xl font-semibold">{clinic.name}</h1>
        <Badge variant="outline">{clinic.status.replaceAll("_", " ")}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        <Link className="underline" href={`/clinics/${clinic.slug}`}>
          View public listing
        </Link>
      </p>

      <AdminRatingsPanel clinicId={clinic.id} />
    </div>
  );
}
