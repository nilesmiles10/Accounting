/**
 * Centralized structured logger (M26 in CODEBASE_REVIEW_FIXES_PART2.md).
 *
 * Wraps pino so every call-site writes JSON lines with timestamps, levels
 * and an optional scope. In Next.js `console.log` still works, but grepping
 * production logs by component or severity was awkward without structured
 * output.
 *
 * Usage:
 *   import { log } from "@/lib/logger";
 *   log.info({ userId, ip }, "login succeeded");
 *   log.warn({ path }, "corrupt JSON, moved to .corrupt");
 *   log.error({ err }, "earnings run failed");
 *
 *   // Or per-subsystem:
 *   const scoped = log.child({ scope: "atomic-store" });
 *   scoped.info({ file }, "wrote atomically");
 *
 * Levels: trace < debug < info < warn < error < fatal.
 * Set `LOG_LEVEL=debug` in env to see more detail.
 */
import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const log = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  // Skip pretty-print in prod — ship raw JSON to Docker logs.
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      }
    : {}),
  base: {
    service: "willem-mission-control",
    env: process.env.NODE_ENV,
  },
  redact: {
    // Drop secrets from any log line, even if the call-site forgot.
    paths: [
      "password", "*.password",
      "passwordHash", "*.passwordHash",
      "token", "*.token",
      "apiKey", "*.apiKey", "api_key", "*.api_key",
      "secret", "*.secret",
      "authorization", "*.authorization",
      "cookie", "*.cookie",
      "*.totpSecret", "totpSecret",
    ],
    censor: "***",
  },
});

/** Convenience helper for route handlers: creates a child logger with
 *  request metadata. Caller still does the actual log.info calls. */
export function requestLogger(scope: string, extra?: Record<string, unknown>) {
  return log.child({ scope, ...extra });
}
