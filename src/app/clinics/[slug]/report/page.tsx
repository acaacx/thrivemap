import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getClinicBySlug } from "@/modules/clinics/queries";
import { ReportForm } from "@/modules/reports/components/ReportForm";

export const metadata: Metadata = {
  title: "Report incorrect information",
  robots: { index: false },
};

export default async function ReportPage({
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
            Report incorrect information
          </h1>
          <p className="mt-2 text-muted-foreground">
            For{" "}
            <span className="font-medium text-foreground">{clinic.name}</span>.
            Your report goes to our moderators — thank you for keeping listings
            accurate for every family.
          </p>
          <div className="mt-8">
            <ReportForm clinicId={clinic.id} clinicSlug={clinic.slug} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
