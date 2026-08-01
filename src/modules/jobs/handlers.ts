import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getEmailSender, emailTemplates } from "@/modules/shared/email";
import type { EmailContent, EmailTemplateName } from "@/modules/shared/email";
import { siteConfig } from "@/lib/site-config";
import { enqueueJob } from "./queue";
import type { JobType } from "./queue";

type JobPayload = Record<string, unknown>;

export type JobHandler = (payload: JobPayload) => Promise<void>;

const VERIFICATION_REMINDER_DAYS = 180;
const STALE_LISTING_DAYS = 365;

/**
 * Duplicate detection: one set-based scan (scan_duplicate_candidates RPC)
 * over the given clinic — or every publicly listed clinic — writing scored
 * pairs into duplicate_match_candidates. Merges stay manual — this only
 * surfaces candidates for the admin duplicates workspace. Returns the number
 * of newly inserted pairs.
 */
export async function runDuplicateScan(
  payload: JobPayload = {},
): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("scan_duplicate_candidates", {
    p_clinic_id:
      typeof payload.clinic_id === "string" ? payload.clinic_id : undefined,
  });
  if (error) throw new Error(`duplicate_scan failed: ${error.message}`);
  return data ?? 0;
}

async function emailForUser(userId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("email_notifications")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefs && !prefs.email_notifications) return null;
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

async function displayName(
  userId: string,
  fallbackEmail: string,
): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.display_name || fallbackEmail.split("@")[0];
}

/**
 * Email delivery. Payload is one of:
 *  - { user_id, template, params }: resolve address + name, honor the user's
 *    email_notifications preference.
 *  - { to, template, params }: send to a raw address (anonymous submitter).
 *  - { moderators: true, subject, body }: plain notice to every moderator.
 */
async function sendEmailJob(payload: JobPayload): Promise<void> {
  const sender = getEmailSender();

  if (payload.moderators === true) {
    const supabase = createSupabaseAdminClient();
    const { data: rows, error } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["moderator", "administrator"]);
    if (error) throw new Error(`moderator lookup failed: ${error.message}`);
    const subject = String(payload.subject ?? "ThriveMap moderation update");
    const body = String(payload.body ?? "");
    const seen = new Set<string>();
    for (const row of rows ?? []) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      const to = await emailForUser(row.user_id);
      if (!to) continue;
      await sender.send({
        to,
        subject,
        html: `<p>${body}</p><p><a href="${siteConfig.url}/admin">Open the admin console</a></p>`,
        text: `${body}\n\n${siteConfig.url}/admin`,
      });
    }
    return;
  }

  const template = payload.template as EmailTemplateName;
  const render = emailTemplates[template] as
    ((params: Record<string, unknown>) => EmailContent) | undefined;
  if (!render)
    throw new Error(`unknown email template: ${String(payload.template)}`);
  const params = { ...((payload.params as Record<string, unknown>) ?? {}) };

  let to: string | null = null;
  if (typeof payload.user_id === "string") {
    to = await emailForUser(payload.user_id);
    if (!to) {
      logger.info("send_email skipped (no address or notifications off)", {
        template,
      });
      return;
    }
    params.name ??= await displayName(payload.user_id, to);
  } else if (typeof payload.to === "string") {
    to = payload.to;
    params.name ??= to.split("@")[0];
  }
  if (!to) throw new Error("send_email payload has no recipient");

  const content = render(params);
  await sender.send({ to, ...content });
}

/**
 * Submission intake: acknowledge the submitter and notify moderators that a
 * new suggestion is waiting. The pre-submit duplicate review already ran in
 * the form; moderators see match candidates in their workspace.
 */
async function processSubmission(payload: JobPayload): Promise<void> {
  const submissionId = String(payload.submission_id ?? "");
  if (!submissionId) throw new Error("submission_process needs submission_id");
  const supabase = createSupabaseAdminClient();
  const { data: submission, error } = await supabase
    .from("clinic_submissions")
    .select("id, clinic_name, submitted_by, submitter_email")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw new Error(`submission lookup failed: ${error.message}`);
  if (!submission) return; // Deleted before processing — nothing to do.

  if (submission.submitted_by) {
    await enqueueJob(
      "send_email",
      {
        user_id: submission.submitted_by,
        template: "submissionReceived",
        params: { clinicName: submission.clinic_name },
      },
      { idempotencyKey: `submission-received-${submission.id}` },
    );
  } else if (submission.submitter_email) {
    await enqueueJob(
      "send_email",
      {
        to: submission.submitter_email,
        template: "submissionReceived",
        params: { clinicName: submission.clinic_name },
      },
      { idempotencyKey: `submission-received-${submission.id}` },
    );
  }

  await enqueueJob(
    "send_email",
    {
      moderators: true,
      subject: `New clinic suggestion: ${submission.clinic_name}`,
      body: `A new clinic suggestion (“${submission.clinic_name}”) is waiting for review.`,
    },
    { idempotencyKey: `submission-mods-${submission.id}` },
  );
}

