import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type JobType = "duplicate_scan";

/**
 * Enqueues a background job. Same idempotency_key twice = one job.
 * Processed by /api/internal/jobs/process (secret-protected); locally the
 * admin console can also run handlers synchronously.
 */
export async function enqueueJob(
  jobType: JobType,
  payload: Record<string, unknown> = {},
  options: { idempotencyKey?: string; runAt?: Date } = {},
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("jobs").upsert(
    {
      job_type: jobType,
      payload: JSON.parse(JSON.stringify(payload)),
      idempotency_key: options.idempotencyKey ?? null,
      run_at: (options.runAt ?? new Date()).toISOString(),
    },
    options.idempotencyKey
      ? { onConflict: "idempotency_key", ignoreDuplicates: true }
      : { ignoreDuplicates: true },
  );
  if (error) {
    // Enqueue failures must never break the user-facing action.
    console.error(`enqueueJob(${jobType}) failed:`, error.message);
  }
}
