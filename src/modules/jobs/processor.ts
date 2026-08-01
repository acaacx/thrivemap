import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { JOB_HANDLERS } from "./handlers";
import type { JobType } from "./queue";

export interface JobRunResult {
  id: string;
  job_type: string;
  status: "completed" | "retry" | "dead";
}

/**
 * Claims a batch of due jobs and runs their handlers. Shared by the
 * secret-protected processor route and the admin console's manual tick.
 */
export async function processDueJobs(
  worker: string,
  batch = 10,
): Promise<JobRunResult[]> {
  const supabase = createSupabaseAdminClient();
  const { data: jobs, error } = await supabase.rpc("claim_due_jobs", {
    p_worker: worker,
    p_batch: batch,
  });
  if (error) throw new Error(`claim_due_jobs failed: ${error.message}`);

  const results: JobRunResult[] = [];
  for (const job of jobs ?? []) {
    const handler = JOB_HANDLERS[job.job_type as JobType];
    try {
      if (!handler)
        throw new Error(`no handler registered for ${job.job_type}`);
      await handler((job.payload ?? {}) as Record<string, unknown>);
      await supabase
        .from("jobs")
        .update({
          status: "completed",
          locked_at: null,
          locked_by: null,
          last_error: null,
        })
        .eq("id", job.id);
      results.push({ id: job.id, job_type: job.job_type, status: "completed" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const dead = job.attempts >= job.max_attempts;
      // Exponential backoff: 2^attempts minutes until max_attempts, then dead.
      const runAt = new Date(Date.now() + 2 ** job.attempts * 60_000);
      await supabase
        .from("jobs")
        .update({
          status: dead ? "dead" : "pending",
          run_at: dead ? job.run_at : runAt.toISOString(),
          locked_at: null,
          locked_by: null,
          last_error: message.slice(0, 2000),
        })
        .eq("id", job.id);
      logger.error(`job failed`, {
        jobId: job.id,
        jobType: job.job_type,
        result: message,
      });
      results.push({
        id: job.id,
        job_type: job.job_type,
        status: dead ? "dead" : "retry",
      });
    }
  }
  return results;
}
