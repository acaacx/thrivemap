import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { slugToTitle } from "@/lib/format";
import { ClinicCard } from "@/modules/clinics/components/ClinicCard";
import {
  getClinicsByLocation,
  getLocationsDirectory,
} from "@/modules/clinics/queries";

export const revalidate = 600;

interface PageProps {
  params: Promise<{ province: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { province } = await params;
  const name = slugToTitle(province);
  return {
    title: `Therapy and developmental clinics in ${name}`,
    description: `Browse therapy centers and developmental clinics in ${name}, Philippines — occupational therapy, speech therapy, early intervention, and more.`,
    alternates: { canonical: `/locations/${province}` },
  };
}

export default async function ProvincePage({ params }: PageProps) {
  const { province } = await params;
  const [rows, directory] = await Promise.all([
    getClinicsByLocation(province),
    getLocationsDirectory(),
  ]);

  const provinceEntry = directory.find(
    (l) => l.province_slug === province && l.kind === "province",
  );
  if (!provinceEntry && rows.length === 0) notFound();
  const provinceName = provinceEntry?.province ?? slugToTitle(province);
  const cities = directory.filter(
    (l) => l.province_slug === province && l.city_slug,
  );

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="border-b bg-secondary">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Clinics in {provinceName}
            </h1>
            {cities.length > 0 && (
              <nav aria-label="Cities" className="mt-4 flex flex-wrap gap-2">
                {cities.map((city) => (
                  <Link
                    key={city.city_slug}
                    href={`/locations/${province}/${city.city_slug}`}
                    className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors duration-150 hover:border-primary/60 hover:bg-primary-subtle/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {city.city}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h2 className="text-xl font-semibold">
            {rows.length} listed clinic{rows.length === 1 ? "" : "s"}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {rows.map((row) => (
              <ClinicCard
                key={row.clinics.id}
                clinic={{
                  id: row.clinics.id,
                  slug: row.clinics.slug,
                  name: row.clinics.name,
                  status: row.clinics.status,
                  address: row.address_line1,
                  city: row.city,
                  province: row.province,
                  serviceNames: row.clinics.clinic_services
                    .map((cs) => cs.services?.name)
                    .filter((n): n is string => Boolean(n)),
                  offersOnline: row.clinics.offers_online_services,
                  lastVerifiedAt: row.clinics.last_verified_at,
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
