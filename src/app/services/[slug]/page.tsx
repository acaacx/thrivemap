import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, ShieldCheck, type LucideIcon } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { siteConfig } from "@/lib/site-config";
import { ClinicCard } from "@/modules/clinics/components/ClinicCard";
import {
  getServiceBySlug,
  getServices,
  searchClinics,
} from "@/modules/clinics/queries";
import { ServiceGlyph } from "@/modules/clinics/service-glyph";
import { parseSearchParams } from "@/modules/search/schemas";

export const revalidate = 600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  // The build must succeed without a reachable database (CI builds against
  // placeholder env). Fall back to on-demand ISR when the fetch fails.
  try {
    const services = await getServices();
    return services.map((s) => ({ slug: s.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) return { title: "Service not found" };
  return {
    title: `${service.name} clinics in the Philippines`,
    description: `Find centers offering ${service.name.toLowerCase()} across the Philippines. ${service.short_description ?? ""}`,
    alternates: { canonical: `/services/${service.slug}` },
  };
}

function StatChip({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <li className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground">
      <Icon className="size-4 text-primary" aria-hidden />
      {children}
    </li>
  );
}

export default async function ServicePage({ params }: PageProps) {
  const { slug } = await params;
  const [service, allServices] = await Promise.all([
    getServiceBySlug(slug),
    getServices(),
  ]);
  if (!service) notFound();

  const { clinics, nextCursor } = await searchClinics(
    parseSearchParams({ services: slug, sort: "verified_first" }),
  );

  const others = allServices.filter((s) => s.slug !== service.slug);
  // searchClinics is keyset-paginated (PAGE_SIZE 20) — clinics.length is a
  // page, not a total. "20+" is honest without a second count query.
  const hasMore = nextCursor != null;
  const countLabel = hasMore ? `${clinics.length}+` : String(clinics.length);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
      {
        "@type": "ListItem",
        position: 2,
        name: "Services",
        item: `${siteConfig.url}/services`,
      },
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
        <section className="border-b bg-secondary">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink render={<Link href="/" />}>
                    Home
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink render={<Link href="/services" />}>
                    Services
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{service.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
              <span
                aria-hidden
                className="grid size-14 shrink-0 place-items-center rounded-lg bg-tint-blue text-accent-foreground"
              >
                <ServiceGlyph icon={service.icon} className="size-7" />
              </span>
              <div className="max-w-2xl space-y-4">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {service.name} clinics in the Philippines
                </h1>
                {service.short_description && (
                  <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
                    {service.short_description}
                  </p>
                )}
                <ul className="flex flex-wrap gap-2 pt-1">
                  <StatChip icon={Building2}>
                    {countLabel} clinic
                    {clinics.length === 1 && !hasMore ? "" : "s"} listed
                  </StatChip>
                  <StatChip icon={ShieldCheck}>
                    Verified listings first
                  </StatChip>
                </ul>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button
                    size="lg"
                    render={<Link href={`/clinics?services=${service.slug}`} />}
                  >
                    Search {service.name.toLowerCase()} near you
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    render={<Link href="/suggest-clinic" />}
                  >
                    Suggest a clinic
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="clinics-heading"
          className="mx-auto max-w-6xl px-4 section-y sm:px-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="clinics-heading"
                className="text-3xl font-semibold tracking-tight"
              >
                Clinics offering {service.name.toLowerCase()}
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                {clinics.length === 0
                  ? "Nothing listed here yet."
                  : hasMore
                    ? `Showing the first ${clinics.length}, verified listings first.`
                    : `${clinics.length} listed clinic${clinics.length === 1 ? "" : "s"}, verified listings first.`}
              </p>
            </div>
            {hasMore && (
              <Button
                variant="outline"
                render={<Link href={`/clinics?services=${service.slug}`} />}
              >
                See all on the map
              </Button>
            )}
          </div>

          {clinics.length === 0 ? (
            <EmptyState
              className="mt-8"
              icon={<ServiceGlyph icon={service.icon} className="size-5" />}
              title={`We haven't listed any ${service.name.toLowerCase()} clinics yet.`}
              body="We're still building out this part of the directory. Browse every clinic on the map, or tell us about a center that offers this support — our moderators review each suggestion."
              actions={
                <>
                  <Button size="lg" render={<Link href="/clinics" />}>
                    Browse all clinics
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    render={<Link href="/suggest-clinic" />}
                  >
                    Suggest a clinic
                  </Button>
                </>
              }
            />
          ) : (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
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
                    wheelchairAccessible: clinic.wheelchair_accessible,
                    lastVerifiedAt: clinic.last_verified_at,
                    latitude: clinic.latitude,
                    longitude: clinic.longitude,
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {others.length > 0 && (
          <section
            aria-labelledby="other-services-heading"
            className="border-t bg-secondary"
          >
            <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
              <h2 id="other-services-heading" className="text-xl font-semibold">
                Explore other services
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {others.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/services/${s.slug}`}
                      className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors duration-150 ease-calm hover:border-primary/60 hover:bg-primary-subtle/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
