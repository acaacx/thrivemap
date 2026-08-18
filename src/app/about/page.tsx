import type { Metadata } from "next";
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

export const revalidate = 300;

export const metadata: Metadata = {
  title: "About",
  description:
    "ThriveMap is a Philippines-first directory helping families find therapy centers and developmental clinics, built with neurodiversity-affirming values.",
  alternates: { canonical: "/about" },
};

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

/**
 * Everything that used to be the marketing homepage lives here now: the
 * homepage is the application itself. Kept intact — services, featured
 * clinics, how it works, trust, contribute, FAQ — plus the "about" copy.
 */
export default async function AboutPage() {
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
        <section
          aria-labelledby="about-heading"
          className="border-b bg-secondary"
        >
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="max-w-2xl">
              <h1
                id="about-heading"
                className="text-4xl font-semibold tracking-tight sm:text-5xl"
              >
                Find the right support near you.
              </h1>
              <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted-foreground">
                ThriveMap is a community directory of therapy centers,
                developmental clinics, and child-development services across the
                Philippines — occupational therapy, speech and language therapy,
                early intervention, behavioral support, developmental
                assessment, and more.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" render={<Link href="/" />}>
                  <Search aria-hidden />
                  Find clinics near you
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  render={<Link href="/how-it-works" />}
                >
                  How verification works
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* What we believe */}
        <section
          aria-labelledby="believe-heading"
          className="mx-auto max-w-6xl px-4 section-y sm:px-6"
        >
          <SectionHeader id="believe-heading" title="What we believe" />
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              "Autism and other developmental differences are part of human diversity. We use neurodiversity-affirming language and never frame autism as something to be cured.",
              "Families deserve clear, accurate information. Every listing shows its verification status, and our moderators review every community contribution.",
              "Finding care should be free and pressure-free. Searching never requires an account, and we don’t rank clinics as “best” — we show you what’s available and let you decide.",
            ].map((belief) => (
              <li key={belief}>
                <Card className="h-full">
                  <CardContent className="text-base leading-relaxed text-foreground">
                    {belief}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-prose text-base leading-relaxed text-muted-foreground">
            ThriveMap is a directory, not a medical service. We don&apos;t
            provide diagnoses, recommendations, or medical advice, and we
            don&apos;t store health records. Whether a service fits your child
            is a decision for your family, ideally together with your care team.
          </p>
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
                href="/"
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

        {/* Contact */}
        <section
          aria-labelledby="contact-heading"
          className="mx-auto max-w-3xl px-4 pb-20 sm:px-6 sm:pb-28"
        >
          <SectionHeader id="contact-heading" title="Get in touch" />
          <p className="mt-6 text-base leading-relaxed text-foreground">
            Questions, corrections, partnership ideas? Email{" "}
            <a
              href="mailto:hello@thrivemap.ph"
              className="underline underline-offset-4"
            >
              hello@thrivemap.ph
            </a>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
