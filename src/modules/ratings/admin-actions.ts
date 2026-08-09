"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireModerator } from "@/modules/admin/server";
import type { AdminActionResult } from "@/modules/admin/actions";

const ratingIdSchema = z.uuid();

/**
 * Voiding/unvoiding only ever happens through this service-role path — user
 * RLS has no way to touch voided_at/voided_by. The clinic_ratings audit
 * trigger fires on every write (including service-role), so there's no
 * manual audit_logs insert here.
 */
async function revalidateRatingPaths(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  clinicId: string,
) {
  revalidatePath(`/admin/clinics/${clinicId}`);
  const { data: clinic } = await admin
    .from("clinics")
    .select("slug")
    .eq("id", clinicId)
    .maybeSingle();
  if (clinic?.slug) revalidatePath(`/clinics/${clinic.slug}`);
}

export async function voidRating(ratingId: string): Promise<AdminActionResult> {
  const parsed = ratingIdSchema.safeParse(ratingId);
  if (!parsed.success) return { error: "Invalid rating." };
  const { user } = await requireModerator();
  const admin = createSupabaseAdminClient();

  const { data: rating } = await admin
    .from("clinic_ratings")
    .select("clinic_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!rating) return { error: "Rating not found." };

  const { error } = await admin
    .from("clinic_ratings")
    .update({ voided_at: new Date().toISOString(), voided_by: user.id })
    .eq("id", parsed.data);
  if (error) {
    console.error("voidRating failed:", error.message);
    return { error: "Could not void the rating." };
  }

  await revalidateRatingPaths(admin, rating.clinic_id);
  return { message: "Rating voided." };
}

export async function unvoidRating(
  ratingId: string,
): Promise<AdminActionResult> {
  const parsed = ratingIdSchema.safeParse(ratingId);
  if (!parsed.success) return { error: "Invalid rating." };
  await requireModerator();
  const admin = createSupabaseAdminClient();

  const { data: rating } = await admin
    .from("clinic_ratings")
    .select("clinic_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!rating) return { error: "Rating not found." };

  const { error } = await admin
    .from("clinic_ratings")
    .update({ voided_at: null, voided_by: null })
    .eq("id", parsed.data);
  if (error) {
    console.error("unvoidRating failed:", error.message);
    return { error: "Could not restore the rating." };
  }

  await revalidateRatingPaths(admin, rating.clinic_id);
  return { message: "Rating restored." };
}
