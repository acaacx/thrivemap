"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertTransition } from "@/modules/clinics/lifecycle";
import { runDuplicateScan } from "@/modules/jobs/handlers";
import { processDueJobs } from "@/modules/jobs/processor";
import { enqueueUserEmail, enqueueAddressEmail } from "@/modules/jobs/notify";
import { enqueueJob } from "@/modules/jobs/queue";
import { getPlacesProvider } from "@/modules/imports";
import {
  buildImportQuery,
  IMPORT_SERVICE_TERMS,
} from "@/modules/imports/query";
import {
  findExistingCandidateIds,
  upsertPlaceCandidates,
} from "@/modules/imports/server";
import {
  portalProfileSchema,
  portalServicesSchema,
} from "@/modules/portal/schemas";
import { invalidateClinicCaches } from "@/modules/shared/cache";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import {
  adminClinicIdentitySchema,
  importCityTextSchema,
  lookupPlaceSchema,
  OTHER_IMPORT_CITY,
  placeLookupNameSchema,
  slugifyCity,
} from "./schemas";
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
  if (
    !["submitted", "under_review", "additional_information_required"].includes(
      submission.status,
    )
  ) {
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
    console.error(
      "approveSubmission clinic insert failed:",
      clinicError?.message,
    );
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
    console.error(
      "approveSubmission location insert failed:",
      locationError.message,
    );
    return {
      error: "Clinic created but its location failed — fix it manually.",
    };
  }

  if (submission.service_slugs.length > 0) {
    const { data: services } = await admin
      .from("services")
      .select("id, slug")
      .in("slug", submission.service_slugs);
    if (services && services.length > 0) {
      await admin
        .from("clinic_services")
        .insert(
          services.map((s) => ({ clinic_id: clinic.id, service_id: s.id })),
        );
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
    console.error(
      "approveSubmission status update failed:",
      updateError.message,
    );
    return {
      error: "Clinic created but the submission status did not update.",
    };
  }

  const approvedParams = {
    clinicName: submission.clinic_name,
    clinicSlug: clinic.slug,
  };
  if (submission.submitted_by) {
    await enqueueUserEmail(
      submission.submitted_by,
      "submissionApproved",
      approvedParams,
      `submission-approved-${submissionId}`,
    );
  } else if (submission.submitter_email) {
    await enqueueAddressEmail(
      submission.submitter_email,
      "submissionApproved",
      approvedParams,
      `submission-approved-${submissionId}`,
    );
  }

  await logAdminAction(
    user.id,
    "approve_submission",
    "clinic_submission",
    submissionId,
    reason ?? null,
    {
      created_clinic_id: clinic.id,
    },
  );
  await enqueueJob(
    "duplicate_scan",
    { clinic_id: clinic.id },
    { idempotencyKey: `duplicate-scan-${clinic.id}` },
  );

  await invalidateClinicCaches();
  revalidatePath("/admin/submissions");
  revalidatePath("/clinics");
  return { message: `Published as /clinics/${clinic.slug} (unverified).` };
}

