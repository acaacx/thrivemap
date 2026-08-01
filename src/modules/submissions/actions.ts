"use server";

import {
  createSupabaseAnonClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/modules/auth/server";
import { enqueueJob } from "@/modules/jobs/queue";
import { enqueueUserEmail } from "@/modules/jobs/notify";
import { checkRateLimit, getClientIp } from "@/modules/shared/rate-limit";
import {
  changeRequestSchema,
  reportClinicSchema,
  suggestClinicSchema,
} from "./schemas";

export interface ActionResult {
  error?: string;
  message?: string;
}

export interface DuplicateMatch {
  slug: string;
  name: string;
  city: string | null;
  status: string;
}

/**
 * Pre-submission duplicate check: fuzzy name match (and proximity when a pin
 * was set) against published clinics so users can review before suggesting.
 */
export async function findLikelyDuplicates(input: {
  name: string;
  latitude?: number;
  longitude?: number;
}): Promise<DuplicateMatch[]> {
  if (input.name.trim().length < 3) return [];
  const supabase = createSupabaseAnonClient();
  const { data } = await supabase.rpc("search_clinics", {
    p_query: input.name.trim(),
    p_lat: input.latitude,
    p_lng: input.longitude,
    p_radius_km: input.latitude != null ? 5 : undefined,
    p_limit: 5,
  });
  return (data ?? []).map((row) => ({
    slug: row.slug,
    name: row.name,
    city: row.city,
    status: row.status,
  }));
}

export async function submitClinic(raw: unknown): Promise<ActionResult> {
  const parsed = suggestClinicSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }

  const user = await getCurrentUser();
  const identifier = user?.id ?? (await getClientIp());
  const limited = await checkRateLimit("submit-clinic", identifier, 5, 3600);
  if (!limited.allowed) {
    return {
      error: "Too many suggestions in a short time. Please try again later.",
    };
  }

  const input = parsed.data;
  // Admin client: RLS blocks anonymous submitters from reading back the row
  // (`returning` needs select), and we need the id to queue processing.
  const supabase = createSupabaseAdminClient();
  const { data: created, error } = await supabase
    .from("clinic_submissions")
    .insert({
      submitted_by: user?.id ?? null,
      submitter_email: input.submitter_email || user?.email || null,
      clinic_name: input.clinic_name,
      address: input.address,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      phone: input.phone || null,
      email: input.email || null,
      website: input.website || null,
      social_media_url: input.social_media_url || null,
      service_slugs: input.service_slugs,
      notes: input.notes || null,
      reference_links: input.reference_links
        ? input.reference_links.split(/\s+/).filter(Boolean).slice(0, 10)
        : [],
      consent_given: true,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("submitClinic failed:", error?.message);
    return { error: "Could not submit right now. Please try again." };
  }
  await enqueueJob(
    "submission_process",
    { submission_id: created.id },
    { idempotencyKey: `submission-process-${created.id}` },
  );
  return {
    message:
      "Thank you! Your suggestion is with our moderators. We'll review it and publish it as an unverified listing once checked.",
  };
}

export async function submitClinicReport(raw: unknown): Promise<ActionResult> {
  const parsed = reportClinicSchema.safeParse(raw);
  if (!parsed.success)
    return { error: "Please choose what's wrong and try again." };

  const user = await getCurrentUser();
  const identifier = user?.id ?? (await getClientIp());
  const limited = await checkRateLimit("report-clinic", identifier, 10, 3600);
  if (!limited.allowed) {
    return {
      error: "Too many reports in a short time. Please try again later.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("clinic_reports").insert({
    clinic_id: parsed.data.clinic_id,
    reported_by: user?.id ?? null,
    report_type: parsed.data.report_type,
    details: parsed.data.details || null,
  });
  if (error) {
    console.error("submitClinicReport failed:", error.message);
    return { error: "Could not send the report right now. Please try again." };
  }
  if (user) {
    const { data: clinic } = await supabase
      .from("clinics")
      .select("name")
      .eq("id", parsed.data.clinic_id)
      .maybeSingle();
    await enqueueUserEmail(user.id, "reportAcknowledged", {
      clinicName: clinic?.name ?? "a clinic",
    });
  }
  return {
    message: "Report received — thank you for helping keep listings accurate.",
  };
}

export async function submitChangeRequest(raw: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to suggest a correction." };

  const parsed = changeRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }

  const limited = await checkRateLimit("change-request", user.id, 10, 3600);
  if (!limited.allowed) {
    return {
      error: "Too many requests in a short time. Please try again later.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("clinic_change_requests").insert({
    clinic_id: parsed.data.clinic_id,
    requested_by: user.id,
    message: parsed.data.message,
    changes: parsed.data.field_hint
      ? { field_hint: parsed.data.field_hint }
      : {},
  });
  if (error) {
    console.error("submitChangeRequest failed:", error.message);
    return { error: "Could not send the request right now. Please try again." };
  }
  return { message: "Correction request sent. Our moderators will review it." };
}
