import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { siteConfig } from "@/lib/site-config";
import { ClinicCard } from "@/modules/clinics/components/ClinicCard";
import { getServiceBySlug, getServices, searchClinics } from "@/modules/clinics/queries";
import { parseSearchParams } from "@/modules/search/schemas";

export const revalidate = 600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const services = await getServices();
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) return { title: "Service not found" };
  return {
    title: `${service.name} clinics in the Philippines`,
    description: `Find centers offering ${service.name.toLowerCase()} across the Philippines. ${service.short_description ?? ""}`,
    alternates: { canonical: `/services/${service.slug}` },
  };
}

export default async function ServicePage({ params }: PageProps) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) notFound();

  const { clinics } = await searchClinics(
    parseSearchParams({ services: slug, sort: "verified_first" }),
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
      { "@type": "ListItem", position: 2, name: "Services" },
      { "@type": "ListItem", position: 3, name: service.name },
    ],
  };

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <div className="bg-secondary/50">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
              {service.name} clinics in the Philippines
            </h1>
            {service.short_description && (
              <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
                {service.short_description}
              </p>
            )}
            <Button
              className="mt-6 rounded-full"
              render={<Link href={`/clinics?services=${service.slug}`} />}
            >
              Search {service.name.toLowerCase()} near you
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h2 className="font-heading text-xl font-semibold">
            {clinics.length} listed clinic{clinics.length === 1 ? "" : "s"}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {clinics.map((clinic) => (
              <ClinicCard
                key={clinic.clinic_id}
                clinic={{
                  id: clinic.clinic_id,
                  slug: clinic.slug,
                  name: clinic.name,
                  status: clinic.status,
                  address: clinic.address_line1,
                  city: clinic.city,
                  province: clinic.province,
                  serviceNames: clinic.service_names,
                  offersOnline: clinic.offers_online_services,
                  lastVerifiedAt: clinic.last_verified_at,
                  latitude: clinic.latitude,
                  longitude: clinic.longitude,
                }}
              />
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