export async function requestSubmissionInfo(
  submissionId: string,
  message: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  if (!message.trim())
    return { error: "Write what you need from the submitter." };
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
  await logAdminAction(
    user.id,
    "request_submission_info",
    "clinic_submission",
    submissionId,
    message.trim(),
  );
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
  const { data: submission } = await supabase
    .from("clinic_submissions")
    .select("clinic_name, submitted_by, submitter_email")
    .eq("id", submissionId)
    .maybeSingle();
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

  if (submission) {
    const params = {
      clinicName: submission.clinic_name,
      reason: reason.trim(),
    };
    if (submission.submitted_by) {
      await enqueueUserEmail(
        submission.submitted_by,
        "submissionRejected",
        params,
        `submission-rejected-${submissionId}`,
      );
    } else if (submission.submitter_email) {
      await enqueueAddressEmail(
        submission.submitter_email,
        "submissionRejected",
        params,
        `submission-rejected-${submissionId}`,
      );
    }
  }

  await logAdminAction(
    user.id,
    "reject_submission",
    "clinic_submission",
    submissionId,
    reason.trim(),
  );
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
  await logAdminAction(
    user.id,
    "view_claim_document",
    "clinic_claim_document",
    doc.id,
    null,
    {
      claim_id: doc.claim_id,
      filename: doc.original_filename,
    },
  );
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
    .select("*, clinics(id, name, slug, status)")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim || !claim.clinics) return { error: "Claim not found." };
  if (
    !["submitted", "under_review", "additional_information_required"].includes(
      claim.status,
    )
  ) {
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
    {
      user_id: claim.user_id,
      role: "clinic_representative",
      granted_by: user.id,
    },
    { onConflict: "user_id,role", ignoreDuplicates: true },
  );

  const nextStatus: ListingStatus =
    clinic.status === "published_unverified"
      ? "published_verified"
      : (clinic.status as ListingStatus);
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
  if (claimError)
    return { error: "Access granted but the claim status did not update." };

  await enqueueUserEmail(
    claim.user_id,
    "claimApproved",
    { clinicName: clinic.name },
    `claim-approved-${claimId}`,
  );

  await logAdminAction(
    user.id,
    "approve_claim",
    "clinic_claim",
    claimId,
    reason ?? null,
    {
      clinic_id: clinic.id,
      claimant_id: claim.user_id,
    },
  );

  await invalidateClinicCaches();
  revalidatePath("/admin/claims");
  revalidatePath(`/clinics/${clinic.slug}`);
  return {
    message: "Claim approved — the representative can now manage this clinic.",
  };
}

export async function rejectClaim(
  claimId: string,
  reason: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  if (!reason.trim()) return { error: "A reason is required to reject." };
  const supabase = await createSupabaseServerClient();
  const { data: claim } = await supabase
    .from("clinic_claims")
    .select("user_id, clinics(name)")
    .eq("id", claimId)
    .maybeSingle();
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
  if (claim) {
    await enqueueUserEmail(
      claim.user_id,
      "claimRejected",
      {
        clinicName: claim.clinics?.name ?? "your clinic",
        reason: reason.trim(),
      },
      `claim-rejected-${claimId}`,
    );
  }
  await logAdminAction(
    user.id,
    "reject_claim",
    "clinic_claim",
    claimId,
    reason.trim(),
  );
  revalidatePath("/admin/claims");
  return { message: "Claim rejected." };
}

export async function requestClaimInfo(
  claimId: string,
  message: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  if (!message.trim())
    return { error: "Write what you need from the claimant." };
  const supabase = await createSupabaseServerClient();
  const { data: claim } = await supabase
    .from("clinic_claims")
    .select("user_id, clinics(name)")
    .eq("id", claimId)
    .maybeSingle();
  const { error } = await supabase
    .from("clinic_claims")
    .update({
      status: "additional_information_required",
      additional_info_request: message.trim(),
    })
    .eq("id", claimId);
  if (error) return { error: "Could not update the claim." };
  if (claim) {
    await enqueueUserEmail(claim.user_id, "claimMoreInfo", {
      clinicName: claim.clinics?.name ?? "your clinic",
      request: message.trim(),
    });
  }
  await logAdminAction(
    user.id,
    "request_claim_info",
    "clinic_claim",
    claimId,
    message.trim(),
  );
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
    .select("*, clinics(id, name, slug)")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || !request.clinics)
    return { error: "Change request not found." };
  if (!["submitted", "under_review"].includes(request.status)) {
    return { error: "This request was already decided." };
  }

  const changes = (request.changes ?? {}) as Record<
    string,
    { from: unknown; to: unknown }
  >;
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
    await admin
      .from("clinic_services")
      .delete()
      .eq("clinic_id", request.clinics.id);
    if (nextIds.length > 0) {
      await admin.from("clinic_services").insert(
        nextIds.map((service_id) => ({
          clinic_id: request.clinics!.id,
          service_id,
        })),
      );
    }
  }

  if (Array.isArray(changes.hours?.to)) {
    const rows = changes.hours.to as {
      day_of_week: number;
      is_closed: boolean;
      opens_at: string | null;
      closes_at: string | null;
    }[];
    await admin
      .from("clinic_hours")
      .delete()
      .eq("clinic_id", request.clinics.id);
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
  if (error)
    return { error: "Changes applied but the request status did not update." };

  if (request.requested_by) {
    await enqueueUserEmail(
      request.requested_by,
      "changeRequestApproved",
      { clinicName: request.clinics.name },
      `change-approved-${requestId}`,
    );
  }

  await logAdminAction(
    user.id,
    "approve_change_request",
    "clinic_change_request",
    requestId,
    reason ?? null,
    {
      clinic_id: request.clinics.id,
      fields: Object.keys(changes),
    },
  );
  await invalidateClinicCaches();
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
  const { data: request } = await supabase
    .from("clinic_change_requests")
    .select("requested_by, clinics(name)")
    .eq("id", requestId)
    .maybeSingle();
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
  if (request?.requested_by) {
    await enqueueUserEmail(
      request.requested_by,
      "changeRequestRejected",
      {
        clinicName: request.clinics?.name ?? "the clinic",
        reason: reason.trim(),
      },
      `change-rejected-${requestId}`,
    );
  }
  await logAdminAction(
    user.id,
    "reject_change_request",
    "clinic_change_request",
    requestId,
    reason.trim(),
  );
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
  await logAdminAction(
    user.id,
    `${outcome}_report`,
    "clinic_report",
    reportId,
    note.trim(),
  );
  revalidatePath("/admin/reports");
  return {
    message: outcome === "resolved" ? "Report resolved." : "Report dismissed.",
  };
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
  await logAdminAction(
    user.id,
    "discard_candidate",
    "external_place_candidate",
    candidateId,
    reason.trim(),
  );
  revalidatePath("/admin/candidates");
  return { message: "Candidate discarded." };
}

