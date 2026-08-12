import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

/**
 * Server error reporting. Always logs structured errors; forwards to Sentry
 * via @sentry/nextjs when SENTRY_DSN is set (see docs/operations/deployment.md).
 *
 * The structured log is deliberately kept alongside Sentry — it is the only
 * error record that survives when the DSN is unset (local dev) or when Sentry
 * ingestion is failing, and it is what `vercel logs` greps against.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }

  if (!process.env.SENTRY_DSN && process.env.NODE_ENV !== "production") {
    console.info(
      "[DEV ADAPTER] Sentry not configured — server errors are logged only.",
    );
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest: unknown }).digest)
      : undefined;

  // Structured log — never headers (may carry cookies/authorization).
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      message,
      digest,
      path: request.path.split("?")[0],
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );

  // No-op while the SDK is disabled (no DSN), so this needs no env guard.
  Sentry.captureRequestError(err, request, context);
};
