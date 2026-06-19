export declare const ADMIN_OBSERVABILITY_CHANNEL = "admin:observability";
export interface ClientEventInput {
    eventType: string;
    sessionId?: string;
    userId?: string;
    traceId?: string;
    spanId?: string;
    requestId?: string;
    route?: string;
    release?: string;
    gitSha?: string;
    payload?: Record<string, unknown>;
}
export declare function ingestClientEvents(events: ClientEventInput[], opts: {
    ipHash?: string;
}): Promise<number>;
export declare function recordServerEvent(eventType: string, fields: {
    userId?: string | null;
    sessionId?: string | null;
    traceId?: string | null;
    requestId?: string | null;
    route?: string | null;
    payload?: Record<string, unknown>;
}): Promise<void>;
export interface ErrorReportInput {
    message: string;
    stack?: string;
    userId?: string | null;
    sessionId?: string | null;
    requestId?: string | null;
    traceId?: string | null;
    route?: string | null;
    method?: string | null;
    httpStatus?: number;
    source?: string;
    context?: Record<string, unknown>;
}
export declare function persistErrorReport(input: ErrorReportInput): Promise<string | null>;
export declare function listRecentSessions(limit?: number): Promise<{
    session_id: string;
    user_id: string | null;
    last_ts: string;
    event_count: string;
}[]>;
export declare function getSessionTimeline(sessionId: string, limit?: number): Promise<any[]>;
export declare function listErrorReports(limit?: number): Promise<any[]>;
export declare function getObservabilitySummary(): Promise<{
    events24h: any;
    errors24h: any;
    sessions24h: any;
}>;
/** Rule-based analysis when no LLM key is configured */
export declare function heuristicErrorAnalysis(row: {
    message: string;
    route?: string | null;
    http_status?: number | null;
    context?: unknown;
    stack?: string | null;
}): {
    severity: string;
    probableRootCauses: string[];
    suggestedNextSteps: string[];
};
export declare function copilotAnswer(params: {
    question: string;
    errorReportId?: string;
    extraContext?: Record<string, unknown>;
}): Promise<{
    answer: string;
    model?: string;
    structured?: Record<string, unknown>;
}>;
//# sourceMappingURL=observability.service.d.ts.map