export async function triggerCandidateImportAction(
  termSlug: string,
  locationId: string,
  cityText?: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const { allowed } = await checkRateLimit(
    "candidate-import",
    user.id,
    10,
    3600,
  );
  if (!allowed) {
    return { error: "Import rate limit reached — try again in an hour." };
  }
  const term = IMPORT_SERVICE_TERMS.find((t) => t.slug === termSlug);
  if (!term) return { error: "Unknown service term." };

  let city: { name: string; slug: string };
  if (locationId === OTHER_IMPORT_CITY) {
    const parsed = importCityTextSchema.safeParse(cityText ?? "");
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Type a city name." };
    }
    city = { name: parsed.data, slug: slugifyCity(parsed.data) };
    if (!city.slug) return { error: "Type a city name." };
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: location } = await supabase
      .from("ph_locations")
      .select("id, city, city_slug, province")
      .eq("id", locationId)
      .maybeSingle();
    if (!location?.city || !location.city_slug) {
      return { error: "Unknown city." };
    }
    city = { name: location.city, slug: location.city_slug };
  }

  const query = buildImportQuery(term.slug, city.name);
  const day = new Date().toISOString().slice(0, 10);
  await enqueueJob(
    "candidate_import",
    {
      query,
      termSlug: term.slug,
      citySlug: city.slug,
      requestedBy: user.id,
    },
    // One import per term+city per day; repeat clicks are no-ops.
    {
      idempotencyKey: `candidate-import:${term.slug}:${city.slug}:${day}`,
    },
  );
  await logAdminAction(user.id, "trigger_candidate_import", "job", null, null, {
    query,
    term: term.slug,
    city_slug: city.slug,
    free_text_city: locationId === OTHER_IMPORT_CITY,
  });
  revalidatePath("/admin/candidates");
  return { message: `Import queued: ${query}` };
}

export interface PlaceLookupHit {
  externalId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rawPayload: Record<string, unknown>;
  alreadyCandidate: boolean;
}

export type PlaceLookupResult =
  | { ok: false; error: string }
  | { ok: true; hits: PlaceLookupHit[]; query: string };

/**
 * Synchronous by-name Places lookup for centers the admin already knows.
 * One page only, nothing written — the admin picks hits to add as candidates.
 */
