import Link from "next/link";
import {
  Building2,
  HeartHandshake,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/section-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getFeaturedClinics, getServices } from "@/modules/clinics/queries";
import { ClinicCard } from "@/modules/clinics/components/ClinicCard";
import { ServiceCard } from "@/modules/clinics/components/ServiceCard";
import { LocationSearchBox } from "@/modules/search/components/LocationSearchBox";

export const revalidate = 300;

const faqs = [
  {
    q: "Is ThriveMap free to use?",
    a: "Yes. Searching for clinics, viewing details, and getting directions are free and don't require an account.",
  },
  {
    q: "What does “Verified” mean?",
    a: "Verified clinics have confirmed their details with ThriveMap — either through a clinic representative claiming the listing or through our moderation team's manual review. Unverified listings show community-contributed information that hasn't been confirmed yet.",
  },
  {
    q: "Does ThriveMap recommend specific clinics?",
    a: "No. We list services and locations so families can explore options. Filters describe what clinics offer — they don't assess what's clinically appropriate for any particular child. Choosing care is always your family's decision, ideally with your care team.",
  },
  {
    q: "How do I add or correct a clinic?",
    a: "Use “Suggest a clinic” to add one that's missing, or the “Report incorrect information” link on any clinic page. Our moderators review every submission.",
  },
  {
    q: "Do you store my location?",
    a: "No. If you tap “Use my location,” your browser shares it once to center the map. We don't save your precise location.",
  },
];

const steps = [
  {
    icon: Search,
    title: "Search your area",
    body: "Share your location or search any city, province, or barangay to see nearby centers on the map and list.",
  },
  {
    icon: SlidersHorizontal,
    title: "Compare services",
    body: "Filter by therapy type, age groups, online availability, accessibility, and opening hours.",
  },
  {
    icon: MapPin,
    title: "Reach out directly",
    body: "Call, visit the website, or open directions. ThriveMap connects you — the conversation is yours.",
  },
];

