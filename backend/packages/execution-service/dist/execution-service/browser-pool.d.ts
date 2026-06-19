import type { BrowserContext, Page } from 'playwright';
import { EventEmitter } from 'events';
import type { Session, ProxyConfig } from '../shared/types/index.js';
interface ContextLease {
    contextId: string;
    browserId: string;
    context: BrowserContext;
    sessionId: string;
    userId: string;
    acquiredAt: Date;
    page?: Page;
}
interface BrowserPoolConfig {
    minBrowsers: number;
    maxBrowsers: number;
    maxContextsPerBrowser: number;
    contextIdleTimeoutMs: number;
    browserMaxAgeMs: number;
    launchArgs?: string[];
}
export declare class BrowserPool extends EventEmitter {
    private config;
    private browsers;
    private contexts;
    private contextLastUsed;
    private healthCheckInterval?;
    private reclaimInterval?;
    constructor(config?: Partial<BrowserPoolConfig>);
    init(): Promise<void>;
    shutdown(): Promise<void>;
    acquireContext(sessionId: string, userId: string, session?: Partial<Session>, proxy?: ProxyConfig, lightweight?: boolean): Promise<ContextLease>;
    releaseContext(contextId: string, saveSession?: boolean): Promise<void>;
    releaseContextBySessionId(sessionId: string, saveSession?: boolean): Promise<void>;
    getOrCreatePage(contextId: string): Promise<Page>;
    private spawnBrowser;
    private findOrSpawnBrowser;
    private createContext;
    private applyStealthSettings;
    private startHealthCheck;
    private startIdleReclaim;
    reclaimIdleBrowsers(): Promise<void>;
    getStats(): {
        browsers: number;
        healthyBrowsers: number;
        activeContexts: number;
        totalCapacity: number;
    };
}
export declare function getBrowserPool(): BrowserPool;
export {};
//# sourceMappingURL=browser-pool.d.ts.map