/**
 * Verification reminders: verified clinics whose last verification is older
 * than VERIFICATION_REMINDER_DAYS get a reminder to each active manager, at
 * most once per clinic per month (idempotency key).
 */
async function runVerificationReminderScan(): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(
    Date.now() - VERIFICATION_REMINDER_DAYS * 86_400_000,
  ).toISOString();
  const { data: clinics, error } = await supabase
    .from("clinics")
    .select("id, name, last_verified_at, clinic_managers(user_id, revoked_at)")
    .eq("status", "published_verified")
    .lt("last_verified_at", cutoff)
    .is("deleted_at", null)
    .limit(500);
  if (error) throw new Error(`verification scan failed: ${error.message}`);

  const month = new Date().toISOString().slice(0, 7);
  for (const clinic of clinics ?? []) {
    for (const manager of clinic.clinic_managers ?? []) {
      if (manager.revoked_at) continue;
      await enqueueJob(
        "send_email",
        {
          user_id: manager.user_id,
          template: "verificationReminder",
          params: { clinicName: clinic.name },
        },
        {
          idempotencyKey: `verif-reminder-${clinic.id}-${manager.user_id}-${month}`,
        },
      );
    }
  }
}

/**
 * Stale-listing detection: published listings untouched for over a year get
 * flagged_stale_at set, surfacing them on the admin dashboard. The flag
 * clears automatically when the clinic row is next updated (see trigger in
 * migration 14).
 */
async function runStaleListingScan(): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(
    Date.now() - STALE_LISTING_DAYS * 86_400_000,
  ).toISOString();
  const { error } = await supabase
    .from("clinics")
    .update({ flagged_stale_at: new Date().toISOString() })
    .in("status", ["published_unverified", "published_verified"])
    .is("deleted_at", null)
    .is("flagged_stale_at", null)
    .lt("updated_at", cutoff);
  if (error) throw new Error(`stale scan failed: ${error.message}`);
}

/** Safety-net rebuild of search documents (triggers keep them fresh online). */
async function refreshSearchDocuments(payload: JobPayload): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (typeof payload.clinic_id === "string") {
    const { error } = await supabase.rpc("refresh_clinic_search_document", {
      p_clinic_id: payload.clinic_id,
    });
    if (error) throw new Error(`search refresh failed: ${error.message}`);
    return;
  }
  const { error } = await supabase.rpc("refresh_all_clinic_search_documents");
  if (error) throw new Error(`search refresh (all) failed: ${error.message}`);
}

/**
 * [DEV ADAPTER] External candidate import stub. The real implementation calls
 * Google Places Nearby Search and writes external_place_candidates rows; it
 * activates once GOOGLE_MAPS_SERVER_API_KEY is configured (see
 * docs/operations/deployment.md). Without a key this logs and completes.
 */
async function runCandidateImport(payload: JobPayload): Promise<void> {
  if (!process.env.GOOGLE_MAPS_SERVER_API_KEY) {
    logger.info("[DEV ADAPTER] candidate_import skipped — no Google key", {
      area: typeof payload.area === "string" ? payload.area : undefined,
    });
    return;
  }
  throw new Error(
    "candidate_import: Google Places import not implemented yet — key present but importer is Phase 2 scope",
  );
}

export const JOB_HANDLERS: Record<JobType, JobHandler> = {
  duplicate_scan: async (payload) => {
    await runDuplicateScan(payload);
  },
  send_email: sendEmailJob,
  submission_process: processSubmission,
  verification_reminder_scan: runVerificationReminderScan,
  stale_listing_scan: runStaleListingScan,
  search_document_refresh: refreshSearchDocuments,
  candidate_import: runCandidateImport,
};
