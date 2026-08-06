import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  ExternalLink,
  Flag,
  Globe,
  Mail,
  MapPin,
  Phone,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { dayName, formatTime } from "@/lib/format";
import { siteConfig } from "@/lib/site-config";
import { getClinicBySlug } from "@/modules/clinics/queries";
import { FavoriteButton } from "@/modules/favorites/components/FavoriteButton";
import { VerificationBadge } from "@/modules/clinics/components/VerificationBadge";
import { InquiryCta } from "@/modules/inquiries/components/InquiryCta";
import { clinicAcceptsInquiries } from "@/modules/inquiries/queries";
import { ClinicProfileMap } from "./profile-map";

export const revalidate = 300;

// No build-time prerender (thousands of clinics, and CI builds without a
// reachable database) — but declaring generateStaticParams is what opts a
// dynamic segment into on-demand ISR instead of per-request rendering.
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const clinic = await getClinicBySlug(slug);
  if (!clinic) return { title: "Clinic not found" };
  const location = clinic.clinic_locations[0];
  const description = `${clinic.name} in ${location?.city ?? "the Philippines"} — services, opening hours, contact details, and directions on ${siteConfig.name}.`;
  return {
    title: clinic.name,
    description,
    alternates: { canonical: `/clinics/${clinic.slug}` },
    openGraph: { title: clinic.name, description },
  };
}

const AGE_LABELS: Record<string, string> = {
  infants: "Infants",
  toddlers: "Toddlers",
  preschool: "Preschool",
  school_age: "School age",
  teenagers: "Teenagers",
  adults: "Adults",
};

