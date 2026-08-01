"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/modules/auth/server";

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Enter a display name.").max(80),
});

export interface ProfileFormState {
  error?: string;
  message?: string;
}

export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.display_name })
    .eq("id", user.id);
  if (error) return { error: "Could not update profile. Please try again." };
  revalidatePath("/account");
  return { message: "Profile updated." };
}
