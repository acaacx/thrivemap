import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/modules/auth/server";

/** Moderation staff gate for every /admin page and action. */
export async function requireModerator() {
  return requireRole("moderator", "administrator", "super_administrator");
}

/** Full-admin gate (user management, audit log, status overrides). */
export async function requireAdministrator() {
  return requireRole("administrator", "super_administrator");
}

export async function getDashboardMetrics() {
  const supabase = await createSupabaseServerClient();
  const head = { count: "exact" as const, head: true };

  const [
    submissions,
    claims,
    changeRequests,
    reports,
    duplicates,
    published,
    deadJobs,
  ] = await Promise.all([
    supabase
      .from("clinic_submissions")
      .select("id", head)
      .in("status", ["submitted", "under_review"]),
    supabase
      .from("clinic_claims")
      .select("id", head)
      .in("status", ["submitted", "under_review"]),
    supabase
      .from("clinic_change_requests")
      .select("id", head)
      .in("status", ["submitted", "under_review"]),
    supabase
      .from("clinic_reports")
      .select("id", head)
      .in("status", ["open", "under_review"]),
    supabase
      .from("duplicate_match_candidates")
      .select("id", head)
      .eq("status", "pending"),
    supabase
      .from("clinics")
      .select("id", head)
      .in("status", ["published_unverified", "published_verified"]),
    supabase.from("jobs").select("id", head).eq("status", "dead"),
  ]);

  return {
    submissions: submissions.count ?? 0,
    claims: claims.count ?? 0,
    changeRequests: changeRequests.count ?? 0,
    reports: reports.count ?? 0,
    duplicates: duplicates.count ?? 0,
    published: published.count ?? 0,
    deadJobs: deadJobs.count ?? 0,
  };
}

export async function listSubmissions() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinic_submissions")
    .select("*")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function listClaims() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinic_claims")
    .select("id, status, full_name, created_at, clinics(id, name, slug)")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function getClaimDetail(claimId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinic_claims")
    .select(
      "*, clinics(id, name, slug, status, claimed_by), clinic_claim_documents(id, kind, original_filename, created_at)",
    )
    .eq("id", claimId)
    .maybeSingle();
  return data;
}

export async function listChangeRequests() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinic_change_requests")
    .select("*, clinics(id, name, slug)")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function listReports() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinic_reports")
    .select("*, clinics(id, name, slug)")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function listCandidates() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("external_place_candidates")
    .select("*")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function listDuplicates() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("duplicate_match_candidates")
    .select(
      `*,
       clinic_a:clinics!duplicate_match_candidates_clinic_a_id_fkey(id, name, slug, status),
       clinic_b:clinics!duplicate_match_candidates_clinic_b_id_fkey(id, name, slug, status)`,
    )
    .order("similarity_score", { ascending: false });
  return data ?? [];
}

/** User management list — admin client because profiles are owner-read. */
export async function listUsersWithRoles() {
  const supabase = createSupabaseAdminClient();
  const [{ data: profiles }, { data: roles }, { data: authUsers }] =
    await Promise.all([
      supabase.from("profiles").select("id, display_name, created_at"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.auth.admin.listUsers({ perPage: 200 }),
    ]);
  const emailById = new Map(
    (authUsers?.users ?? []).map((user) => [user.id, user.email ?? ""]),
  );
  return (profiles ?? [])
    .map((profile) => ({
      ...profile,
      email: emailById.get(profile.id) ?? "",
      roles: (roles ?? [])
        .filter((row) => row.user_id === profile.id)
        .map((row) => row.role),
    }))
    .sort((a, b) => (a.email < b.email ? -1 : 1));
}

export async function listAuditLogs(limit = 100) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function listAdminActions(limit = 100) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("admin_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function listJobs(limit = 100) {
  // Jobs are infrastructure rows (no RLS grants) — moderator check done by
  // the admin layout; service role reads here.
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function countStaleClinics() {
  const supabase = createSupabaseAdminClient();
  const { count } = await supabase
    .from("clinics")
    .select("id", { count: "exact", head: true })
    .not("flagged_stale_at", "is", null)
    .is("deleted_at", null);
  return count ?? 0;
}
