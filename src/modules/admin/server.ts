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

export interface ReportedInquiryThread {
  inquiry: { id: string; subject: string; status: string; created_at: string };
  messages: Array<{
    id: string;
    sender_role: string;
    body: string;
    created_at: string;
  }>;
}

/** Thread behind an inquiry report — the only admin read path (RPC-gated). */
export async function getReportedInquiryThread(
  reportId: string,
): Promise<ReportedInquiryThread | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_reported_inquiry_thread", {
    p_report_id: reportId,
  });
  if (error || !data) return null;
  return data as unknown as ReportedInquiryThread;
}

export async function listCandidates() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("external_place_candidates")
    .select("*")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export type CandidateMatch = {
  clinic_id: string;
  clinic_name: string;
  clinic_slug: string;
  name_similarity: number;
  distance_m: number | null;
  same_place_id: boolean;
};

/** Live candidate-vs-clinic matches; computed at render, never stored. */
export async function listCandidateMatches(
  candidateIds: string[],
): Promise<Record<string, CandidateMatch[]>> {
  const supabase = await createSupabaseServerClient();
  const entries = await Promise.all(
    candidateIds.map(async (id) => {
      const { data } = await supabase.rpc("match_candidate_clinics", {
        p_candidate_id: id,
      });
      return [id, (data ?? []) as CandidateMatch[]] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function listImportCities() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ph_locations")
    .select("id, city, province")
    .in("kind", ["city", "municipality"])
    .order("province", { ascending: true })
    .order("city", { ascending: true });
  return (data ?? []).filter(
    (row): row is { id: string; city: string; province: string } =>
      row.city !== null,
  );
}

export async function listRecentImportJobs() {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, status, payload, created_at, last_error")
    .eq("job_type", "candidate_import")
    .order("created_at", { ascending: false })
    .limit(5);
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

// ---------------------------------------------------------------------------
// Clinics (lookup for per-clinic admin views, e.g. ratings moderation)

export interface ClinicSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
}

export async function getClinicSummary(
  clinicId: string,
): Promise<ClinicSummary | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinics")
    .select("id, slug, name, status")
    .eq("id", clinicId)
    .maybeSingle();
  return data;
}

/** Simple name/slug search for admins jumping to a clinic's moderation view. */
export async function searchClinicsBasic(
  query: string,
): Promise<ClinicSummary[]> {
  const supabase = await createSupabaseServerClient();
  const trimmed = query.trim();
  if (!trimmed) return [];
  // PostgREST's .or() filter syntax treats `,` and `()` as structural
  // separators inside the filter string, so a term containing them (e.g.
  // "Smith, Jones" or "(main)") would silently truncate/mis-parse the
  // filter and yield unexpected — often empty — results. Strip them from
  // the search term; they're not meaningful in a name/slug substring match.
  const safe = trimmed.replaceAll(/[,()]/g, "");
  if (!safe) return [];
  const { data } = await supabase
    .from("clinics")
    .select("id, slug, name, status")
    .is("deleted_at", null)
    .or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`)
    .order("name", { ascending: true })
    .limit(25);
  return data ?? [];
}

/**
 * Full clinic row plus the relations the admin editor touches. RLS lets
 * moderators/admins read every status (drafts included), so the session
 * client is enough here.
 */
export async function getClinicForEditing(clinicId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinics")
    .select(
      `*,
       clinic_locations(id, is_primary, address_line1, barangay, city, province, latitude, longitude),
       clinic_services(service_id, services(id, slug, name)),
       clinic_source_records(provider, external_id, created_at)`,
    )
    .eq("id", clinicId)
    .maybeSingle();
  return data;
}

export type ClinicForEditing = NonNullable<
  Awaited<ReturnType<typeof getClinicForEditing>>
>;

export const CLINIC_STATUS_FILTERS = [
  "draft",
  "pending_review",
  "published_unverified",
  "published_verified",
  "rejected",
  "archived",
] as const;
export type ClinicStatusFilter = (typeof CLINIC_STATUS_FILTERS)[number];

/** Newest-first list of clinics in one status, for the admin clinics index. */
export async function listClinicsByStatus(
  status: ClinicStatusFilter,
): Promise<ClinicSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinics")
    .select("id, slug, name, status")
    .eq("status", status)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
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
