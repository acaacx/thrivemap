"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertTransition } from "@/modules/clinics/lifecycle";
import { runDuplicateScan } from "@/modules/jobs/handlers";
import { enqueueJob } from "@/modules/jobs/queue";
import { requireAdministrator, requireModerator } from "./server";
import type { Database } from "@/lib/database.types";

type AppRole = Database["public"]["Enums"]["app_role"];
type ListingStatus = Database["public"]["Enums"]["listing_status"];

export interface AdminActionResult {
  error?: string;
  message?: string;
}

/** Every moderation decision writes an admin_actions row (append-only). */
async function logAdminAction(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  reason: string | null,
  metadata: Record<string, unknown> = {},
) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("admin_actions").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    reason,
    metadata: JSON.parse(JSON.stringify(metadata)),
  });
  if (error) console.error("logAdminAction failed:", error.message);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// Submissions

export async function approveSubmission(
  submissionId: string,
  reason?: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: submission } = await supabase
    .from("clinic_submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return { error: "Submission not found." };
  if (!["submitted", "under_review", "additional_information_required"].includes(submission.status)) {
    return { error: "This submission was already decided." };
  }
  if (submission.latitude == null || submission.longitude == null) {
    return {
      error:
        "Submission has no map pin — request more information from the submitter first.",
    };
  }

  const { data: nearest } = await admin.rpc("nearest_ph_city", {
    p_lat: submission.latitude,
    p_lng: submission.longitude,
  });
  const city = nearest?.[0];
  if (!city) return { error: "Could not resolve a city for the map pin." };

  // Unique slug: base name, then -2, -3… on collision.
  const base = slugify(submission.clinic_name) || "clinic";
  let slug = base;
  for (let attempt = 2; attempt < 20; attempt += 1) {
    const { data: taken } = await admin
      .from("clinics")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!taken) break;
    slug = `${base}-${attempt}`;
  }

  const { data: clinic, error: clinicError } = await admin
    .from("clinics")
    .insert({
      slug,
      name: submission.clinic_name,
      status: "published_unverified",
      source_type: "user_submission",
      phone: submission.phone,
      email: submission.email,
      website: submission.website,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, slug")
    .single();
  if (clinicError || !clinic) {
    console.error("approveSubmission clinic insert failed:", clinicError?.message);
    return { error: "Could not create the clinic listing." };
  }

  const { error: locationError } = await admin.from("clinic_locations").insert({
    clinic_id: clinic.id,
    is_primary: true,
    address_line1: submission.address,
    city: city.city ?? "",
    city_slug: city.city_slug ?? "",
    province: city.province,
    province_slug: city.province_slug,
    location: `POINT(${submission.longitude} ${submission.latitude})`,
  });
  if (locationError) {
    console.error("approveSubmission location insert failed:", locationError.message);
    return { error: "Clinic created but its location failed — fix it manually." };
  }

  if (submission.service_slugs.length > 0) {
    const { data: services } = await admin
      .from("services")
      .select("id, slug")
      .in("slug", submission.service_slugs);
    if (services && services.length > 0) {
      await admin
        .from("clinic_services")
        .insert(services.map((s) => ({ clinic_id: clinic.id, service_id: s.id })));
    }
  }

  const { error: updateError } = await supabase
    .from("clinic_submissions")
    .update({
      status: "approved",
      created_clinic_id: clinic.id,
      review_reason: reason || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  if (updateError) {
    console.error("approveSubmission status update failed:", updateError.message);
    return { error: "Clinic created but the submission status did not update." };
  }

  await logAdminAction(user.id, "approve_submission", "clinic_submission", submissionId, reason ?? null, {
    created_clinic_id: clinic.id,
  });
  await enqueueJob(
    "duplicate_scan",
    { clinic_id: clinic.id },
    { idempotencyKey: `duplicate-scan-${clinic.id}` },
  );

  revalidatePath("/admin/submissions");
  revalidatePath("/clinics");
  return { message: `Published as /clinics/${clinic.slug} (unverified).` };
}

export async function requestSubmissionInfo(
  submissionId: string,
  message: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  if (!message.trim()) return { error: "Write what you need from the submitter." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clinic_submissions")
    .update({
      status: "additional_information_required",
      review_reason: message.trim(),
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  if (error) return { error: "Could not update the submission." };
  await logAdminAction(user.id, "request_submission_info", "clinic_submission", submissionId, message.trim());
  revalidatePath("/admin/submissions");
  return { message: "Marked as needing more information." };
}

export async function rejectSubmission(
  submissionId: string,
  reason: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  if (!reason.trim()) return { error: "A reason is required to reject." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clinic_submissions")
    .update({
      status: "rejected",
      review_reason: reason.trim(),
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  if (error) return { error: "Could not update the submission." };
  await logAdminAction(user.id, "reject_submission", "clinic_submission", submissionId, reason.trim());
  revalidatePath("/admin/submissions");
  return { message: "Submission rejected." };
}

// ---------------------------------------------------------------------------
// Claims

export async function getClaimDocumentUrl(
  documentId: string,
): Promise<AdminActionResult & { url?: string }> {
  const { user } = await requireModerator();
  const admin = createSupabaseAdminClient();

  const { data: doc } = await admin
    .from("clinic_claim_documents")
    .select("id, claim_id, storage_path, original_filename")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { error: "Document not found." };

  const { data: signed, error } = await admin.storage
    .from("claim-documents")
    .createSignedUrl(doc.storage_path, 60);
  if (error || !signed) {
    console.error("getClaimDocumentUrl failed:", error?.message);
    return { error: "Could not create a document link." };
  }

  // Access to verification documents is always audited.
  await logAdminAction(user.id, "view_claim_document", "clinic_claim_document", doc.id, null, {
    claim_id: doc.claim_id,
    filename: doc.original_filename,
  });
  return { url: signed.signedUrl };
}

export async function approveClaim(
  claimId: string,
  reason?: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const admin = createSupabaseAdminClient();

  const { data: claim } = await admin
    .from("clinic_claims")
    .select("*, clinics(id, slug, status)")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim || !claim.clinics) return { error: "Claim not found." };
  if (!["submitted", "under_review", "additional_information_required"].includes(claim.status)) {
    return { error: "This claim was already decided." };
  }

  const clinic = claim.clinics;
  const now = new Date().toISOString();

  const { error: managerError } = await admin.from("clinic_managers").upsert(
    {
      clinic_id: clinic.id,
      user_id: claim.user_id,
      granted_via_claim_id: claim.id,
      granted_by: user.id,
      revoked_at: null,
    },
    { onConflict: "clinic_id,user_id" },
  );
  if (managerError) {
    console.error("approveClaim manager grant failed:", managerError.message);
    return { error: "Could not grant clinic access." };
  }

  await admin.from("user_roles").upsert(
    { user_id: claim.user_id, role: "clinic_representative", granted_by: user.id },
    { onConflict: "user_id,role", ignoreDuplicates: true },
  );

  const nextStatus: ListingStatus =
    clinic.status === "published_unverified" ? "published_verified" : (clinic.status as ListingStatus);
  const { error: clinicError } = await admin
    .from("clinics")
    .update({
      claimed_by: claim.user_id,
      status: nextStatus,
      last_verified_at: now,
      verified_by: user.id,
      updated_by: user.id,
    })
    .eq("id", clinic.id);
  if (clinicError) {
    console.error("approveClaim clinic update failed:", clinicError.message);
    return { error: "Could not update the clinic listing." };
  }

  await admin.from("clinic_verification_records").insert({
    clinic_id: clinic.id,
    method: "claim_approval",
    notes: reason || null,
    verified_by: user.id,
  });

  const { error: claimError } = await admin
    .from("clinic_claims")
    .update({
      status: "approved",
      decision_reason: reason || null,
      decided_by: user.id,
      decided_at: now,
    })
    .eq("id", claimId);
  if (claimError) return { error: "Access granted but the claim status did not update." };

  await logAdminAction(user.id, "approve_claim", "clinic_claim", claimId, reason ?? null, {
    clinic_id: clinic.id,
    claimant_id: claim.user_id,
  });

  revalidatePath("/admin/claims");
  revalidatePath(`/clinics/${clinic.slug}`);
  return { message: "Claim approved — the representative can now manage this clinic." };
}

export async function rejectClaim(
  claimId: string,
  reason: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  if (!reason.trim()) return { error: "A reason is required to reject." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clinic_claims")
    .update({
      status: "rejected",
      decision_reason: reason.trim(),
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", claimId);
  if (error) return { error: "Could not update the claim." };
  await logAdminAction(user.id, "reject_claim", "clinic_claim", claimId, reason.trim());
  revalidatePath("/admin/claims");
  return { message: "Claim rejected." };
}

export async function requestClaimInfo(
  claimId: string,
  message: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  if (!message.trim()) return { error: "Write what you need from the claimant." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clinic_claims")
    .update({
      status: "additional_information_required",
      additional_info_request: message.trim(),
    })
    .eq("id", claimId);
  if (error) return { error: "Could not update the claim." };
  await logAdminAction(user.id, "request_claim_info", "clinic_claim", claimId, message.trim());
  revalidatePath("/admin/claims");
  return { message: "Marked as needing more information." };
}

// ---------------------------------------------------------------------------
// Change requests

const CHANGEABLE_CLINIC_FIELDS = [
  "description",
  "phone",
  "email",
  "website",
  "offers_online_services",
  "offers_in_person_services",
  "wheelchair_accessible",
  "accessibility_notes",
] as const;

export async function approveChangeRequest(
  requestId: string,
  reason?: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: request } = await supabase
    .from("clinic_change_requests")
    .select("*, clinics(id, slug)")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || !request.clinics) return { error: "Change request not found." };
  if (!["submitted", "under_review"].includes(request.status)) {
    return { error: "This request was already decided." };
  }

  const changes = (request.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
  const clinicPatch: Record<string, unknown> = {};
  for (const field of CHANGEABLE_CLINIC_FIELDS) {
    if (field in changes) clinicPatch[field] = changes[field].to;
  }
  if (Object.keys(clinicPatch).length > 0) {
    const { error } = await admin
      .from("clinics")
      .update({ ...clinicPatch, updated_by: user.id })
      .eq("id", request.clinics.id);
    if (error) return { error: "Could not apply the changes to the clinic." };
  }

  if (Array.isArray(changes.service_ids?.to)) {
    const nextIds = changes.service_ids.to as string[];
    await admin.from("clinic_services").delete().eq("clinic_id", request.clinics.id);
    if (nextIds.length > 0) {
      await admin
        .from("clinic_services")
        .insert(nextIds.map((service_id) => ({ clinic_id: request.clinics!.id, service_id })));
    }
  }

  if (Array.isArray(changes.hours?.to)) {
    const rows = changes.hours.to as {
      day_of_week: number;
      is_closed: boolean;
      opens_at: string | null;
      closes_at: string | null;
    }[];
    await admin.from("clinic_hours").delete().eq("clinic_id", request.clinics.id);
    await admin.from("clinic_hours").insert(
      rows.map((row) => ({
        clinic_id: request.clinics!.id,
        day_of_week: row.day_of_week,
        is_closed: row.is_closed,
        opens_at: row.is_closed ? null : row.opens_at,
        closes_at: row.is_closed ? null : row.closes_at,
      })),
    );
  }

  const { error } = await supabase
    .from("clinic_change_requests")
    .update({
      status: "approved",
      review_reason: reason || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) return { error: "Changes applied but the request status did not update." };

  await logAdminAction(user.id, "approve_change_request", "clinic_change_request", requestId, reason ?? null, {
    clinic_id: request.clinics.id,
    fields: Object.keys(changes),
  });
  revalidatePath("/admin/change-requests");
  revalidatePath(`/clinics/${request.clinics.slug}`);
  return { message: "Changes applied to the listing." };
}

export async function rejectChangeRequest(
  requestId: string,
  reason: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  if (!reason.trim()) return { error: "A reason is required to reject." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clinic_change_requests")
    .update({
      status: "rejected",
      review_reason: reason.trim(),
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) return { error: "Could not update the request." };
  await logAdminAction(user.id, "reject_change_request", "clinic_change_request", requestId, reason.trim());
  revalidatePath("/admin/change-requests");
  return { message: "Change request rejected." };
}

// ---------------------------------------------------------------------------
// Reports

export async function resolveReport(
  reportId: string,
  outcome: "resolved" | "dismissed",
  note: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  if (!note.trim()) return { error: "Add a short resolution note." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("clinic_reports")
    .update({
      status: outcome,
      resolution_note: note.trim(),
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  if (error) return { error: "Could not update the report." };
  await logAdminAction(user.id, `${outcome}_report`, "clinic_report", reportId, note.trim());
  revalidatePath("/admin/reports");
  return { message: outcome === "resolved" ? "Report resolved." : "Report dismissed." };
}

// ---------------------------------------------------------------------------
// External candidates

export async function discardCandidate(
  candidateId: string,
  reason: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  if (!reason.trim()) return { error: "A reason is required to discard." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("external_place_candidates")
    .update({
      status: "discarded",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", candidateId);
  if (error) return { error: "Could not update the candidate." };
  await logAdminAction(user.id, "discard_candidate", "external_place_candidate", candidateId, reason.trim());
  revalidatePath("/admin/candidates");
  return { message: "Candidate discarded." };
}

// ---------------------------------------------------------------------------
// Duplicates

export async function runDuplicateScanAction(): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  try {
    const found = await runDuplicateScan();
    await logAdminAction(user.id, "run_duplicate_scan", "duplicate_match_candidates", null, null, {
      new_pairs: found,
    });
    revalidatePath("/admin/duplicates");
    return { message: `Scan finished — ${found} new candidate pair(s).` };
  } catch (cause) {
    console.error("runDuplicateScanAction failed:", cause);
    return { error: "Duplicate scan failed. Check server logs." };
  }
}

export async function resolveDuplicateCandidate(
  candidateId: string,
  resolution: "not_duplicate" | "confirmed_duplicate",
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("duplicate_match_candidates")
    .update({
      status: resolution,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", candidateId)
    .eq("status", "pending");
  if (error) return { error: "Could not update the candidate pair." };
  await logAdminAction(user.id, `mark_${resolution}`, "duplicate_match_candidate", candidateId, null);
  revalidatePath("/admin/duplicates");
  return { message: resolution === "not_duplicate" ? "Marked as not a duplicate." : "Confirmed as duplicate." };
}

export async function mergeDuplicatePair(
  candidateId: string,
  keep: "a" | "b",
  reason: string,
): Promise<AdminActionResult> {
  await requireModerator();
  if (!reason.trim()) return { error: "A reason is required to merge." };
  const supabase = await createSupabaseServerClient();

  const { data: candidate } = await supabase
    .from("duplicate_match_candidates")
    .select("id, status, clinic_a_id, clinic_b_id")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) return { error: "Candidate pair not found." };
  if (candidate.status !== "pending" && candidate.status !== "confirmed_duplicate") {
    return { error: "This pair was already resolved." };
  }

  const keepId = keep === "a" ? candidate.clinic_a_id : candidate.clinic_b_id;
  const mergeId = keep === "a" ? candidate.clinic_b_id : candidate.clinic_a_id;

  // merge_clinics re-checks the moderator role, archives the merged listing,
  // moves user data, and writes the admin_actions row itself.
  const { error } = await supabase.rpc("merge_clinics", {
    p_keep_id: keepId,
    p_merge_id: mergeId,
    p_reason: reason.trim(),
  });
  if (error) {
    console.error("mergeDuplicatePair failed:", error.message);
    return { error: "Merge failed. Check that both listings still exist." };
  }
  revalidatePath("/admin/duplicates");
  revalidatePath("/clinics");
  return { message: "Listings merged — the duplicate is archived." };
}

// ---------------------------------------------------------------------------
// Users & clinic status (administrator only)

export async function setUserRole(
  userId: string,
  role: AppRole,
  grant: boolean,
  reason: string,
): Promise<AdminActionResult> {
  const { user } = await requireAdministrator();
  if (!reason.trim()) return { error: "A reason is required for role changes." };
  if (role === "super_administrator") {
    return { error: "Super administrator is granted from the database only." };
  }
  if (userId === user.id) return { error: "You cannot change your own roles." };

  const admin = createSupabaseAdminClient();
  if (grant) {
    const { error } = await admin.from("user_roles").upsert(
      { user_id: userId, role, granted_by: user.id },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
    if (error) return { error: "Could not grant the role." };
  } else {
    const { error } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role);
    if (error) return { error: "Could not revoke the role." };
  }
  await logAdminAction(user.id, grant ? "grant_role" : "revoke_role", "user", userId, reason.trim(), { role });
  revalidatePath("/admin/users");
  return { message: grant ? `Granted ${role}.` : `Revoked ${role}.` };
}

export async function setClinicStatus(
  clinicId: string,
  status: ListingStatus,
  reason: string,
): Promise<AdminActionResult> {
  const { user } = await requireAdministrator();
  if (!reason.trim()) return { error: "A reason is required for status changes." };

  const admin = createSupabaseAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("id, slug, status")
    .eq("id", clinicId)
    .maybeSingle();
  if (!clinic) return { error: "Clinic not found." };

  try {
    assertTransition(clinic.status, status);
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Invalid transition." };
  }

  const { error } = await admin
    .from("clinics")
    .update({ status, updated_by: user.id })
    .eq("id", clinicId);
  if (error) {
    console.error("setClinicStatus failed:", error.message);
    return { error: "Could not update the clinic status." };
  }
  await logAdminAction(user.id, "set_clinic_status", "clinic", clinicId, reason.trim(), {
    from: clinic.status,
    to: status,
  });
  revalidatePath(`/clinics/${clinic.slug}`);
  return { message: `Status changed to ${status.replaceAll("_", " ")}.` };
}
