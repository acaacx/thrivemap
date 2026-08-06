"use server";

import { revalidatePath } from "next/cache";
import { invalidateClinicCaches } from "@/modules/shared/cache";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import { requireManagerAccess } from "@/modules/portal/server";
import {
  moveTherapistSchema,
  therapistInputSchema,
  therapistPhotoSchema,
} from "./schemas";

export interface TherapistActionResult {
  error?: string;
  message?: string;
}

const RATE_LIMIT = { key: "therapist-edit", max: 60, windowSeconds: 3600 };

function revalidateClinic(slug: string, clinicId: string) {
  revalidatePath(`/clinics/${slug}`);
  revalidatePath(`/clinic-portal/${clinicId}`, "layout");
  void invalidateClinicCaches();
}

/** Storage prefix every therapist photo for a clinic must live under. */
function photoPrefix(clinicId: string) {
  return `${clinicId}/therapists/`;
}

export async function createTherapist(
  clinicId: string,
  raw: unknown,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { user, supabase, clinic } = access;

  const parsed = therapistInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }

  const limited = await checkRateLimit(
    RATE_LIMIT.key,
    user.id,
    RATE_LIMIT.max,
    RATE_LIMIT.windowSeconds,
  );
  if (!limited.allowed)
    return { error: "Too many edits in a short time. Please try again later." };

  const { data: last } = await supabase
    .from("clinic_therapists")
    .select("display_order")
    .eq("clinic_id", clinicId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("clinic_therapists").insert({
    clinic_id: clinicId,
    full_name: parsed.data.full_name,
    credentials: parsed.data.credentials ?? null,
    profession: parsed.data.profession,
    specialties: parsed.data.specialties,
    bio: parsed.data.bio ?? null,
    display_order: (last?.display_order ?? -1) + 1,
  });
  if (error) {
    console.error("createTherapist failed:", error.message);
    return { error: "Could not add the team member. Please try again." };
  }
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Team member added." };
}

export async function updateTherapist(
  clinicId: string,
  therapistId: string,
  raw: unknown,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { user, supabase, clinic } = access;

  const parsed = therapistInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }

  const limited = await checkRateLimit(
    RATE_LIMIT.key,
    user.id,
    RATE_LIMIT.max,
    RATE_LIMIT.windowSeconds,
  );
  if (!limited.allowed)
    return { error: "Too many edits in a short time. Please try again later." };

  const { error, count } = await supabase
    .from("clinic_therapists")
    .update(
      {
        full_name: parsed.data.full_name,
        credentials: parsed.data.credentials ?? null,
        profession: parsed.data.profession,
        specialties: parsed.data.specialties,
        bio: parsed.data.bio ?? null,
      },
      { count: "exact" },
    )
    .eq("id", therapistId)
    .eq("clinic_id", clinicId);
  if (error) {
    console.error("updateTherapist failed:", error.message);
    return { error: "Could not save changes. Please try again." };
  }
  if (count === 0) return { error: "Team member not found." };
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Changes published." };
}

export async function deleteTherapist(
  clinicId: string,
  therapistId: string,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { supabase, clinic } = access;

  const { data: row } = await supabase
    .from("clinic_therapists")
    .select("id, photo_path")
    .eq("id", therapistId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!row) return { error: "Team member not found." };

  const { error } = await supabase
    .from("clinic_therapists")
    .delete()
    .eq("id", therapistId)
    .eq("clinic_id", clinicId);
  if (error) {
    console.error("deleteTherapist failed:", error.message);
    return { error: "Could not remove the team member. Please try again." };
  }
  if (row.photo_path) {
    await supabase.storage.from("clinic-images").remove([row.photo_path]);
  }
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Team member removed." };
}

/** Swaps display_order with the neighbor in the given direction. */
export async function moveTherapist(
  clinicId: string,
  raw: unknown,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { supabase, clinic } = access;

  const parsed = moveTherapistSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid reorder request." };
  const { therapist_id, direction } = parsed.data;

  const { data: rows } = await supabase
    .from("clinic_therapists")
    .select("id, display_order")
    .eq("clinic_id", clinicId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  const list = rows ?? [];
  const index = list.findIndex((r) => r.id === therapist_id);
  if (index === -1) return { error: "Team member not found." };
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= list.length)
    return { message: "Order unchanged." };

  // Two updates; display_order values may be equal (legacy rows), so assign
  // explicit positions rather than swapping possibly-identical numbers.
  const a = list[index];
  const b = list[swapWith];
  const { error: e1 } = await supabase
    .from("clinic_therapists")
    .update({ display_order: swapWith })
    .eq("id", a.id)
    .eq("clinic_id", clinicId);
  const { error: e2 } = await supabase
    .from("clinic_therapists")
    .update({ display_order: index })
    .eq("id", b.id)
    .eq("clinic_id", clinicId);
  if (e1 || e2) {
    console.error("moveTherapist failed:", (e1 ?? e2)!.message);
    return { error: "Could not reorder. Please try again." };
  }
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Order updated." };
}

/** Records a photo the client uploaded to clinic-images/<clinicId>/therapists/... */
export async function setTherapistPhoto(
  clinicId: string,
  raw: unknown,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { supabase, clinic } = access;

  const parsed = therapistPhotoSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid photo details." };
  if (!parsed.data.storage_path.startsWith(photoPrefix(clinicId))) {
    return { error: "Invalid photo path." };
  }

  const { data: row } = await supabase
    .from("clinic_therapists")
    .select("id, photo_path")
    .eq("id", parsed.data.therapist_id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!row) return { error: "Team member not found." };

  const { error } = await supabase
    .from("clinic_therapists")
    .update({ photo_path: parsed.data.storage_path })
    .eq("id", row.id)
    .eq("clinic_id", clinicId);
  if (error) {
    console.error("setTherapistPhoto failed:", error.message);
    return { error: "Could not save the photo. Please try again." };
  }
  if (row.photo_path && row.photo_path !== parsed.data.storage_path) {
    await supabase.storage.from("clinic-images").remove([row.photo_path]);
  }
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Photo updated." };
}

export async function removeTherapistPhoto(
  clinicId: string,
  therapistId: string,
): Promise<TherapistActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { supabase, clinic } = access;

  const { data: row } = await supabase
    .from("clinic_therapists")
    .select("id, photo_path")
    .eq("id", therapistId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!row) return { error: "Team member not found." };
  if (!row.photo_path) return { message: "No photo to remove." };

  const { error } = await supabase
    .from("clinic_therapists")
    .update({ photo_path: null })
    .eq("id", row.id)
    .eq("clinic_id", clinicId);
  if (error) {
    console.error("removeTherapistPhoto failed:", error.message);
    return { error: "Could not remove the photo. Please try again." };
  }
  await supabase.storage.from("clinic-images").remove([row.photo_path]);
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Photo removed." };
}
