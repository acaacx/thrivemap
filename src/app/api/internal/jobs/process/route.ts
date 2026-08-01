import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { JOB_HANDLERS } from "@/modules/jobs/handlers";
import type { JobType } from "@/modules/jobs/queue";

export const dynamic = "force-dynamic";

/**
 * Job processor tick. Claims a batch of due jobs and runs their handlers.
 * Protected by the x-jobs-secret header; without a configured secret it only
 * runs in development (local tick / manual curl).
 */
export async function POST(request: Request) {
  const secret = serverEnv().JOBS_PROCESSOR_SECRET;
  if (secret) {
    if (request.headers.get("x-jobs-secret") !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "JOBS_PROCESSOR_SECRET is required in production" },
      { status: 503 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const worker = `web-${process.pid}`;
  const { data: jobs, error } = await supabase.rpc("claim_due_jobs", {
    p_worker: worker,
    p_batch: 10,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { id: string; job_type: string; status: string }[] = [];
  for (const job of jobs ?? []) {
    const handler = JOB_HANDLERS[job.job_type as JobType];
    try {
      if (!handler) throw new Error(`no handler registered for ${job.job_type}`);
      await handler((job.payload ?? {}) as Record<string, unknown>);
      await supabase
        .from("jobs")
        .update({ status: "completed", locked_at: null, locked_by: null, last_error: null })
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
      console.error(`job ${job.id} (${job.job_type}) failed:`, message);
      results.push({ id: job.id, job_type: job.job_type, status: dead ? "dead" : "retry" });
    }
  }

  return NextResponse.json({ worker, processed: results.length, results });
}
