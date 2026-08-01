import { PortalImagesManager } from "@/modules/portal/components/PortalImagesManager";
import { requireManagedClinic } from "@/modules/portal/server";

export default async function PortalImagesPage({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  const { clinic } = await requireManagedClinic(clinicId);

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">
        {clinic.name} — images
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Photos help families know what to expect. Images publish immediately;
        misuse leads to claim revocation.
      </p>
      <div className="mt-6">
        <PortalImagesManager
          clinicId={clinic.id}
          images={clinic.clinic_images.map((image) => ({
            id: image.id,
            storage_path: image.storage_path,
            alt_text: image.alt_text,
            kind: image.kind,
          }))}
        />
      </div>
    </div>
  );
}
