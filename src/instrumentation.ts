import type { Instrumentation } from "next";

/**
 * Server error reporting. Always logs structured errors; forwards to Sentry
 * when SENTRY_DSN is set, via the store API (no SDK dependency — swap in
 * @sentry/nextjs for tracing/source maps, see docs/operations/deployment.md).
 */

function parseDsn(dsn: string): { endpoint: string; key: string } | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (!url.username || !projectId) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/store/`,
      key: url.username,
    };
  } catch {
    return null;
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

  const dsn = process.env.SENTRY_DSN && parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;

  try {
    await fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=thrivemap/0.1.0, sentry_key=${dsn.key}`,
      },
      body: JSON.stringify({
        message,
        level: "error",
        platform: "node",
        environment: process.env.NODE_ENV,
        tags: {
          routePath: context.routePath,
          routeType: context.routeType,
          digest,
        },
        exception:
          err instanceof Error
            ? {
                values: [
                  { type: err.name, value: err.message, stacktrace: undefined },
                ],
              }
            : undefined,
      }),
      cache: "no-store",
    });
  } catch (cause) {
    console.error("Sentry report failed:", cause);
  }
};
