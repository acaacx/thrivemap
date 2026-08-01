"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/modules/auth/server";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import { canEditDirectly } from "./server";
import {
  portalHoursSchema,
  portalImageSchema,
  portalProfileSchema,
  portalServicesSchema,
} from "./schemas";

export interface PortalActionResult {
  error?: string;
  message?: string;
}

/**
 * Shared guard for portal actions: signed-in user with an active manager
 * grant on the clinic. Returns the clinic row for policy decisions.
 */
async function requireManagerAccess(clinicId: string) {
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

function revalidateClinic(slug: string, clinicId: string) {
  revalidatePath(`/clinics/${slug}`);
  revalidatePath(`/clinic-portal/${clinicId}`, "layout");
}

/**
 * Profile edits: verified clinics update directly (audited by the clinics
 * audit trigger); unverified published clinics flow through a change request
 * for moderation.
 */
export async function updateClinicProfile(
  clinicId: string,
  raw: unknown,
): Promise<PortalActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { user, supabase, clinic } = access;

  const parsed = portalProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please review the form." };
  }

  const limited = await checkRateLimit("portal-edit", user.id, 30, 3600);
  if (!limited.allowed) return { error: "Too many edits in a short time. Please try again later." };

  const next = {
    description: parsed.data.description || null,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    website: parsed.data.website || null,
    offers_online_services: parsed.data.offers_online_services,
    offers_in_person_services: parsed.data.offers_in_person_services,
    wheelchair_accessible: parsed.data.wheelchair_accessible,
    accessibility_notes: parsed.data.accessibility_notes || null,
  };

  if (canEditDirectly(clinic.status)) {
    const { error } = await supabase
      .from("clinics")
      .update({ ...next, updated_by: user.id })
      .eq("id", clinicId);
    if (error) {
      console.error("updateClinicProfile failed:", error.message);
      return { error: "Could not save changes. Please try again." };
    }
    revalidateClinic(clinic.slug, clinicId);
    return { message: "Changes published." };
  }

  // Unverified listing: route the edit through moderation.
  const { data: current } = await supabase
    .from("clinics")
    .select(
      "description, phone, email, website, offers_online_services, offers_in_person_services, wheelchair_accessible, accessibility_notes",
    )
    .eq("id", clinicId)
    .single();
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(next)) {
    const from = current?.[key as keyof typeof current] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }
  if (Object.keys(changes).length === 0) return { message: "No changes to save." };

  const { error } = await supabase.from("clinic_change_requests").insert({
    clinic_id: clinicId,
    requested_by: user.id,
    changes: JSON.parse(JSON.stringify(changes)),
    message: "Submitted from the clinic portal.",
  });
  if (error) {
    console.error("updateClinicProfile change request failed:", error.message);
    return { error: "Could not submit changes. Please try again." };
  }
  return {
    message:
      "Changes submitted for review. They'll go live once a moderator approves them — verified clinics can edit directly.",
  };
}

/** Service list edits apply directly for verified clinics; otherwise moderated. */
export async function updateClinicServices(
  clinicId: string,
  raw: unknown,
): Promise<PortalActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { user, supabase, clinic } = access;

  const parsed = portalServicesSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Choose at least one service." };
  }

  if (!canEditDirectly(clinic.status)) {
    const { error } = await supabase.from("clinic_change_requests").insert({
      clinic_id: clinicId,
      requested_by: user.id,
      changes: { service_ids: { from: null, to: parsed.data.service_ids } },
      message: "Service list update from the clinic portal.",
    });
    if (error) return { error: "Could not submit changes. Please try again." };
    return { message: "Service changes submitted for review." };
  }

  const { data: existing } = await supabase
    .from("clinic_services")
    .select("service_id")
    .eq("clinic_id", clinicId);
  const existingIds = new Set((existing ?? []).map((row) => row.service_id));
  const nextIds = new Set(parsed.data.service_ids);

  const toAdd = [...nextIds].filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !nextIds.has(id));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("clinic_services")
      .insert(toAdd.map((service_id) => ({ clinic_id: clinicId, service_id })));
    if (error) return { error: "Could not save services. Please try again." };
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("clinic_services")
      .delete()
      .eq("clinic_id", clinicId)
      .in("service_id", toRemove);
    if (error) return { error: "Could not save services. Please try again." };
  }
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Services updated." };
}

/** Opening hours replace-all write; verified clinics only edit directly. */
export async function updateClinicHours(
  clinicId: string,
  raw: unknown,
): Promise<PortalActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { user, supabase, clinic } = access;

  const parsed = portalHoursSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please review the hours." };
  }

  if (!canEditDirectly(clinic.status)) {
    const { error } = await supabase.from("clinic_change_requests").insert({
      clinic_id: clinicId,
      requested_by: user.id,
      changes: { hours: { from: null, to: parsed.data.hours } },
      message: "Opening hours update from the clinic portal.",
    });
    if (error) return { error: "Could not submit changes. Please try again." };
    return { message: "Hours submitted for review." };
  }

  const { error: deleteError } = await supabase
    .from("clinic_hours")
    .delete()
    .eq("clinic_id", clinicId);
  if (deleteError) return { error: "Could not save hours. Please try again." };

  const { error } = await supabase.from("clinic_hours").insert(
    parsed.data.hours.map((row) => ({
      clinic_id: clinicId,
      day_of_week: row.day_of_week,
      is_closed: row.is_closed,
      opens_at: row.is_closed ? null : row.opens_at,
      closes_at: row.is_closed ? null : row.closes_at,
    })),
  );
  if (error) {
    console.error("updateClinicHours failed:", error.message);
    return { error: "Could not save hours. Please try again." };
  }
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Hours updated." };
}

/** Records an image the client uploaded to clinic-images/<clinic_id>/... */
export async function recordClinicImage(raw: unknown): Promise<PortalActionResult> {
  const parsed = portalImageSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid image details." };

  const access = await requireManagerAccess(parsed.data.clinic_id);
  if ("error" in access) return { error: access.error };
  const { user, supabase, clinic } = access;

  if (!parsed.data.storage_path.startsWith(`${clinic.id}/`)) {
    return { error: "Invalid image path." };
  }

  const { error } = await supabase.from("clinic_images").insert({
    clinic_id: clinic.id,
    storage_path: parsed.data.storage_path,
    alt_text: parsed.data.alt_text,
    kind: parsed.data.kind,
    uploaded_by: user.id,
  });
  if (error) {
    console.error("recordClinicImage failed:", error.message);
    return { error: "Could not save the image. Please try again." };
  }
  revalidateClinic(clinic.slug, clinic.id);
  return { message: "Image added." };
}

export async function deleteClinicImage(
  clinicId: string,
  imageId: string,
): Promise<PortalActionResult> {
  const access = await requireManagerAccess(clinicId);
  if ("error" in access) return { error: access.error };
  const { supabase, clinic } = access;

  const { data: image } = await supabase
    .from("clinic_images")
    .select("id, storage_path")
    .eq("id", imageId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!image) return { error: "Image not found." };

  const { error } = await supabase
    .from("clinic_images")
    .delete()
    .eq("id", imageId)
    .eq("clinic_id", clinicId);
  if (error) return { error: "Could not remove the image. Please try again." };

  await supabase.storage.from("clinic-images").remove([image.storage_path]);
  revalidateClinic(clinic.slug, clinicId);
  return { message: "Image removed." };
}
