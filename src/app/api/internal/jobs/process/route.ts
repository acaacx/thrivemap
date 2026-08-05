import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { processDueJobs } from "@/modules/jobs/processor";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function secretRequired() {
  return NextResponse.json(
    { error: "JOBS_PROCESSOR_SECRET is required in production" },
    { status: 503 },
  );
}

async function tick() {
  const worker = `web-${process.pid}`;
  try {
    const results = await processDueJobs(worker, 10);
    return NextResponse.json({ worker, processed: results.length, results });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Job processor tick. Claims a batch of due jobs and runs their handlers.
 * Protected by the x-jobs-secret header; without a configured secret it only
 * runs in development (local tick / manual curl).
 */
export async function POST(request: Request) {
  const secret = serverEnv().JOBS_PROCESSOR_SECRET;
  if (secret) {
    if (request.headers.get("x-jobs-secret") !== secret) {
      return unauthorized();
    }
  } else if (process.env.NODE_ENV === "production") {
    return secretRequired();
  }
  return tick();
}

/**
 * Same tick for Vercel Cron, which can only send GET with
 * `Authorization: Bearer $CRON_SECRET` (no custom headers, no POST). Set the
 * CRON_SECRET env var on Vercel to the JOBS_PROCESSOR_SECRET value and the
 * platform attaches the header itself; see vercel.json for the schedule.
 */
export async function GET(request: Request) {
  const secret = serverEnv().JOBS_PROCESSOR_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return unauthorized();
    }
  } else if (process.env.NODE_ENV === "production") {
    return secretRequired();
  }
  return tick();
}
