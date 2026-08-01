import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "degraded" | "down";

interface HealthCheck {
  status: CheckStatus;
  detail?: string;
}

/**
 * Liveness + dependency health. `app` is always ok if we can respond; `db`
 * probes Postgres; `jobs` degrades on dead jobs or a stuck backlog; `redis`
 * only reports when Upstash is configured.
 */
export async function GET() {
  const checks: Record<string, HealthCheck> = { app: { status: "ok" } };

  const supabase = createSupabaseAdminClient();
  try {
    const { error } = await supabase.from("services").select("id").limit(1);
    checks.db = error
      ? { status: "down", detail: error.message }
      : { status: "ok" };
  } catch (cause) {
    checks.db = { status: "down", detail: String(cause) };
  }

  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const [dead, overdue] = await Promise.all([
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "dead"),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lt("run_at", tenMinutesAgo),
    ]);
    const deadCount = dead.count ?? 0;
    const overdueCount = overdue.count ?? 0;
    checks.jobs =
      deadCount > 0 || overdueCount > 25
        ? {
            status: "degraded",
            detail: `${deadCount} dead, ${overdueCount} overdue`,
          }
        : { status: "ok" };
  } catch (cause) {
    checks.jobs = { status: "down", detail: String(cause) };
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (redisUrl && redisToken) {
    try {
      const res = await fetch(redisUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redisToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["PING"]),
        cache: "no-store",
      });
      checks.redis = res.ok
        ? { status: "ok" }
        : { status: "down", detail: `status ${res.status}` };
    } catch (cause) {
      checks.redis = { status: "down", detail: String(cause) };
    }
  }

  const worst: CheckStatus = Object.values(checks).some(
    (c) => c.status === "down",
  )
    ? "down"
    : Object.values(checks).some((c) => c.status === "degraded")
      ? "degraded"
      : "ok";

  return NextResponse.json(
    { status: worst, checks, ts: new Date().toISOString() },
    { status: worst === "down" ? 503 : 200 },
  );
}
