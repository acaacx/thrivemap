import { requireManagedClinic } from "@/modules/portal/server";
import { TherapistManager } from "@/modules/therapists/components/TherapistManager";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

export default async function ManageTeamPage({ params }: PageProps) {
  const { clinicId } = await params;
  const { clinic } = await requireManagedClinic(clinicId);

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">
        {clinic.name} — team
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Introduce the therapists families will meet. Names and specialties also
        help your clinic show up in search.
      </p>
      <div className="mt-6">
        <TherapistManager
          clinicId={clinic.id}
          therapists={clinic.clinic_therapists}
        />
      </div>
    </div>
  );
}
