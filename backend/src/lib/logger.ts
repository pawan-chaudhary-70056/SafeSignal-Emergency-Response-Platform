/**
 * NFR-064: structured JSON logging for important application events and
 * failures. Every line is a single JSON object so log aggregators can index
 * fields without parsing, and context values never include request bodies or
 * credentials — callers pass identifiers only.
 */
export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

function write(level: LogLevel, message: string, context: LogContext): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

function errorFields(error: unknown): LogContext {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorMessage: String(error) };
}

function withError(error: unknown, context: LogContext): LogContext {
  return error === undefined ? context : { ...errorFields(error), ...context };
}

export const logger = {
  info(message: string, context: LogContext = {}): void {
    write("info", message, context);
  },
  warn(message: string, error?: unknown, context: LogContext = {}): void {
    write("warn", message, withError(error, context));
  },
  error(message: string, error?: unknown, context: LogContext = {}): void {
    write("error", message, withError(error, context));
  },
};
