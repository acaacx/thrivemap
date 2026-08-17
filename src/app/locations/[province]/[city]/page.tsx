import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  params: Promise<{ province: string; city: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { province, city } = await params;
  const cityName = slugToTitle(city);
  return {
    title: `Therapy and developmental clinics in ${cityName}`,
    description: `Browse therapy centers and developmental clinics in ${cityName}, ${slugToTitle(province)} — services, hours, and directions on ThriveMap.`,
    alternates: { canonical: `/locations/${province}/${city}` },
  };
}

export default async function CityPage({ params }: PageProps) {
  const { province, city } = await params;
  const [rows, directory] = await Promise.all([
    getClinicsByLocation(province, city),
    getLocationsDirectory(),
  ]);

  const cityEntry = directory.find(
    (l) => l.province_slug === province && l.city_slug === city,
  );
  if (!cityEntry && rows.length === 0) notFound();
  const cityName = cityEntry?.city ?? slugToTitle(city);

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <div className="border-b bg-secondary">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <p className="text-sm text-muted-foreground">
              <Link
                href={`/locations/${province}`}
                className="underline-offset-4 hover:underline"
              >
                {cityEntry?.province ?? slugToTitle(province)}
              </Link>
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              Clinics in {cityName}
            </h1>
            <Button className="mt-6" render={<Link href="/clinics" />}>
              Search on the map
            </Button>
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
