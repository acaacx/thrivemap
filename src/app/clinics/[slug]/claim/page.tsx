import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getClinicBySlug } from "@/modules/clinics/queries";

export const metadata: Metadata = {
  title: "Claim this clinic",
  robots: { index: false },
};

/**
 * Claim landing page. The full claim wizard (documents, verification) ships
 * with the clinic-representative portal in the next release stage.
 */
export default async function ClaimPage({
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
            Claim {clinic.name}
          </h1>
          <p className="mt-3 text-muted-foreground">
            Clinic representatives can claim this listing to keep services,
            hours, and contact details accurate — and earn a Verified badge.
          </p>
          <div className="mt-6 space-y-3 rounded-2xl border bg-card p-6 text-sm">
            <p className="font-medium">You&apos;ll need:</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>A work email at the clinic</li>
              <li>Your role and relationship to the clinic</li>
              <li>Proof of affiliation (business permit, employment record, or similar)</li>
            </ul>
            <p className="text-muted-foreground">
              Online claim submission opens shortly. Until then, our team
              processes claims by email — write to us and we&apos;ll guide you
              through verification.
            </p>
          </div>
          <div className="mt-6 flex gap-3">
            <Button
              className="rounded-full"
              render={
                <a
                  href={`mailto:hello@thrivemap.ph?subject=${encodeURIComponent(
                    `Clinic claim: ${clinic.name}`,
                  )}`}
                />
              }
            >
              Start claim by email
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              render={<Link href={`/clinics/${clinic.slug}`} />}
            >
              Back to listing
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
