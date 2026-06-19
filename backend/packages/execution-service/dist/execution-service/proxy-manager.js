import { getPgPool, getRedisClient, CacheKeys } from '../shared/db/index.js';
// ============================================================
// PROXY MANAGER
// Health-scored proxy pool with automatic failure tracking.
// Prioritizes stability over raw rotation speed.
// ============================================================
const HEALTH_DECAY_ON_FAILURE = 0.2;
const HEALTH_GAIN_ON_SUCCESS = 0.05;
const MIN_HEALTH_SCORE = 0.1;
const PROXY_CACHE_TTL = 300; // 5 min
export class ProxyManager {
    // ─── Get best proxy from pool ────────────────────────────────
    async getBestProxy() {
        const proxies = await this.getActiveProxies();
        if (!proxies.length)
            return null;
        // Sort by health score (desc) then latency (asc)
        proxies.sort((a, b) => {
            const healthDiff = b.healthScore - a.healthScore;
            if (Math.abs(healthDiff) > 0.1)
                return healthDiff;
            return (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999);
        });
        // Weighted random from top 5 — avoids always hammering #1
        const pool = proxies.slice(0, 5);
        const totalWeight = pool.reduce((s, p) => s + p.healthScore, 0);
        let rand = Math.random() * totalWeight;
        for (const proxy of pool) {
            rand -= proxy.healthScore;
            if (rand <= 0)
                return proxy;
        }
        return pool[0];
    }
    // ─── Get proxies for a specific tag (e.g. 'residential') ─────
    async getProxyByTag(tag) {
        const proxies = await this.getActiveProxies();
        const tagged = proxies.filter((p) => p.tags.includes(tag));
        if (!tagged.length)
            return null;
        tagged.sort((a, b) => b.healthScore - a.healthScore);
        return tagged[0];
    }
    // ─── Report success/failure ──────────────────────────────────
    async reportSuccess(proxyId, latencyMs) {
        const pool = getPgPool();
        await pool.query(`
      UPDATE proxies
      SET health_score  = LEAST(1.0, health_score + $1),
          latency_ms    = $2,
          failure_rate  = GREATEST(0, failure_rate - 0.02),
          last_checked  = NOW()
      WHERE id = $3
    `, [HEALTH_GAIN_ON_SUCCESS, latencyMs, proxyId]);
        await this.invalidateCache();
    }
    async reportFailure(proxyId) {
        const pool = getPgPool();
        const { rows } = await pool.query(`
      UPDATE proxies
      SET health_score  = GREATEST($1, health_score - $2),
          failure_rate  = LEAST(1.0, failure_rate + 0.1),
          last_checked  = NOW()
      WHERE id = $3
      RETURNING health_score
    `, [MIN_HEALTH_SCORE, HEALTH_DECAY_ON_FAILURE, proxyId]);
        // Auto-disable proxies below threshold
        if (rows.length && parseFloat(rows[0].health_score) <= MIN_HEALTH_SCORE) {
            await pool.query(`UPDATE proxies SET is_active = false WHERE id = $1`, [proxyId]);
            console.warn(`[ProxyManager] Proxy ${proxyId} disabled (health too low)`);
        }
        await this.invalidateCache();
    }
    // ─── Health check all proxies (called by scheduler) ──────────
    async healthCheckAll() {
        const pool = getPgPool();
        const { rows } = await pool.query(`SELECT id, host, port, protocol, username, password FROM proxies WHERE is_active = true`);
        console.log(`[ProxyManager] Health checking ${rows.length} proxies...`);
        await Promise.allSettled(rows.map(async (proxy) => {
            const result = await this.pingProxy(proxy);
            if (result.alive) {
                await this.reportSuccess(proxy.id, result.latencyMs);
            }
            else {
                await this.reportFailure(proxy.id);
            }
        }));
        await this.invalidateCache();
        console.log('[ProxyManager] Health check complete');
    }
    // ─── Add proxies ─────────────────────────────────────────────
    async addProxy(proxy) {
        const pool = getPgPool();
        const { rows } = await pool.query(`
      INSERT INTO proxies (host, port, username, password, protocol, tags, health_score, failure_rate)
      VALUES ($1, $2, $3, $4, $5, $6, 1.0, 0.0)
      ON CONFLICT (host, port) DO UPDATE SET
        username = EXCLUDED.username,
        password = EXCLUDED.password,
        is_active = true
      RETURNING id
    `, [proxy.host, proxy.port, proxy.username, proxy.password, proxy.protocol, proxy.tags ?? []]);
        await this.invalidateCache();
        return rows[0].id;
    }
    // ─── Bulk import ─────────────────────────────────────────────
    async importProxies(list) {
        let count = 0;
        for (const p of list) {
            await this.addProxy({
                host: p.host,
                port: p.port,
                username: p.username,
                password: p.password,
                protocol: (p.protocol ?? 'http'),
                tags: p.tags ?? [],
            });
            count++;
        }
        return count;
    }
    // ─── Internal ────────────────────────────────────────────────
    async getActiveProxies() {
        // Try Redis cache first
        const redis = await getRedisClient();
        const cached = await redis.get(CacheKeys.proxyPool());
        if (cached)
            return JSON.parse(cached);
        const pool = getPgPool();
        const { rows } = await pool.query(`
      SELECT id, host, port, username, password, protocol,
             health_score, latency_ms, failure_rate, last_checked, tags
      FROM proxies
      WHERE is_active = true AND health_score > $1
      ORDER BY health_score DESC
      LIMIT 100
    `, [MIN_HEALTH_SCORE]);
        const proxies = rows.map((r) => ({
            id: r.id,
            host: r.host,
            port: r.port,
            username: r.username,
            password: r.password,
            protocol: r.protocol,
            healthScore: parseFloat(r.health_score),
            latencyMs: r.latency_ms ?? 9999,
            failureRate: parseFloat(r.failure_rate),
            lastChecked: r.last_checked,
            tags: r.tags ?? [],
        }));
        await redis.setEx(CacheKeys.proxyPool(), PROXY_CACHE_TTL, JSON.stringify(proxies));
        return proxies;
    }
    async pingProxy(proxy) {
        const start = Date.now();
        try {
            // Simple TCP connect test
            const { createConnection } = await import('net');
            await new Promise((resolve, reject) => {
                const socket = createConnection({ host: proxy.host, port: proxy.port, timeout: 5000 });
                socket.on('connect', () => { socket.destroy(); resolve(); });
                socket.on('error', reject);
                socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
            });
            return { alive: true, latencyMs: Date.now() - start };
        }
        catch {
            return { alive: false, latencyMs: Date.now() - start };
        }
    }
    async invalidateCache() {
        const redis = await getRedisClient();
        await redis.del(CacheKeys.proxyPool());
    }
    // ─── Stats ────────────────────────────────────────────────────
    async getStats() {
        const pool = getPgPool();
        const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active = true) AS active,
        COUNT(*) FILTER (WHERE is_active = false) AS disabled,
        AVG(health_score) FILTER (WHERE is_active = true) AS avg_health,
        AVG(latency_ms) FILTER (WHERE is_active = true) AS avg_latency,
        MIN(health_score) FILTER (WHERE is_active = true) AS min_health
      FROM proxies
    `);
        return rows[0];
    }
}
//# sourceMappingURL=proxy-manager.js.map