export async function lookupPlacesByNameAction(
  name: string,
  cityText?: string,
): Promise<PlaceLookupResult> {
  const { user } = await requireModerator();
  const { allowed } = await checkRateLimit("place-lookup", user.id, 20, 3600);
  if (!allowed) {
    return {
      ok: false,
      error: "Lookup rate limit reached — try again in an hour.",
    };
  }
  const parsedName = placeLookupNameSchema.safeParse(name);
  if (!parsedName.success) {
    return {
      ok: false,
      error: parsedName.error.issues[0]?.message ?? "Type the center's name.",
    };
  }
  let city: string | null = null;
  if (cityText && cityText.trim()) {
    const parsedCity = importCityTextSchema.safeParse(cityText);
    if (!parsedCity.success) {
      return {
        ok: false,
        error: parsedCity.error.issues[0]?.message ?? "Bad city.",
      };
    }
    city = parsedCity.data;
  }
  const query = city
    ? `${parsedName.data}, ${city}, Philippines`
    : `${parsedName.data}, Philippines`;

  const provider = getPlacesProvider();
  let places;
  try {
    ({ places } = await provider.searchText(query, { maxPages: 1 }));
  } catch (error) {
    console.error("lookupPlacesByNameAction failed:", error);
    return { ok: false, error: "Places lookup failed. Try again in a moment." };
  }
  const existing = await findExistingCandidateIds(
    provider.name,
    places.map((p) => p.externalId),
  );
  await logAdminAction(user.id, "lookup_place_by_name", "job", null, null, {
    query,
    hits: places.length,
  });
  return {
    ok: true,
    query,
    hits: places.map((p) => ({
      ...p,
      alreadyCandidate: existing.has(p.externalId),
    })),
  };
}

/** Add one lookup hit to external_place_candidates for normal review. */
export async function addPlaceCandidateAction(
  hit: unknown,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const parsed = lookupPlaceSchema.safeParse(hit);
  if (!parsed.success) return { error: "That result is malformed." };
  const provider = getPlacesProvider();
  try {
    const { created } = await upsertPlaceCandidates(provider.name, [
      parsed.data,
    ]);
    await logAdminAction(
      user.id,
      "add_place_candidate",
      "external_place_candidate",
      null,
      null,
      { external_id: parsed.data.externalId, name: parsed.data.name, created },
    );
    revalidatePath("/admin/candidates");
    return {
      message: created
        ? `Added "${parsed.data.name}" as a candidate.`
        : `"${parsed.data.name}" was already a candidate — refreshed.`,
    };
  } catch (error) {
    console.error("addPlaceCandidateAction failed:", error);
    return { error: "Could not add the candidate." };
  }
}

export async function promoteCandidateAction(
  candidateId: string,
  note: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const supabase = await createSupabaseServerClient();
  const { data: clinicId, error } = await supabase.rpc("promote_candidate", {
    p_candidate_id: candidateId,
  });
  if (error) {
    if (error.message.includes("already linked")) {
      return { error: "A clinic already has this place — use Attach instead." };
    }
    console.error("promoteCandidateAction failed:", error.message);
    return { error: "Could not promote the candidate." };
  }
  await logAdminAction(
    user.id,
    "promote_candidate",
    "external_place_candidate",
    candidateId,
    note.trim() || null,
    { clinic_id: clinicId },
  );
  revalidatePath("/admin/candidates");
  revalidatePath("/admin/clinics");
  return {
    message:
      "Draft clinic created — open it under Clinics → Drafts to enrich and publish.",
  };
}

export async function attachCandidateAction(
  candidateId: string,
  clinicId: string,
  note: string,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("attach_candidate", {
    p_candidate_id: candidateId,
    p_clinic_id: clinicId,
  });
  if (error) {
    console.error("attachCandidateAction failed:", error.message);
    return { error: "Could not attach the candidate." };
  }
  await logAdminAction(
    user.id,
    "attach_candidate",
    "external_place_candidate",
    candidateId,
    note.trim() || null,
    { clinic_id: clinicId },
  );
  revalidatePath("/admin/candidates");
  return { message: "Candidate attached to the existing clinic." };
}

// ---------------------------------------------------------------------------
// Duplicates

