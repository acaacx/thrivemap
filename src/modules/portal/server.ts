import "server-only";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, requireUser } from "@/modules/auth/server";

/** Clinics the signed-in user manages (active grants only). */
export async function getManagedClinics() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinic_managers")
    .select("clinic_id, clinics(id, slug, name, status, last_verified_at)")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });
  return (data ?? [])
    .map((row) => row.clinics)
    .filter((clinic): clinic is NonNullable<typeof clinic> => clinic != null);
}

/**
 * Loads one managed clinic with editable relations, or 404s when the user
 * does not manage it. Every portal page and action goes through this.
 */
export async function requireManagedClinic(clinicId: string) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: grant } = await supabase
    .from("clinic_managers")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (!grant) notFound();

  const { data: clinic } = await supabase
    .from("clinics")
    .select(
      `*,
       clinic_locations(*),
       clinic_hours(*),
       clinic_images(*),
       clinic_therapists(*),
       clinic_services(service_id, delivery, notes, services(id, slug, name))`,
    )
    .eq("id", clinicId)
    .maybeSingle();
  if (!clinic) notFound();
  return { user, clinic };
}

/** True when portal edits apply directly; false → edits become change requests. */
export function canEditDirectly(status: string): boolean {
  return status === "published_verified";
}

/**
 * Guard for portal server actions: signed-in user with an active manager
 * grant on the clinic. Returns { error } instead of throwing/404 so actions
 * can surface the message in the form.
 */
export async function requireManagerAccess(clinicId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to manage your clinic." as const };

  const supabase = await createSupabaseServerClient();
  const { data: grant } = await supabase
    .from("clinic_managers")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (!grant) return { error: "You don't manage this clinic." as const };

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, slug, status")
    .eq("id", clinicId)
    .maybeSingle();
  if (!clinic) return { error: "Clinic not found." as const };

  return { user, supabase, clinic };
}
