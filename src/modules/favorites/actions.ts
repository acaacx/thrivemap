"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/server";

const clinicIdSchema = z.string().uuid();

export async function saveFavorite(clinicId: string): Promise<{ error?: string }> {
  const parsed = clinicIdSchema.safeParse(clinicId);
  if (!parsed.success) return { error: "Invalid clinic." };
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("favorites")
    .upsert({ user_id: user.id, clinic_id: parsed.data });
  if (error) {
    console.error("saveFavorite failed:", error.message);
    return { error: "Could not save favorite. Please try again." };
  }
  revalidatePath("/account/favorites");
  return {};
}

export async function removeFavorite(clinicId: string): Promise<{ error?: string }> {
  const parsed = clinicIdSchema.safeParse(clinicId);
  if (!parsed.success) return { error: "Invalid clinic." };
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("clinic_id", parsed.data);
  if (error) {
    console.error("removeFavorite failed:", error.message);
    return { error: "Could not remove favorite. Please try again." };
  }
  revalidatePath("/account/favorites");
  return {};
}
