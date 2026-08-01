import { getServices } from "@/modules/clinics/queries";
import { PortalServicesForm } from "@/modules/portal/components/PortalServicesForm";
import { canEditDirectly, requireManagedClinic } from "@/modules/portal/server";

export default async function PortalServicesPage({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  const [{ clinic }, services] = await Promise.all([
    requireManagedClinic(clinicId),
    getServices(),
  ]);

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">
        {clinic.name} — services
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Which therapy services does this clinic offer?
      </p>
      <div className="mt-6">
        <PortalServicesForm
          clinicId={clinic.id}
          directEdit={canEditDirectly(clinic.status)}
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            short_description: s.short_description,
          }))}
          selectedIds={clinic.clinic_services.map((cs) => cs.service_id)}
        />
      </div>
    </div>
  );
}
