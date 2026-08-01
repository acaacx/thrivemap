import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { processDueJobs } from "@/modules/jobs/processor";

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

  const worker = `web-${process.pid}`;
  try {
    const results = await processDueJobs(worker, 10);
    return NextResponse.json({ worker, processed: results.length, results });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
