import Link from "next/link";
import { requireUser } from "@/modules/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClinicCard } from "@/modules/clinics/components/ClinicCard";
import { FavoritesSnapshot } from "@/modules/favorites/FavoritesSnapshot";
import type { SnapshotItem } from "@/modules/favorites/snapshot";

export default async function FavoritesPage() {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("favorites")
    .select(
      `
      clinic_id,
      clinics (
        id, slug, name, status, logo_url, last_verified_at, phone,
        offers_online_services,
        clinic_locations ( address_line1, city, province, latitude, longitude ),
        clinic_services ( services ( name ) )
      )
    `,
    )
    .order("created_at", { ascending: false });

  const favorites = (data ?? []).filter((f) => f.clinics);

  const snapshotItems: SnapshotItem[] = favorites.map((favorite) => {
    const clinic = favorite.clinics!;
    const location = clinic.clinic_locations[0];
    return {
      slug: clinic.slug,
      name: clinic.name,
      address: [location?.address_line1, location?.city, location?.province]
        .filter(Boolean)
        .join(", "),
      phone: clinic.phone,
    };
  });

  return (
    <div className="space-y-6">
      <FavoritesSnapshot items={snapshotItems} />
      <h1 className="font-heading text-2xl font-semibold">Favorites</h1>
      {favorites.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>No favorites yet.</p>
          <p className="mt-1">
            Tap the heart on any clinic to save it here.{" "}
            <Link href="/clinics" className="underline underline-offset-4">
              Find clinics
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {favorites.map((favorite) => {
            const clinic = favorite.clinics!;
            const location = clinic.clinic_locations[0];
            return (
              <ClinicCard
                key={clinic.id}
                clinic={{
                  id: clinic.id,
                  slug: clinic.slug,
                  name: clinic.name,
                  status: clinic.status,
                  address: location?.address_line1,
                  city: location?.city,
                  province: location?.province,
                  serviceNames: clinic.clinic_services
                    .map((cs) => cs.services?.name)
                    .filter((n): n is string => Boolean(n)),
                  offersOnline: clinic.offers_online_services,
                  lastVerifiedAt: clinic.last_verified_at,
                  latitude: location?.latitude ?? undefined,
                  longitude: location?.longitude ?? undefined,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
