"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/server";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import { ratingInputSchema } from "./schemas";

const RATE_LIMIT = { key: "rating-edit", max: 20, windowSeconds: 3600 };
const clinicIdSchema = z.uuid();

export interface RatingActionResult {
  error?: string;
  message?: string;
}

export async function upsertRating(
  clinicId: string,
  slug: string,
  raw: unknown,
): Promise<RatingActionResult> {
  const idParsed = clinicIdSchema.safeParse(clinicId);
  if (!idParsed.success) return { error: "Invalid clinic." };
  const parsed = ratingInputSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please rate all four areas from 1 to 5." };

  const user = await requireUser();
  const limited = await checkRateLimit(
    RATE_LIMIT.key,
    user.id,
    RATE_LIMIT.max,
    RATE_LIMIT.windowSeconds,
  );
  if (!limited.allowed)
    return { error: "Too many rating changes in a short time. Please try again later." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("clinic_ratings").upsert(
    {
      clinic_id: idParsed.data,
      user_id: user.id,
      communication: parsed.data.communication,
      sensory_friendliness: parsed.data.sensoryFriendliness,
      affirming_approach: parsed.data.affirmingApproach,
      scheduling: parsed.data.scheduling,
    },
    { onConflict: "clinic_id,user_id" },
  );
  if (error) {
    console.error("upsertRating failed:", error.message);
    return { error: "Could not save your rating. Please try again." };
  }
  revalidatePath(`/clinics/${slug}`);
  return { message: "Rating saved." };
}

export async function deleteRating(
  clinicId: string,
  slug: string,
): Promise<RatingActionResult> {
  const idParsed = clinicIdSchema.safeParse(clinicId);
  if (!idParsed.success) return { error: "Invalid clinic." };
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clinic_ratings")
    .delete()
    .eq("clinic_id", idParsed.data)
    .eq("user_id", user.id);
  if (error) {
    console.error("deleteRating failed:", error.message);
    return { error: "Could not remove your rating. Please try again." };
  }
  revalidatePath(`/clinics/${slug}`);
  return { message: "Rating removed." };
}
