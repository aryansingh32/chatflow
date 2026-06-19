const LEVEL_PRIORITY = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};
const configuredLevel = process.env.LOG_LEVEL?.toLowerCase() ?? 'info';
const minimumLevel = LEVEL_PRIORITY[configuredLevel] ?? LEVEL_PRIORITY.info;
function shouldLog(level) {
    return LEVEL_PRIORITY[level] >= minimumLevel;
}
function serializeError(error) {
    if (error instanceof Error) {
        return {
            errorName: error.name,
            errorMessage: error.message,
            stack: error.stack,
        };
    }
    return { error };
}
function write(level, scope, message, context) {
    if (!shouldLog(level))
        return;
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
    }
    else if (level === 'warn') {
        console.warn(line);
    }
    else {
        console.log(line);
    }
}
export function createLogger(scope) {
    return {
        debug(message, context) {
            write('debug', scope, message, context);
        },
        info(message, context) {
            write('info', scope, message, context);
        },
        warn(message, context) {
            write('warn', scope, message, context);
        },
        error(message, error, context) {
            write('error', scope, message, {
                ...(context ?? {}),
                ...(error === undefined ? {} : serializeError(error)),
            });
        },
        child(childScope) {
            return createLogger(`${scope}:${childScope}`);
        },
    };
}
//# sourceMappingURL=index.js.map