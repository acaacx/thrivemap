import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  adminUpdateClinicProfile,
  adminUpdateClinicServices,
} from "@/modules/admin/actions";
import { ClinicIdentityForm } from "@/modules/admin/components/ClinicIdentityForm";
import { ClinicStatusCard } from "@/modules/admin/components/ClinicStatusCard";
import { getClinicForEditing, requireModerator } from "@/modules/admin/server";
import { getServices } from "@/modules/clinics/queries";
import { AdminRatingsPanel } from "@/modules/ratings/components/AdminRatingsPanel";
import { PortalProfileForm } from "@/modules/portal/components/PortalProfileForm";
import { PortalServicesForm } from "@/modules/portal/components/PortalServicesForm";

const PUBLIC_STATUSES = new Set([
  "published_unverified",
  "published_verified",
  "temporarily_closed",
]);

export default async function AdminClinicDetailPage({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  const [{ roles }, clinic, services] = await Promise.all([
    requireModerator(),
    getClinicForEditing(clinicId),
    getServices(),
  ]);
  if (!clinic) notFound();

  const isAdmin =
    roles.includes("administrator") || roles.includes("super_administrator");
  const primary =
    clinic.clinic_locations.find((l) => l.is_primary) ??
    clinic.clinic_locations[0] ??
    null;
  const isPublic = PUBLIC_STATUSES.has(clinic.status);
  const source = clinic.clinic_source_records[0] ?? null;

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
        {source?.provider && (
          <Badge variant="outline">imported · {source.provider}</Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {primary
          ? `${primary.address_line1}${primary.barangay ? `, ${primary.barangay}` : ""}, ${primary.city}, ${primary.province}`
          : "No location on file."}
        {" · "}
        {isPublic ? (
          <Link className="underline" href={`/clinics/${clinic.slug}`}>
            View public listing
          </Link>
        ) : (
          <span>
            Public URL <code>/clinics/{clinic.slug}</code> goes live once
            published.
          </span>
        )}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="font-heading text-lg font-semibold">
              Name &amp; address
            </h2>
            <div className="mt-4">
              <ClinicIdentityForm
                clinicId={clinic.id}
                hasLocation={primary !== null}
                initial={{
                  name: clinic.name,
                  address_line1: primary?.address_line1 ?? "",
                }}
              />
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="font-heading text-lg font-semibold">Services</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              At least one service is needed for the clinic to appear in
              filtered searches.
            </p>
            <div className="mt-4">
              <PortalServicesForm
                clinicId={clinic.id}
                directEdit
                action={adminUpdateClinicServices}
                submitLabel="Save services"
                services={services.map((s) => ({
                  id: s.id,
                  name: s.name,
                  short_description: s.short_description,
                }))}
                selectedIds={clinic.clinic_services.map((cs) => cs.service_id)}
              />
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="font-heading text-lg font-semibold">Profile</h2>
            <div className="mt-4">
              <PortalProfileForm
                clinicId={clinic.id}
                directEdit
                action={adminUpdateClinicProfile}
                submitLabel="Save profile"
                initial={{
                  description: clinic.description ?? "",
                  phone: clinic.phone ?? "",
                  email: clinic.email ?? "",
                  website: clinic.website ?? "",
                  offers_online_services: clinic.offers_online_services,
                  offers_in_person_services: clinic.offers_in_person_services,
                  wheelchair_accessible: clinic.wheelchair_accessible ?? false,
                  accessibility_notes: clinic.accessibility_notes ?? "",
                }}
              />
            </div>
          </section>

          <AdminRatingsPanel clinicId={clinic.id} />
        </div>

        <ClinicStatusCard
          clinicId={clinic.id}
          status={clinic.status}
          canChange={isAdmin}
        />
      </div>
    </div>
  );
}