export async function runDuplicateScanAction(): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  try {
    const found = await runDuplicateScan();
    await logAdminAction(
      user.id,
      "run_duplicate_scan",
      "duplicate_match_candidates",
      null,
      null,
      {
        new_pairs: found,
      },
    );
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
  await logAdminAction(
    user.id,
    `mark_${resolution}`,
    "duplicate_match_candidate",
    candidateId,
    null,
  );
  revalidatePath("/admin/duplicates");
  return {
    message:
      resolution === "not_duplicate"
        ? "Marked as not a duplicate."
        : "Confirmed as duplicate.",
  };
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
  if (
    candidate.status !== "pending" &&
    candidate.status !== "confirmed_duplicate"
  ) {
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
  await invalidateClinicCaches();
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
  if (!reason.trim())
    return { error: "A reason is required for role changes." };
  if (role === "super_administrator") {
    return { error: "Super administrator is granted from the database only." };
  }
  if (userId === user.id) return { error: "You cannot change your own roles." };

  const admin = createSupabaseAdminClient();
  if (grant) {
    const { error } = await admin
      .from("user_roles")
      .upsert(
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
  await logAdminAction(
    user.id,
    grant ? "grant_role" : "revoke_role",
    "user",
    userId,
    reason.trim(),
    { role },
  );
  revalidatePath("/admin/users");
  return { message: grant ? `Granted ${role}.` : `Revoked ${role}.` };
}

export async function setClinicStatus(
  clinicId: string,
  status: ListingStatus,
  reason: string,
): Promise<AdminActionResult> {
  const { user } = await requireAdministrator();
  if (!reason.trim())
    return { error: "A reason is required for status changes." };

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
    return {
      error: cause instanceof Error ? cause.message : "Invalid transition.",
    };
  }

  const { error } = await admin
    .from("clinics")
    .update({ status, updated_by: user.id })
    .eq("id", clinicId);
  if (error) {
    console.error("setClinicStatus failed:", error.message);
    return { error: "Could not update the clinic status." };
  }
  await logAdminAction(
    user.id,
    "set_clinic_status",
    "clinic",
    clinicId,
    reason.trim(),
    {
      from: clinic.status,
      to: status,
    },
  );
  await invalidateClinicCaches();
  revalidatePath(`/clinics/${clinic.slug}`);
  revalidatePath(`/admin/clinics/${clinicId}`);
  revalidatePath("/admin/clinics");
  return { message: `Status changed to ${status.replaceAll("_", " ")}.` };
}

// ---------------------------------------------------------------------------
// Admin clinic editor (enrich imported drafts before publishing)
//
// Moderators and admins edit any clinic directly — no change-request detour —
// via the service-role client, and every save writes an admin_actions row.

async function loadClinicForAdminEdit(clinicId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("clinics")
    .select("id, slug, status")
    .eq("id", clinicId)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

async function revalidateAdminClinic(slug: string, clinicId: string) {
  await invalidateClinicCaches();
  revalidatePath(`/clinics/${slug}`);
  revalidatePath(`/admin/clinics/${clinicId}`);
  revalidatePath("/admin/clinics");
}

export async function adminUpdateClinicIdentity(
  clinicId: string,
  raw: unknown,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const parsed = adminClinicIdentitySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }
  const clinic = await loadClinicForAdminEdit(clinicId);
  if (!clinic) return { error: "Clinic not found." };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("clinics")
    .update({ name: parsed.data.name, updated_by: user.id })
    .eq("id", clinicId);
  if (error) {
    console.error("adminUpdateClinicIdentity failed:", error.message);
    return { error: "Could not save the clinic name." };
  }

  let locationUpdate: {
    city: string;
    city_slug: string;
    province: string;
    province_slug: string;
  } | null = null;
  if (parsed.data.locationId) {
    const { data: location } = await admin
      .from("ph_locations")
      .select("city, city_slug, province, province_slug")
      .eq("id", parsed.data.locationId)
      .in("kind", ["city", "municipality"])
      .maybeSingle();
    if (!location?.city || !location.city_slug) {
      return { error: "Pick a valid city." };
    }
    locationUpdate = {
      city: location.city,
      city_slug: location.city_slug,
      province: location.province,
      province_slug: location.province_slug,
    };
  }

  if (parsed.data.address_line1 || locationUpdate) {
    const { data: primary } = await admin
      .from("clinic_locations")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("is_primary", true)
      .maybeSingle();
    if (primary) {
      const { error: locError } = await admin
        .from("clinic_locations")
        .update({
          ...(parsed.data.address_line1
            ? { address_line1: parsed.data.address_line1 }
            : {}),
          ...(locationUpdate ?? {}),
        })
        .eq("id", primary.id);
      if (locError) {
        console.error(
          "adminUpdateClinicIdentity address failed:",
          locError.message,
        );
        return { error: "Saved the name, but could not save the address." };
      }
    } else if (locationUpdate) {
      return { error: "Saved the name, but this clinic has no location yet." };
    }
  }

  await logAdminAction(
    user.id,
    "edit_clinic_identity",
    "clinic",
    clinicId,
    null,
    {
      name: parsed.data.name,
      address_line1: parsed.data.address_line1 || null,
      ...(locationUpdate
        ? { city: locationUpdate.city, province: locationUpdate.province }
        : {}),
    },
  );
  await revalidateAdminClinic(clinic.slug, clinicId);
  return {
    message: locationUpdate
      ? "Name, address and city saved."
      : "Name and address saved.",
  };
}

export async function adminUpdateClinicProfile(
  clinicId: string,
  raw: unknown,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const parsed = portalProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please review the form.",
    };
  }
  const clinic = await loadClinicForAdminEdit(clinicId);
  if (!clinic) return { error: "Clinic not found." };

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
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("clinics")
    .update({ ...next, updated_by: user.id })
    .eq("id", clinicId);
  if (error) {
    console.error("adminUpdateClinicProfile failed:", error.message);
    return { error: "Could not save the profile." };
  }

  await logAdminAction(
    user.id,
    "edit_clinic_profile",
    "clinic",
    clinicId,
    null,
    {
      fields: Object.keys(next),
    },
  );
  await revalidateAdminClinic(clinic.slug, clinicId);
  return { message: "Profile saved." };
}

