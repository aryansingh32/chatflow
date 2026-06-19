type LogContext = Record<string, unknown>;
export declare function createLogger(scope: string): {
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, error?: unknown, context?: LogContext): void;
    child(childScope: string): /*elided*/ any;
};
export {};
//# sourceMappingURL=index.d.ts.map