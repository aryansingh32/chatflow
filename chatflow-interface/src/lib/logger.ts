type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    };
  }
  return { error };
}

function emit(level: LogLevel, scope: string, message: string, context?: LogContext) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(context ?? {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else if (level === "info") {
    console.info(line);
  } else {
    console.debug(line);
  }
}

export function createLogger(scope: string) {
  return {
    debug(message: string, context?: LogContext) {
      emit("debug", scope, message, context);
    },
    info(message: string, context?: LogContext) {
      emit("info", scope, message, context);
    },
    warn(message: string, context?: LogContext) {
      emit("warn", scope, message, context);
    },
    error(message: string, error?: unknown, context?: LogContext) {
      emit("error", scope, message, {
        ...(context ?? {}),
        ...(error === undefined ? {} : serializeError(error)),
      });
    },
    child(childScope: string) {
      return createLogger(`${scope}:${childScope}`);
    },
  };
}
