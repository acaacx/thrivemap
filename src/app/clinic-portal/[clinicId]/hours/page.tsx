import { PortalHoursForm } from "@/modules/portal/components/PortalHoursForm";
import { canEditDirectly, requireManagedClinic } from "@/modules/portal/server";

export default async function PortalHoursPage({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  const { clinic } = await requireManagedClinic(clinicId);

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">{clinic.name} — hours</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Weekly opening hours shown on your listing and used for “open now”
        search filters.
      </p>
      <div className="mt-6">
        <PortalHoursForm
          clinicId={clinic.id}
          directEdit={canEditDirectly(clinic.status)}
          initial={clinic.clinic_hours.map((row) => ({
            day_of_week: row.day_of_week,
            is_closed: row.is_closed,
            opens_at: row.opens_at,
            closes_at: row.closes_at,
          }))}
        />
      </div>
    </div>
  );
}
