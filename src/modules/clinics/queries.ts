import "server-only";
import { createSupabaseAnonClient } from "@/lib/supabase/server";
import { cachedClinicData, roundCoord } from "@/modules/shared/cache";
import { decodeCursor, encodeCursor } from "@/modules/search/cursor";
import type { SearchParams } from "@/modules/search/schemas";
import type { Database } from "@/lib/database.types";

export type ClinicSearchRow =
  Database["public"]["Functions"]["search_clinics"]["Returns"][number];
export type MapClinicRow =
  Database["public"]["Functions"]["get_map_clinics"]["Returns"][number];

export interface ClinicSearchResult {
  clinics: ClinicSearchRow[];
  nextCursor: string | null;
}

const PAGE_SIZE = 20;

export async function searchClinics(
  params: SearchParams,
): Promise<ClinicSearchResult> {
  // Coordinates are rounded in the key so nearby searches share entries.
  const key = [
    "search",
    roundCoord(params.lat),
    roundCoord(params.lng),
    params.radius ?? "-",
    roundCoord(params.north),
    roundCoord(params.south),
    roundCoord(params.east),
    roundCoord(params.west),
    params.q ?? "-",
    (params.services ?? []).join(","),
    (params.ages ?? []).join(","),
    params.verified ? 1 : 0,
    params.online ? 1 : 0,
    params.inperson ? 1 : 0,
    params.open ? 1 : 0,
    params.accessible ? 1 : 0,
    params.sort,
    params.cursor ?? "-",
  ].join("|");
  // open_now results depend on the clock — short TTL keeps them honest.
  return cachedClinicData(key, params.open ? 30 : 60, () =>
    searchClinicsUncached(params),
  );
}

async function searchClinicsUncached(
  params: SearchParams,
): Promise<ClinicSearchResult> {
  const supabase = createSupabaseAnonClient();
  const cursor = decodeCursor(params.cursor);

  const { data, error } = await supabase.rpc("search_clinics", {
    p_lat: params.lat,
    p_lng: params.lng,
    p_radius_km: params.radius,
    p_north: params.north,
    p_south: params.south,
    p_east: params.east,
    p_west: params.west,
    p_query: params.q,
    p_service_slugs: params.services?.length ? params.services : undefined,
    p_age_groups: params.ages?.length
      ? (params.ages as Database["public"]["Enums"]["age_group"][])
      : undefined,
    p_verified_only: params.verified ?? false,
    p_online_services: params.online ? true : undefined,
    p_in_person_services: params.inperson ? true : undefined,
    p_open_now: params.open ?? false,
    p_accessible_only: params.accessible ?? false,
    p_sort: params.sort,
    p_cursor_value: typeof cursor?.v === "number" ? cursor.v : undefined,
    p_cursor_text: typeof cursor?.v === "string" ? cursor.v : undefined,
    p_cursor_id: cursor?.id,
    p_limit: PAGE_SIZE + 1,
  });

  if (error) {
    throw new Error(`searchClinics failed: ${error.message}`);
  }

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page[page.length - 1];

  // Every sort mode is keyset-paginated: the RPC returns the key it ordered
  // by — sort_text for `alphabetical`, sort_value for the rest.
  const cursorValue = last ? (last.sort_text ?? last.sort_value) : null;

  return {
    clinics: page,
    nextCursor:
      hasMore && last && cursorValue != null
        ? encodeCursor({ v: cursorValue, id: last.clinic_id })
        : null,
  };
}

export async function getMapClinics(bounds: {
  north: number;
  south: number;
  east: number;
  west: number;
  services?: string[];
  verifiedOnly?: boolean;
}): Promise<MapClinicRow[]> {
  const key = [
    "map",
    roundCoord(bounds.north),
    roundCoord(bounds.south),
    roundCoord(bounds.east),
    roundCoord(bounds.west),
    (bounds.services ?? []).join(","),
    bounds.verifiedOnly ? 1 : 0,
  ].join("|");
  return cachedClinicData(key, 60, () => getMapClinicsUncached(bounds));
}

async function getMapClinicsUncached(bounds: {
  north: number;
  south: number;
  east: number;
  west: number;
  services?: string[];
  verifiedOnly?: boolean;
}): Promise<MapClinicRow[]> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.rpc("get_map_clinics", {
    p_north: bounds.north,
    p_south: bounds.south,
    p_east: bounds.east,
    p_west: bounds.west,
    p_service_slugs: bounds.services?.length ? bounds.services : undefined,
    p_verified_only: bounds.verifiedOnly ?? false,
  });
  if (error) throw new Error(`getMapClinics failed: ${error.message}`);
  return data ?? [];
}

export async function getClinicBySlug(slug: string) {
  return cachedClinicData(`profile|${slug}`, 300, () =>
    getClinicBySlugUncached(slug),
  );
}

async function getClinicBySlugUncached(slug: string) {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("clinics")
    .select(
      `
      *,
      clinic_locations (*),
      clinic_hours (*),
      clinic_services (
        delivery, notes,
        services ( slug, name, short_description )
      ),
      clinic_age_groups ( age_group ),
      clinic_languages ( language ),
      clinic_social_links ( platform, url ),
      clinic_contact_methods ( kind, value, label, sort_order ),
      clinic_images ( storage_path, alt_text, kind, sort_order ),
      clinic_therapists ( id, full_name, credentials, profession, specialties, bio, photo_path, display_order, created_at )
    `,
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`getClinicBySlug failed: ${error.message}`);
  return data;
}

export type ClinicProfile = NonNullable<
  Awaited<ReturnType<typeof getClinicBySlug>>
>;

export async function getFeaturedClinics(limit = 6) {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("clinics")
    .select(
      `
      id, slug, name, description, logo_url, status, last_verified_at,
      offers_online_services, wheelchair_accessible,
      clinic_locations ( city, province ),
      clinic_services ( services ( slug, name ) )
    `,
    )
    .eq("is_featured", true)
    .eq("status", "published_verified")
    .is("deleted_at", null)
    .limit(limit);
  if (error) throw new Error(`getFeaturedClinics failed: ${error.message}`);
  return data ?? [];
}

export async function getServices() {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(`getServices failed: ${error.message}`);
  return data ?? [];
}

export async function getServiceBySlug(slug: string) {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getServiceBySlug failed: ${error.message}`);
  return data;
}

export async function getLocationsDirectory() {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("ph_locations")
    .select("province, province_slug, city, city_slug, kind")
    .order("province")
    .order("city");
  if (error) throw new Error(`getLocationsDirectory failed: ${error.message}`);
  return data ?? [];
}

export async function getClinicsByLocation(
  provinceSlug: string,
  citySlug?: string,
) {
  const supabase = createSupabaseAnonClient();
  let query = supabase
    .from("clinic_locations")
    .select(
      `
      city, city_slug, province, province_slug, address_line1, barangay,
      clinics!inner (
        id, slug, name, description, logo_url, status, last_verified_at,
        offers_online_services, wheelchair_accessible,
        clinic_services ( services ( slug, name ) )
      )
    `,
    )
    .eq("province_slug", provinceSlug)
    .eq("is_primary", true);
  if (citySlug) query = query.eq("city_slug", citySlug);
  const { data, error } = await query.order("city_slug");
  if (error) throw new Error(`getClinicsByLocation failed: ${error.message}`);
  return data ?? [];
}
