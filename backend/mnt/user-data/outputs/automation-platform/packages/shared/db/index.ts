import { Pool, PoolClient } from 'pg';
import { createClient, RedisClientType } from 'redis';

// ============================================================
// DATABASE LAYER — Postgres (structured) + Redis (fast cache)
// ============================================================

// ─── Postgres Pool ───────────────────────────────────────────

let pgPool: Pool | null = null;

export function getPgPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      host:     process.env.POSTGRES_HOST ?? 'localhost',
      port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
      database: process.env.POSTGRES_DB ?? 'automation',
      user:     process.env.POSTGRES_USER ?? 'postgres',
      password: process.env.POSTGRES_PASSWORD,
      max:      20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pgPool.on('error', (err) => {
      console.error('[Postgres] Unexpected client error:', err);
    });
  }
  return pgPool;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Redis Client ────────────────────────────────────────────

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
      },
      password: process.env.REDIS_PASSWORD,
    }) as RedisClientType;

    redisClient.on('error', (err) => console.error('[Redis] Client error:', err));
    await redisClient.connect();
  }
  return redisClient;
}

// ─── Schema Migrations ───────────────────────────────────────

export const SCHEMA_SQL = `
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy text search

-- ─── Sites ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain          TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  page_count      INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'active',  -- active | archived | blocked
  config          JSONB DEFAULT '{}'      -- per-site crawl config
);

-- ─── Pages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url               TEXT NOT NULL,
  title             TEXT,
  load_time_ms      INTEGER,
  reliability_score FLOAT DEFAULT 1.0,
  last_verified     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dom_hash          TEXT,           -- MD5 of HTML for change detection
  UNIQUE(site_id, url)
);
CREATE INDEX IF NOT EXISTS idx_pages_site_id  ON pages(site_id);
CREATE INDEX IF NOT EXISTS idx_pages_url      ON pages USING gin(url gin_trgm_ops);

-- ─── Page Edges (navigation graph) ──────────────────────────
CREATE TABLE IF NOT EXISTS page_edges (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id          UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  from_page_id     UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  to_page_id       UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  link_text        TEXT,
  selector         TEXT,
  navigation_type  TEXT NOT NULL,   -- click | form-submit | direct
  UNIQUE(from_page_id, to_page_id, selector)
);

-- ─── Elements ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id         UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  label           TEXT,
  attributes      JSONB DEFAULT '{}',
  bounding_box    JSONB,
  visible         BOOLEAN DEFAULT true,
  interactable    BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_elements_page_id ON elements(page_id);
CREATE INDEX IF NOT EXISTS idx_elements_type    ON elements(type);

-- ─── Selectors (ranked fallback chain per element) ───────────
CREATE TABLE IF NOT EXISTS selectors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  element_id      UUID NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  value           TEXT NOT NULL,
  type            TEXT NOT NULL,     -- css | xpath | text | aria | ai-generated
  confidence      FLOAT DEFAULT 1.0,
  failure_count   INTEGER DEFAULT 0,
  last_validated  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(element_id, value)
);
CREATE INDEX IF NOT EXISTS idx_selectors_element_id ON selectors(element_id);
CREATE INDEX IF NOT EXISTS idx_selectors_confidence ON selectors(confidence DESC);

-- ─── Sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             TEXT NOT NULL,
  site_id             UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cookies             JSONB DEFAULT '[]',
  local_storage       JSONB DEFAULT '{}',
  proxy_id            UUID,
  browser_context_id  TEXT,
  is_active           BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id  ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_site_id  ON sessions(site_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active   ON sessions(is_active) WHERE is_active = true;

-- ─── Proxies ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proxies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host            TEXT NOT NULL,
  port            INTEGER NOT NULL,
  username        TEXT,
  password        TEXT,
  protocol        TEXT NOT NULL DEFAULT 'http',
  health_score    FLOAT DEFAULT 1.0,
  latency_ms      INTEGER,
  failure_rate    FLOAT DEFAULT 0,
  last_checked    TIMESTAMPTZ DEFAULT NOW(),
  tags            TEXT[] DEFAULT '{}',
  is_active       BOOLEAN DEFAULT true,
  UNIQUE(host, port)
);
CREATE INDEX IF NOT EXISTS idx_proxies_health   ON proxies(health_score DESC) WHERE is_active = true;

-- ─── Cached Flows (AI result cache) ─────────────────────────
CREATE TABLE IF NOT EXISTS cached_flows (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  task_hash       TEXT NOT NULL,
  task            TEXT NOT NULL,
  action_plan     JSONB NOT NULL,
  success_count   INTEGER DEFAULT 0,
  failure_count   INTEGER DEFAULT 0,
  last_used       TIMESTAMPTZ DEFAULT NOW(),
  avg_duration_ms INTEGER DEFAULT 0,
  UNIQUE(site_id, task_hash)
);
CREATE INDEX IF NOT EXISTS idx_flows_site_task ON cached_flows(site_id, task_hash);

-- ─── Jobs (audit log) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_logs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                TEXT NOT NULL,
  type                  TEXT NOT NULL,
  user_id               TEXT,
  site_id               UUID,
  status                TEXT NOT NULL,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  duration_ms           INTEGER,
  success               BOOLEAN,
  ai_call_count         INTEGER DEFAULT 0,
  selector_fallback_cnt INTEGER DEFAULT 0,
  retry_count           INTEGER DEFAULT 0,
  error                 TEXT,
  result                JSONB
);
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id   ON job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_user_id  ON job_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_type     ON job_logs(type);

-- ─── Change Detection Log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id         UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_type     TEXT NOT NULL,  -- dom-change | selector-broken | load-fail
  old_hash        TEXT,
  new_hash        TEXT,
  remap_triggered BOOLEAN DEFAULT false
);

-- ─── Auto-update updated_at ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
`;

export async function runMigrations(): Promise<void> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    console.log('[DB] Running migrations...');
    await client.query(SCHEMA_SQL);
    console.log('[DB] ✅ Migrations complete');
  } finally {
    client.release();
  }
}

// ─── Cache Helpers ───────────────────────────────────────────

export const CacheKeys = {
  siteGraph:   (siteId: string) => `site:${siteId}:graph`,
  pageElement: (pageId: string) => `page:${pageId}:elements`,
  session:     (sessionId: string) => `session:${sessionId}`,
  proxyPool:   () => 'proxies:active',
  flowCache:   (siteId: string, taskHash: string) => `flow:${siteId}:${taskHash}`,
  domSnapshot: (pageId: string) => `dom:${pageId}:snapshot`,
};

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 3600
): Promise<void> {
  const redis = await getRedisClient();
  await redis.setEx(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  const val = await redis.get(key);
  return val ? (JSON.parse(val) as T) : null;
}

export async function cacheDelete(key: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(key);
}
