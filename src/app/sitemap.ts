import type { MetadataRoute } from "next";
import { createSupabaseAnonClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/site-config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createSupabaseAnonClient();
  const base = siteConfig.url;

  // The build must succeed without a reachable database (CI builds against
  // placeholder env). Static pages alone are a valid sitemap; the full one is
  // regenerated once the app serves requests with a live database.
  let clinics, services, locations;
  try {
    [{ data: clinics }, { data: services }, { data: locations }] =
      await Promise.all([
        supabase
          .from("clinics")
          .select("slug, updated_at")
          .in("status", [
            "published_unverified",
            "published_verified",
            "temporarily_closed",
          ])
          .is("deleted_at", null),
        supabase.from("services").select("slug"),
        supabase.from("ph_locations").select("province_slug, city_slug, kind"),
      ]);
  } catch {
    clinics = services = locations = null;
  }

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/clinics`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/how-it-works`, changeFrequency: "monthly", priority: 0.5 },
    {
      url: `${base}/suggest-clinic`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const clinicPages: MetadataRoute.Sitemap = (clinics ?? []).map((c) => ({
    url: `${base}/clinics/${c.slug}`,
    lastModified: c.updated_at ? new Date(c.updated_at) : undefined,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const servicePages: MetadataRoute.Sitemap = (services ?? []).map((s) => ({
    url: `${base}/services/${s.slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const seen = new Set<string>();
  const locationPages: MetadataRoute.Sitemap = [];
  for (const loc of locations ?? []) {
    const provinceUrl = `${base}/locations/${loc.province_slug}`;
    if (!seen.has(provinceUrl)) {
      seen.add(provinceUrl);
      locationPages.push({
        url: provinceUrl,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
    if (loc.city_slug) {
      const cityUrl = `${provinceUrl}/${loc.city_slug}`;
      if (!seen.has(cityUrl)) {
        seen.add(cityUrl);
        locationPages.push({
          url: cityUrl,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }
  }

  return [...staticPages, ...clinicPages, ...servicePages, ...locationPages];
}
