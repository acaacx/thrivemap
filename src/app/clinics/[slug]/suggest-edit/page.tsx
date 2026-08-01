import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getClinicBySlug } from "@/modules/clinics/queries";
import { ChangeRequestForm } from "@/modules/submissions/components/ChangeRequestForm";

export const metadata: Metadata = {
  title: "Suggest a correction",
  robots: { index: false },
};

export default async function SuggestEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const clinic = await getClinicBySlug(slug);
  if (!clinic) notFound();

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold">
            Suggest a correction
          </h1>
          <p className="mt-2 text-muted-foreground">
            For{" "}
            <span className="font-medium text-foreground">{clinic.name}</span>.
            Corrections are reviewed by our moderators before the listing
            changes.
          </p>
          <div className="mt-8">
            <ChangeRequestForm clinicId={clinic.id} clinicSlug={clinic.slug} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
