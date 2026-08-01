import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { JobType } from "./queue";

type JobPayload = Record<string, unknown>;

export type JobHandler = (payload: JobPayload) => Promise<void>;

/**
 * Duplicate detection: one set-based scan (scan_duplicate_candidates RPC)
 * over the given clinic — or every publicly listed clinic — writing scored
 * pairs into duplicate_match_candidates. Merges stay manual — this only
 * surfaces candidates for the admin duplicates workspace. Returns the number
 * of newly inserted pairs.
 */
export async function runDuplicateScan(payload: JobPayload = {}): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("scan_duplicate_candidates", {
    p_clinic_id: typeof payload.clinic_id === "string" ? payload.clinic_id : undefined,
  });
  if (error) throw new Error(`duplicate_scan failed: ${error.message}`);
  return data ?? 0;
}

export const JOB_HANDLERS: Record<JobType, JobHandler> = {
  duplicate_scan: async (payload) => {
    await runDuplicateScan(payload);
  },
};
