type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined) ?? 'info';
const minimumLevel = LEVEL_PRIORITY[configuredLevel] ?? LEVEL_PRIORITY.info;

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= minimumLevel;
}

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

function write(level: LogLevel, scope: string, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(context ?? {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function createLogger(scope: string) {
  return {
    debug(message: string, context?: LogContext) {
      write('debug', scope, message, context);
    },
    info(message: string, context?: LogContext) {
      write('info', scope, message, context);
    },
    warn(message: string, context?: LogContext) {
      write('warn', scope, message, context);
    },
    error(message: string, error?: unknown, context?: LogContext) {
      write('error', scope, message, {
        ...(context ?? {}),
        ...(error === undefined ? {} : serializeError(error)),
      });
    },
    child(childScope: string) {
      return createLogger(`${scope}:${childScope}`);
    },
  };
}
