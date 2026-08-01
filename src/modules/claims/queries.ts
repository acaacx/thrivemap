import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Statuses that block starting another claim for the same clinic. */
export const OPEN_CLAIM_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "additional_information_required",
] as const;

/** The signed-in user's open (or approved) claim for a clinic, if any. */
export async function getOwnClaimForClinic(clinicId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinic_claims")
    .select("*, clinic_claim_documents(id, kind, original_filename, created_at)")
    .eq("clinic_id", clinicId)
    .eq("user_id", userId)
    .in("status", [...OPEN_CLAIM_STATUSES, "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export type OwnClaim = NonNullable<Awaited<ReturnType<typeof getOwnClaimForClinic>>>;

/** All claims for the signed-in user's account page. */
export async function getOwnClaims(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinic_claims")
    .select(
      "id, status, created_at, updated_at, additional_info_request, decision_reason, clinics(name, slug)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
