/**
 * Structured logger. JSON lines in production, readable lines in dev.
 *
 * Never log: tokens, passwords, claim document contents, precise user
 * location. Redaction below is a backstop — callers must not pass them.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  route?: string;
  userId?: string;
  durationMs?: number;
  result?: string;
  [key: string]: unknown;
}

const REDACT_KEYS =
  /token|password|secret|authorization|cookie|api[-_]?key|lat|lng|latitude|longitude/i;

function redact(context: LogContext): LogContext {
  const clean: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    clean[key] = REDACT_KEYS.test(key) ? "[redacted]" : value;
  }
  return clean;
}

function emit(level: LogLevel, message: string, context: LogContext = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...redact(context),
  };
  const line =
    process.env.NODE_ENV === "production"
      ? JSON.stringify(entry)
      : `[${level}] ${message}${Object.keys(context).length ? " " + JSON.stringify(redact(context)) : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV !== "production") emit("debug", message, context);
  },
  info: (message: string, context?: LogContext) =>
    emit("info", message, context),
  warn: (message: string, context?: LogContext) =>
    emit("warn", message, context),
  error: (message: string, context?: LogContext) =>
    emit("error", message, context),
  /** Bind shared context (e.g. requestId, route) once per request. */
  child(bound: LogContext) {
    return {
      debug: (message: string, context?: LogContext) =>
        logger.debug(message, { ...bound, ...context }),
      info: (message: string, context?: LogContext) =>
        logger.info(message, { ...bound, ...context }),
      warn: (message: string, context?: LogContext) =>
        logger.warn(message, { ...bound, ...context }),
      error: (message: string, context?: LogContext) =>
        logger.error(message, { ...bound, ...context }),
    };
  },
};
