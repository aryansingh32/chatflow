import { getPgPool, cacheGet, cacheSet, cacheDelete, CacheKeys } from '../shared/db/index.js';
import { ProxyManager } from './proxy-manager.js';
// ============================================================
// SESSION MANAGER
// Creates, persists, and restores browser sessions per user.
// Attaches: cookies, localStorage, assigned proxy.
// Reuses sessions to preserve login state across jobs.
// ============================================================
export class SessionManager {
    proxyManager;
    constructor() {
        this.proxyManager = new ProxyManager();
    }
    // ─── Get or create a session ─────────────────────────────────
    async getOrCreate(sessionId, userId, siteId) {
        // 1. Check Redis cache first (fast path)
        const cached = await cacheGet(CacheKeys.session(sessionId));
        if (cached)
            return cached;
        // 2. Check Postgres
        const pool = getPgPool();
        const { rows } = await pool.query(`
      SELECT * FROM sessions
      WHERE id = $1 AND user_id = $2 AND is_active = true
    `, [sessionId, userId]);
        if (rows.length > 0) {
            const session = this.rowToSession(rows[0]);
            await cacheSet(CacheKeys.session(sessionId), session, 900); // 15 mins hard limit
            return session;
        }
        // 3. Create new session
        return this.create(sessionId, userId, siteId);
    }
    // ─── Create new session ──────────────────────────────────────
    async create(sessionId, userId, siteId, forceNewProxy = false) {
        const proxy = await this.proxyManager.getBestProxy();
        const pool = getPgPool();
        await pool.query(`
      INSERT INTO sessions (id, user_id, site_id, cookies, local_storage, proxy_id, is_active)
      VALUES ($1, $2, $3, '[]', '{}', $4, true)
      ON CONFLICT (id) DO NOTHING
    `, [sessionId, userId, siteId, proxy?.id ?? null]);
        const session = {
            id: sessionId,
            userId,
            siteId,
            createdAt: new Date(),
            lastUsed: new Date(),
            cookies: [],
            localStorage: {},
            proxy: proxy ?? undefined,
            isActive: true,
        };
        await cacheSet(CacheKeys.session(sessionId), session, 900); // 15 mins hard limit
        return session;
    }
    // ─── Save session state after execution ──────────────────────
    async save(sessionId, page, context) {
        try {
            const cookies = await context.cookies();
            const localStorage = await page.evaluate(() => {
                const data = {};
                for (let i = 0; i < window.localStorage.length; i++) {
                    const key = window.localStorage.key(i);
                    if (key)
                        data[key] = window.localStorage.getItem(key) ?? '';
                }
                return data;
            }).catch(() => ({}));
            const pool = getPgPool();
            await pool.query(`
        UPDATE sessions
        SET cookies = $1,
            local_storage = $2,
            last_used = NOW()
        WHERE id = $3
      `, [JSON.stringify(cookies), JSON.stringify(localStorage), sessionId]);
            // Refresh cache
            const cached = await cacheGet(CacheKeys.session(sessionId));
            if (cached) {
                cached.cookies = cookies;
                cached.localStorage = localStorage;
                cached.lastUsed = new Date();
                await cacheSet(CacheKeys.session(sessionId), cached, 900); // 15 mins hard limit
            }
        }
        catch (err) {
            console.error(`[SessionManager] Failed to save session ${sessionId}:`, err);
        }
    }
    // ─── Rotate proxy for a session ──────────────────────────────
    async rotateProxy(sessionId) {
        const newProxy = await this.proxyManager.getBestProxy();
        if (!newProxy)
            return;
        const pool = getPgPool();
        await pool.query(`UPDATE sessions SET proxy_id = $1 WHERE id = $2`, [newProxy.id, sessionId]);
        await cacheDelete(CacheKeys.session(sessionId));
    }
    // ─── Invalidate / destroy ─────────────────────────────────────
    async invalidate(sessionId) {
        const pool = getPgPool();
        await pool.query(`UPDATE sessions SET is_active = false WHERE id = $1`, [sessionId]);
        await cacheDelete(CacheKeys.session(sessionId));
    }
    // ─── Cleanup stale sessions (called by scheduler) ────────────
    async cleanupStale(olderThanHours = 24) {
        const pool = getPgPool();
        const { rowCount } = await pool.query(`
      UPDATE sessions
      SET is_active = false
      WHERE last_used < NOW() - INTERVAL '${olderThanHours} hours'
        AND is_active = true
    `);
        console.log(`[SessionManager] Cleaned up ${rowCount} stale sessions`);
        return rowCount ?? 0;
    }
    // ─── Row mapper ───────────────────────────────────────────────
    rowToSession(row) {
        return {
            id: row.id,
            userId: row.user_id,
            siteId: row.site_id,
            createdAt: row.created_at,
            lastUsed: row.last_used,
            cookies: row.cookies ?? [],
            localStorage: row.local_storage ?? {},
            // Don't construct a partial proxy from just proxy_id — it lacks host/port/protocol
            // and would crash Playwright's newContext. Proxy will be assigned fresh if needed.
            proxy: undefined,
            browserContextId: row.browser_context_id,
            isActive: row.is_active,
        };
    }
}
//# sourceMappingURL=session-manager.js.map