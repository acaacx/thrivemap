import { PortalProfileForm } from "@/modules/portal/components/PortalProfileForm";
import { canEditDirectly, requireManagedClinic } from "@/modules/portal/server";

export default async function PortalProfilePage({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  const { clinic } = await requireManagedClinic(clinicId);

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">{clinic.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Profile details shown on your public listing.
      </p>
      <div className="mt-6">
        <PortalProfileForm
          clinicId={clinic.id}
          directEdit={canEditDirectly(clinic.status)}
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
    </div>
  );
}
