import type { ProxyConfig } from '../shared/types/index.js';
export declare class ProxyManager {
    getBestProxy(): Promise<ProxyConfig | null>;
    getProxyByTag(tag: string): Promise<ProxyConfig | null>;
    reportSuccess(proxyId: string, latencyMs: number): Promise<void>;
    reportFailure(proxyId: string): Promise<void>;
    healthCheckAll(): Promise<void>;
    addProxy(proxy: Omit<ProxyConfig, 'id' | 'healthScore' | 'latencyMs' | 'failureRate' | 'lastChecked'>): Promise<string>;
    importProxies(list: Array<{
        host: string;
        port: number;
        username?: string;
        password?: string;
        protocol?: string;
        tags?: string[];
    }>): Promise<number>;
    private getActiveProxies;
    private pingProxy;
    private invalidateCache;
    getStats(): Promise<any>;
}
//# sourceMappingURL=proxy-manager.d.ts.map