export async function adminUpdateClinicServices(
  clinicId: string,
  raw: unknown,
): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const parsed = portalServicesSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Choose at least one service.",
    };
  }
  const clinic = await loadClinicForAdminEdit(clinicId);
  if (!clinic) return { error: "Clinic not found." };

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("clinic_services")
    .select("service_id")
    .eq("clinic_id", clinicId);
  const existingIds = new Set((existing ?? []).map((row) => row.service_id));
  const nextIds = new Set(parsed.data.service_ids);
  const toAdd = [...nextIds].filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !nextIds.has(id));

  if (toAdd.length > 0) {
    const { error } = await admin
      .from("clinic_services")
      .insert(toAdd.map((service_id) => ({ clinic_id: clinicId, service_id })));
    if (error) {
      console.error("adminUpdateClinicServices insert failed:", error.message);
      return { error: "Could not save services." };
    }
  }
  if (toRemove.length > 0) {
    const { error } = await admin
      .from("clinic_services")
      .delete()
      .eq("clinic_id", clinicId)
      .in("service_id", toRemove);
    if (error) {
      console.error("adminUpdateClinicServices delete failed:", error.message);
      return { error: "Could not save services." };
    }
  }

  await logAdminAction(
    user.id,
    "edit_clinic_services",
    "clinic",
    clinicId,
    null,
    {
      added: toAdd,
      removed: toRemove,
    },
  );
  await revalidateAdminClinic(clinic.slug, clinicId);
  return { message: "Services saved." };
}

// ---------------------------------------------------------------------------
// Jobs (dead-letter queue)

export async function retryDeadJob(jobId: string): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("jobs")
    .update({
      status: "pending",
      attempts: 0,
      run_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: null,
    })
    .eq("id", jobId)
    .eq("status", "dead");
  if (error) return { error: "Could not requeue the job." };
  await logAdminAction(user.id, "retry_dead_job", "job", jobId, null);
  revalidatePath("/admin/jobs");
  return { message: "Job requeued." };
}

/** Manual tick: process due jobs now (local dev / debugging convenience). */
export async function runJobsTickAction(): Promise<AdminActionResult> {
  const { user } = await requireModerator();
  try {
    const results = await processDueJobs(`admin-${user.id.slice(0, 8)}`, 20);
    revalidatePath("/admin/jobs");
    const done = results.filter((r) => r.status === "completed").length;
    return {
      message: `Processed ${results.length} job(s) — ${done} completed.`,
    };
  } catch (cause) {
    console.error("runJobsTickAction failed:", cause);
    return { error: "Job tick failed. Check server logs." };
  }
}