export default async function ClinicProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const clinic = await getClinicBySlug(slug);
  if (!clinic) notFound();

  const acceptsInquiries = await clinicAcceptsInquiries(clinic.id);

  const location =
    clinic.clinic_locations.find((l) => l.is_primary) ??
    clinic.clinic_locations[0];
  const isVerified = clinic.status === "published_verified";
  const services = clinic.clinic_services
    .map((cs) => cs.services)
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const hours = [...clinic.clinic_hours].sort(
    (a, b) => a.day_of_week - b.day_of_week,
  );
  const deliveryTypes = new Set(
    clinic.clinic_services.flatMap((cs) => cs.delivery ?? []),
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    name: clinic.name,
    description: clinic.description ?? undefined,
    url: `${siteConfig.url}/clinics/${clinic.slug}`,
    telephone: clinic.phone ?? undefined,
    email: clinic.email ?? undefined,
    address: location
      ? {
          "@type": "PostalAddress",
          streetAddress: [location.address_line1, location.address_line2]
            .filter(Boolean)
            .join(", "),
          addressLocality: location.city,
          addressRegion: location.province,
          postalCode: location.postal_code ?? undefined,
          addressCountry: "PH",
        }
      : undefined,
    geo:
      location?.latitude != null
        ? {
            "@type": "GeoCoordinates",
            latitude: location.latitude,
            longitude: location.longitude,
          }
        : undefined,
    openingHoursSpecification: hours
      .filter((h) => !h.is_closed && h.opens_at && h.closes_at)
      .map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: dayName(h.day_of_week),
        opens: h.opens_at,
        closes: h.closes_at,
      })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
      {
        "@type": "ListItem",
        position: 2,
        name: "Clinics",
        item: `${siteConfig.url}/clinics`,
      },
      { "@type": "ListItem", position: 3, name: clinic.name },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
        />
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/clinics" />}>
                  Clinics
                </BreadcrumbLink>
              </BreadcrumbItem>
              {location && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      render={
                        <Link
                          href={`/locations/${location.province_slug}/${location.city_slug}`}
                        />
                      }
                    >
                      {location.city}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </>
              )}
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{clinic.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <header className="mt-6 flex flex-wrap items-start gap-4">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary">
              <Building2
                className="size-9 text-secondary-foreground"
                aria-hidden
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
                  {clinic.name}
                </h1>
                <VerificationBadge status={clinic.status} />
              </div>
              {location && (
                <p className="flex items-start gap-1.5 text-muted-foreground">
                  <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
                  {[
                    location.address_line1,
                    location.barangay,
                    location.city,
                    location.province,
                    location.postal_code,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {clinic.last_verified_at && (
                <p className="text-sm text-muted-foreground">
                  Last verified{" "}
                  {new Date(clinic.last_verified_at).toLocaleDateString(
                    "en-PH",
                    {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    },
                  )}
                </p>
              )}
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <FavoriteButton clinicId={clinic.id} clinicName={clinic.name} />
              {clinic.phone && (
                <Button
                  className="rounded-full"
                  render={
                    <a href={`tel:${clinic.phone.replaceAll(" ", "")}`} />
                  }
                >
                  <Phone className="size-4" aria-hidden /> Call
                </Button>
              )}
              {clinic.website && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  render={
                    <a
                      href={clinic.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <Globe className="size-4" aria-hidden /> Website
                  <ExternalLink className="size-3.5" aria-hidden />
                </Button>
              )}
              {location && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  render={
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                        [
                          location.address_line1,
                          location.city,
                          location.province,
                          "Philippines",
                        ]
                          .filter(Boolean)
                          .join(", "),
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <MapPin className="size-4" aria-hidden /> Directions
                </Button>
              )}
            </div>
          </header>

          {!isVerified && clinic.status !== "temporarily_closed" && (
            <div
              role="note"
              className="mt-6 flex items-start gap-3 rounded-xl border border-accent bg-accent/40 p-4 text-sm"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-accent-foreground"
                aria-hidden
              />
              <p>
                <span className="font-medium">Unverified listing.</span>{" "}
                Information may be incomplete or outdated. Please confirm
                details directly with the clinic.
              </p>
            </div>
          )}
          {clinic.status === "temporarily_closed" && (
            <div
              role="note"
              className="mt-6 rounded-xl border bg-secondary p-4 text-sm"
            >
              This clinic is marked as{" "}
              <span className="font-medium">temporarily closed</span>.
            </div>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              {clinic.description && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">
                      <h2>About</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                      {clinic.description}
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg">
                    <h2>Services</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {services.map((service) => (
                      <Badge
                        key={service.slug}
                        variant="secondary"
                        render={<Link href={`/services/${service.slug}`} />}
                      >
                        {service.name}
                      </Badge>
                    ))}
                    {services.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No services listed yet.
                      </p>
                    )}
                  </div>
                  {deliveryTypes.size > 0 && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      {deliveryTypes.has("online") && (
                        <span className="inline-flex items-center gap-1">
                          <Video className="size-4" aria-hidden /> Online
                          sessions offered
                        </span>
                      )}
                      {deliveryTypes.has("in_person") && (
                        <span>In-person sessions</span>
                      )}
                    </p>
                  )}
                </CardContent>
              </Card>

              {clinic.clinic_age_groups.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">
                      <h2>Age groups served</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {clinic.clinic_age_groups.map((ag) => (
                      <Badge key={ag.age_group} variant="outline">
                        {AGE_LABELS[ag.age_group] ?? ag.age_group}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              )}

              {(clinic.wheelchair_accessible != null ||
                clinic.accessibility_notes) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">
                      <h2>Accessibility</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {clinic.wheelchair_accessible != null && (
                      <p>
                        {clinic.wheelchair_accessible
                          ? "Listed as wheelchair accessible."
                          : "Not listed as wheelchair accessible."}
                      </p>
                    )}
                    {clinic.accessibility_notes && (
                      <p className="text-muted-foreground">
                        {clinic.accessibility_notes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {clinic.clinic_languages.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">
                      <h2>Languages</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {clinic.clinic_languages.map((l) => l.language).join(", ")}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {location?.latitude != null && location?.longitude != null && (
                <Card className="overflow-hidden py-0">
                  <ClinicProfileMap
                    clinicId={clinic.id}
                    slug={clinic.slug}
                    clinicName={clinic.name}
                    latitude={location.latitude}
                    longitude={location.longitude}
                    verified={isVerified}
                  />
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg">
                    <h2>Opening hours</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {hours.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Hours not listed yet.
                    </p>
                  ) : (
                    <dl className="space-y-1.5 text-sm">
                      {hours.map((h) => (
                        <div
                          key={h.day_of_week}
                          className="flex justify-between gap-4"
                        >
                          <dt className="text-muted-foreground">
                            {dayName(h.day_of_week)}
                          </dt>
                          <dd>
                            {h.is_closed
                              ? "Closed"
                              : `${formatTime(h.opens_at)} – ${formatTime(h.closes_at)}`}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg">
                    <h2>Contact</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {clinic.phone && (
                    <p className="flex items-center gap-2">
                      <Phone
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                      <a
                        className="underline-offset-4 hover:underline"
                        href={`tel:${clinic.phone.replaceAll(" ", "")}`}
                      >
                        {clinic.phone}
                      </a>
                    </p>
                  )}
                  {clinic.email && (
                    <p className="flex items-center gap-2">
                      <Mail
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                      <a
                        className="underline-offset-4 hover:underline"
                        href={`mailto:${clinic.email}`}
                      >
                        {clinic.email}
                      </a>
                    </p>
                  )}
                  {clinic.website && (
                    <p className="flex items-center gap-2">
                      <Globe
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                      <a
                        className="truncate underline-offset-4 hover:underline"
                        href={clinic.website}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {clinic.website.replace(/^https?:\/\//, "")}
                      </a>
                    </p>
                  )}
                  {clinic.clinic_social_links.map((social) => (
                    <p key={social.url} className="flex items-center gap-2">
                      <ExternalLink
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                      <a
                        className="capitalize underline-offset-4 hover:underline"
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {social.platform}
                      </a>
                    </p>
                  ))}
                </CardContent>
              </Card>

              <InquiryCta
                clinicId={clinic.id}
                clinicName={clinic.name}
                clinicSlug={clinic.slug}
                accepts={acceptsInquiries}
              />

              <Card>
                <CardContent className="space-y-3 p-6 text-sm">
                  <p className="flex items-start gap-2 text-muted-foreground">
                    <Flag className="mt-0.5 size-4 shrink-0" aria-hidden />
                    See something wrong? Reports help keep listings accurate for
                    every family.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      render={<Link href={`/clinics/${clinic.slug}/report`} />}
                    >
                      Report incorrect information
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      render={
                        <Link href={`/clinics/${clinic.slug}/suggest-edit`} />
                      }
                    >
                      Suggest a correction
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      render={<Link href={`/clinics/${clinic.slug}/claim`} />}
                    >
                      Claim this clinic
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
