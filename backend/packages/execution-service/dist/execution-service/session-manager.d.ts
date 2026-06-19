import type { Page, BrowserContext } from 'playwright';
import type { Session } from '../shared/types/index.js';
export declare class SessionManager {
    private proxyManager;
    constructor();
    getOrCreate(sessionId: string, userId: string, siteId: string): Promise<Session>;
    create(sessionId: string, userId: string, siteId: string, forceNewProxy?: boolean): Promise<Session>;
    save(sessionId: string, page: Page, context: BrowserContext): Promise<void>;
    rotateProxy(sessionId: string): Promise<void>;
    invalidate(sessionId: string): Promise<void>;
    cleanupStale(olderThanHours?: number): Promise<number>;
    private rowToSession;
}
//# sourceMappingURL=session-manager.d.ts.map