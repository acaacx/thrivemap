import Link from "next/link";
import {
  Building2,
  HeartHandshake,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getFeaturedClinics, getServices } from "@/modules/clinics/queries";
import { ClinicCard } from "@/modules/clinics/components/ClinicCard";
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
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-secondary/70 to-background">
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:pb-24">
            <div className="max-w-2xl space-y-6">
              <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Find therapy and developmental-care centers near you.
              </h1>
              <p className="text-lg text-muted-foreground">
                Search occupational therapy, speech therapy, early intervention,
                behavioral support, and developmental clinics across the
                Philippines.
              </p>
              <LocationSearchBox size="large" />
            </div>
          </div>
        </section>

        {/* Service categories */}
        <section
          aria-labelledby="services-heading"
          className="mx-auto max-w-6xl px-4 py-14 sm:px-6"
        >
          <h2
            id="services-heading"
            className="font-heading text-2xl font-semibold sm:text-3xl"
          >
            Browse by service
          </h2>
          <p className="mt-2 text-muted-foreground">
            Explore the kinds of support available near you.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service) => (
              <Link
                key={service.id}
                href={`/services/${service.slug}`}
                className="group rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="font-heading font-semibold group-hover:text-primary">
                  {service.name}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {service.short_description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* Featured clinics */}
        {featured.length > 0 && (
          <section
            aria-labelledby="featured-heading"
            className="bg-secondary/30 py-14"
          >
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <h2
                id="featured-heading"
                className="font-heading text-2xl font-semibold sm:text-3xl"
              >
                Featured verified clinics
              </h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          className="mx-auto max-w-6xl px-4 py-14 sm:px-6"
        >
          <h2
            id="how-heading"
            className="font-heading text-2xl font-semibold sm:text-3xl"
          >
            How ThriveMap works
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: Search,
                title: "Search your area",
                body: "Share your location or search any city, province, or barangay to see nearby centers on the map and list.",
              },
              {
                icon: Sparkles,
                title: "Compare services",
                body: "Filter by therapy type, age groups, online availability, accessibility, and opening hours.",
              },
              {
                icon: MapPin,
                title: "Reach out directly",
                body: "Call, visit the website, or open directions. ThriveMap connects you — the conversation is yours.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <Card key={title} className="rounded-2xl">
                <CardContent className="space-y-3 p-6">
                  <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="font-heading text-lg font-semibold">
                    {title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Trust */}
        <section
          aria-labelledby="trust-heading"
          className="bg-primary text-primary-foreground"
        >
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:grid-cols-[auto_1fr] sm:px-6">
            <ShieldCheck className="size-12 shrink-0" aria-hidden />
            <div className="space-y-3">
              <h2
                id="trust-heading"
                className="font-heading text-2xl font-semibold sm:text-3xl"
              >
                Community-checked, clinic-confirmed
              </h2>
              <p className="max-w-2xl text-primary-foreground/85">
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
        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:px-6">
          <Card className="rounded-2xl">
            <CardContent className="flex h-full flex-col gap-3 p-6">
              <HeartHandshake className="size-8 text-primary" aria-hidden />
              <h2 className="font-heading text-xl font-semibold">
                Know a clinic we&apos;re missing?
              </h2>
              <p className="flex-1 text-sm text-muted-foreground">
                Help other families by suggesting a therapy center or
                developmental clinic. Our moderators will review and publish it.
              </p>
              <Button
                className="w-fit rounded-full"
                render={<Link href="/suggest-clinic" />}
              >
                Suggest a clinic
              </Button>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="flex h-full flex-col gap-3 p-6">
              <Building2 className="size-8 text-primary" aria-hidden />
              <h2 className="font-heading text-xl font-semibold">
                Run a clinic?
              </h2>
              <p className="flex-1 text-sm text-muted-foreground">
                Claim your listing to keep your services, hours, and contact
                details accurate — and earn a Verified badge families trust.
              </p>
              <Button
                variant="outline"
                className="w-fit rounded-full"
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
          className="mx-auto max-w-3xl px-4 pb-20 sm:px-6"
        >
          <h2
            id="faq-heading"
            className="font-heading text-2xl font-semibold sm:text-3xl"
          >
            Frequently asked questions
          </h2>
          <Accordion multiple={false} className="mt-6">
            {faqs.map((faq) => (
              <AccordionItem key={faq.q} value={faq.q}>
                <AccordionTrigger className="text-left">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
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
