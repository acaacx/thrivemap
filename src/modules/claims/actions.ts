"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/modules/auth/server";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import { OPEN_CLAIM_STATUSES } from "./queries";
import {
  claimDetailsSchema,
  claimDocumentSchema,
} from "./schemas";

export interface ClaimActionResult {
  error?: string;
  claimId?: string;
}

/**
 * Starts (or resumes) a claim draft for a clinic. Returns the existing open
 * claim when one is in flight so the wizard resumes instead of duplicating.
 */
export async function startClaim(clinicId: string): Promise<ClaimActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to claim a clinic." };

  const limited = await checkRateLimit("start-claim", user.id, 5, 3600);
  if (!limited.allowed) {
    return { error: "Too many claim attempts in a short time. Please try again later." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("clinic_claims")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", user.id)
    .in("status", [...OPEN_CLAIM_STATUSES])
    .limit(1)
    .maybeSingle();
  if (existing) return { claimId: existing.id };

  const { data, error } = await supabase
    .from("clinic_claims")
    .insert({ clinic_id: clinicId, user_id: user.id })
    .select("id")
    .single();
  if (error || !data) {
    console.error("startClaim failed:", error?.message);
    return { error: "Could not start the claim right now. Please try again." };
  }
  return { claimId: data.id };
}

export async function saveClaimDetails(
  claimId: string,
  raw: unknown,
): Promise<ClaimActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to continue." };

  const parsed = claimDetailsSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please review the form." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinic_claims")
    .update({
      full_name: parsed.data.full_name,
      work_email: parsed.data.work_email,
      mobile_number: parsed.data.mobile_number,
      job_title: parsed.data.job_title,
      relationship: parsed.data.relationship,
      business_registration_info: parsed.data.business_registration_info || null,
    })
    .eq("id", claimId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("saveClaimDetails failed:", error?.message);
    return { error: "Could not save your details. Please try again." };
  }
  return { claimId };
}

/**
 * Records metadata for a document the client uploaded to the private
 * claim-documents bucket. The storage RLS policy already restricts uploads to
 * the caller's own folder; this re-checks the path shape defensively.
 */
export async function recordClaimDocument(raw: unknown): Promise<ClaimActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to continue." };

  const parsed = claimDocumentSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid document details." };

  const { claim_id, storage_path, kind, original_filename } = parsed.data;
  if (!storage_path.startsWith(`${user.id}/${claim_id}/`)) {
    return { error: "Invalid document path." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("clinic_claim_documents").insert({
    claim_id,
    storage_path,
    kind,
    original_filename,
    uploaded_by: user.id,
  });
  if (error) {
    console.error("recordClaimDocument failed:", error.message);
    return { error: "Could not attach the document. Please try again." };
  }
  return { claimId: claim_id };
}

/** Final submission: details must be complete and at least one document attached. */
export async function submitClaim(claimId: string): Promise<ClaimActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to continue." };

  const supabase = await createSupabaseServerClient();
  const { data: claim } = await supabase
    .from("clinic_claims")
    .select("*, clinic_claim_documents(id), clinics(slug)")
    .eq("id", claimId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!claim) return { error: "Claim not found." };
  if (!["draft", "additional_information_required"].includes(claim.status)) {
    return { error: "This claim has already been submitted." };
  }

  const details = claimDetailsSchema.safeParse({
    full_name: claim.full_name,
    work_email: claim.work_email,
    mobile_number: claim.mobile_number,
    job_title: claim.job_title,
    relationship: claim.relationship,
    business_registration_info: claim.business_registration_info ?? undefined,
  });
  if (!details.success) {
    return { error: "Please complete your details before submitting." };
  }
  if (claim.clinic_claim_documents.length === 0) {
    return { error: "Attach at least one verification document before submitting." };
  }

  const { error } = await supabase
    .from("clinic_claims")
    .update({ status: "submitted", consent_given: true })
    .eq("id", claimId)
    .eq("user_id", user.id);
  if (error) {
    console.error("submitClaim failed:", error.message);
    return { error: "Could not submit the claim. Please try again." };
  }

  if (claim.clinics?.slug) revalidatePath(`/clinics/${claim.clinics.slug}/claim`);
  revalidatePath("/account/claims");
  return { claimId };
}