export default async function HomePage() {
  // The build must succeed without a reachable database (CI builds against
  // placeholder env). ISR re-renders with live data once the app is serving.
  const [featured, services] = await Promise.all([
    getFeaturedClinics(6),
    getServices(),
  ]).catch(() => [[], []] as const);

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {/* Hero — one task, one dominant control. */}
        <section aria-labelledby="hero-heading" className="border-b">
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
            <div className="max-w-2xl">
              <h1
                id="hero-heading"
                className="text-4xl font-semibold tracking-tight sm:text-5xl"
              >
                Find the right support near you.
              </h1>
              <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted-foreground">
                Find therapy and developmental-care centers across the
                Philippines.
              </p>
            </div>
            <div className="mt-8 max-w-3xl">
              <LocationSearchBox size="large" />
            </div>
          </div>
        </section>

        {/* Browse by service */}
        <section
          aria-labelledby="services-heading"
          className="mx-auto max-w-6xl px-4 section-y sm:px-6"
        >
          <SectionHeader
            id="services-heading"
            title="Browse by service"
            lede="Explore the kinds of support available near you."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service, index) => (
              <ServiceCard key={service.id} service={service} index={index} />
            ))}
            {services.length > 0 && (
              <Link
                href="/clinics"
                className="group flex min-h-44 flex-col justify-between gap-4 rounded-xl border border-dashed border-border bg-secondary/60 p-5 transition-colors duration-150 ease-calm hover:border-primary/60 hover:bg-primary-subtle/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  aria-hidden
                  className="grid size-11 place-items-center rounded-lg border border-border bg-card text-primary"
                >
                  <Search className="size-5" />
                </span>
                <span className="flex flex-col gap-1.5">
                  <span className="text-base font-semibold">
                    See every clinic
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    Search the full directory by location, age group, and more.
                  </span>
                </span>
              </Link>
            )}
          </div>
        </section>

        {/* Featured clinics */}
        {featured.length > 0 && (
          <section
            aria-labelledby="featured-heading"
            className="border-y bg-secondary"
          >
            <div className="mx-auto max-w-6xl px-4 section-y sm:px-6">
              <SectionHeader
                id="featured-heading"
                title="Featured verified clinics"
                lede="Listings that have confirmed their details with ThriveMap."
              />
              <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {featured.map((clinic) => (
                  <ClinicCard
                    key={clinic.id}
                    clinic={{
                      id: clinic.id,
                      slug: clinic.slug,
                      name: clinic.name,
                      status: clinic.status,
                      city: clinic.clinic_locations[0]?.city,
                      province: clinic.clinic_locations[0]?.province,
                      serviceNames: clinic.clinic_services
                        .map((cs) => cs.services?.name)
                        .filter((n): n is string => Boolean(n)),
                      offersOnline: clinic.offers_online_services,
                      lastVerifiedAt: clinic.last_verified_at,
                    }}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* How it works */}
        <section
          aria-labelledby="how-heading"
          className="mx-auto max-w-6xl px-4 section-y sm:px-6"
        >
          <SectionHeader id="how-heading" title="How ThriveMap works" />
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {steps.map(({ icon: Icon, title, body }, index) => (
              <li key={title}>
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-lg bg-primary-subtle text-accent-foreground">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="text-sm font-medium text-subtle">
                        Step {index + 1}
                      </span>
                    </div>
                    <h3 className="text-xl font-semibold">{title}</h3>
                    <p className="text-base leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {/* Trust */}
        <section
          aria-labelledby="trust-heading"
          className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24"
        >
          <div className="grid gap-6 rounded-xl border border-border bg-card p-6 sm:grid-cols-[auto_1fr] sm:gap-8 sm:p-10">
            <span className="grid size-12 place-items-center rounded-lg bg-primary-subtle text-accent-foreground">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <div className="flex flex-col gap-3">
              <h2 id="trust-heading" className="text-3xl font-semibold">
                Community-checked, clinic-confirmed
              </h2>
              <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
                Every listing shows its verification status. Clinic
                representatives can claim their profile and keep details
                current, and our moderators review every suggestion, correction,
                and report. We use plain, neurodiversity-affirming language —
                autism is a difference to support, not something to fix.
              </p>
            </div>
          </div>
        </section>

        {/* CTAs */}
        <section
          aria-label="Contribute"
          className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-2 sm:px-6 sm:pb-24"
        >
          <Card>
            <CardContent className="flex h-full flex-col gap-4">
              <HeartHandshake className="size-7 text-primary" aria-hidden />
              <h2 className="text-xl font-semibold">
                Know a clinic we&apos;re missing?
              </h2>
              <p className="flex-1 text-base leading-relaxed text-muted-foreground">
                Help other families by suggesting a therapy center or
                developmental clinic. Our moderators will review and publish it.
              </p>
              <Button
                size="lg"
                className="w-fit"
                render={<Link href="/suggest-clinic" />}
              >
                Suggest a clinic
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex h-full flex-col gap-4">
              <Building2 className="size-7 text-primary" aria-hidden />
              <h2 className="text-xl font-semibold">Run a clinic?</h2>
              <p className="flex-1 text-base leading-relaxed text-muted-foreground">
                Claim your listing to keep your services, hours, and contact
                details accurate — and earn a Verified badge families trust.
              </p>
              <Button
                variant="outline"
                size="lg"
                className="w-fit"
                render={<Link href="/how-it-works" />}
              >
                Learn about claiming
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* FAQ */}
        <section
          aria-labelledby="faq-heading"
          className="mx-auto max-w-3xl px-4 pb-20 sm:px-6 sm:pb-28"
        >
          <SectionHeader id="faq-heading" title="Frequently asked questions" />
          <Accordion multiple={false} className="mt-8">
            {faqs.map((faq) => (
              <AccordionItem key={faq.q} value={faq.q}>
                <AccordionTrigger className="text-left text-base">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
