import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/section-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServices } from "@/modules/clinics/queries";
import { ServiceCard } from "@/modules/clinics/components/ServiceCard";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Services",
  description:
    "Browse the kinds of therapy and developmental support listed on ThriveMap — occupational therapy, speech and language therapy, early intervention, and more.",
  alternates: { canonical: "/services" },
};

export default async function ServicesIndexPage() {
  // The build must succeed without a reachable database (CI builds against
  // placeholder env). ISR re-renders with live data once the app is serving.
  const services = await getServices().catch(() => []);

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section
          aria-labelledby="services-heading"
          className="mx-auto max-w-6xl px-4 section-y sm:px-6"
        >
          <SectionHeader
            as="h1"
            id="services-heading"
            title="Services"
            lede="Each service page lists centers that offer that kind of support, with a short plain-language description. Filters describe what clinics list — they are not a clinical recommendation."
          />
          {services.length > 0 ? (
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {services.map((service, index) => (
                <ServiceCard key={service.id} service={service} index={index} />
              ))}
            </div>
          ) : (
            <p className="mt-12 text-muted-foreground">
              Services are loading. Please try again in a moment.
            </p>
          )}
          <div className="mt-12 flex flex-wrap items-center gap-3 border-t pt-8">
            <p className="text-muted-foreground">
              Not sure which service fits? Search every clinic near you.
            </p>
            <Button size="lg" render={<Link href="/clinics" />}>
              Find clinics
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
