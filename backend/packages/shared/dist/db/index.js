import pg from 'pg';
import { createClient } from 'redis';
// ============================================================
// DATABASE & CACHE LAYER
// Postgres for structured data, Redis for fast cache + sessions.
// Full schema migrations run on startup.
// ============================================================
const { Pool } = pg;
// ─── Postgres ────────────────────────────────────────────────
let pgPool = null;
export function getPgPool() {
    if (!pgPool) {
        pgPool = new Pool({
            host: process.env.POSTGRES_HOST ?? 'localhost',
            port: parseInt(process.env.POSTGRES_PORT ?? '5432'),
            database: process.env.POSTGRES_DB ?? 'automation',
            user: process.env.POSTGRES_USER ?? 'postgres',
            password: process.env.POSTGRES_PASSWORD ?? 'changeme',
            max: 20,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
        });
        pgPool.on('error', (err) => {
            console.error('[DB] Unexpected pool error:', err.message);
        });
    }
    return pgPool;
}
// ─── Transaction Helper ──────────────────────────────────────
export async function withTransaction(fn) {
    const client = await getPgPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
// ─── Redis ───────────────────────────────────────────────────
let redisClient = null;
export async function getRedisClient() {
    if (!redisClient) {
        const password = process.env.REDIS_PASSWORD;
        const url = password
            ? `redis://:${password}@${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? '6379'}`
            : `redis://${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? '6379'}`;
        redisClient = createClient({ url });
        redisClient.on('error', (err) => {
            console.error('[Redis] Client error:', err.message);
        });
        await redisClient.connect();
        console.log('[Redis] Connected');
    }
    return redisClient;
}
// ─── Cache Helpers ───────────────────────────────────────────
export async function cacheGet(key) {
    try {
        const redis = await getRedisClient();
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    }
    catch {
        return null;
    }
}
export async function cacheSet(key, value, ttlSeconds = 1800) {
    try {
        const redis = await getRedisClient();
        await redis.setEx(key, ttlSeconds, JSON.stringify(value));
    }
    catch (err) {
        console.error('[Cache] Set failed:', err.message);
    }
}
export async function cacheDelete(key) {
    try {
        const redis = await getRedisClient();
        await redis.del(key);
    }
    catch { }
}
// ─── Cache Key Constants ─────────────────────────────────────
export const CacheKeys = {
    session: (id) => `session:${id}`,
    domSnapshot: (pageId) => `dom:${pageId}`,
    siteGraph: (siteId) => `graph:${siteId}`,
    flowCache: (siteId, taskHash) => `flow:${siteId}:${taskHash}`,
    jobRuntime: (jobId) => `job-runtime:${jobId}`,
    proxyPool: () => 'proxy:pool',
};
// ─── Schema Migrations ───────────────────────────────────────
const SCHEMA_SQL = `

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Sites ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain      TEXT UNIQUE NOT NULL,
  config      JSONB DEFAULT '{}',
  page_count  INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Pages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url               TEXT NOT NULL,
  title             TEXT,
  load_time_ms      INTEGER,
  dom_hash          TEXT,
  reliability_score REAL DEFAULT 1.0,
  last_verified     TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (site_id, url)
);
CREATE INDEX IF NOT EXISTS idx_pages_site_id ON pages(site_id);
CREATE INDEX IF NOT EXISTS idx_pages_url ON pages(url);

-- ── Elements ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elements (
  id            TEXT PRIMARY KEY,
  page_id       UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  label         TEXT,
  attributes    JSONB DEFAULT '{}',
  bounding_box  JSONB,
  visible       BOOLEAN DEFAULT true,
  interactable  BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_elements_page_id ON elements(page_id);
CREATE INDEX IF NOT EXISTS idx_elements_type ON elements(type);

-- ── Selectors ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS selectors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  element_id      TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  value           TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('css', 'xpath', 'text', 'aria', 'ai-generated')),
  confidence      REAL DEFAULT 0.5,
  last_validated  TIMESTAMPTZ DEFAULT NOW(),
  failure_count   INTEGER DEFAULT 0,
  UNIQUE (element_id, value)
);
CREATE INDEX IF NOT EXISTS idx_selectors_element_id ON selectors(element_id);

-- ── Page Edges (Navigation Graph) ────────────────────────────
CREATE TABLE IF NOT EXISTS page_edges (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  from_page_id    UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  to_page_id      UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  link_text       TEXT,
  selector        TEXT,
  navigation_type TEXT DEFAULT 'click' CHECK (navigation_type IN ('click', 'form-submit', 'direct')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_page_edges_site ON page_edges(site_id);

-- ── Sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  site_id             UUID REFERENCES sites(id) ON DELETE SET NULL,
  cookies             JSONB DEFAULT '[]',
  local_storage       JSONB DEFAULT '{}',
  proxy_id            UUID,
  browser_context_id  TEXT,
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  last_used           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ── User Profiles (safe long-term memory) ───────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       TEXT NOT NULL,
  profile_name  TEXT NOT NULL,
  data          JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, profile_name)
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- ── Site Workflows / Custom Mapping Instructions ────────────
CREATE TABLE IF NOT EXISTS site_workflows (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id               UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  trigger               TEXT NOT NULL,
  portal_type           TEXT CHECK (portal_type IN ('government', 'jobs', 'education', 'banking', 'general', 'aadhaar')),
  site_section          TEXT,
  entry_url             TEXT,
  page_url              TEXT,
  page_url_pattern      TEXT,
  required_inputs       TEXT[] DEFAULT '{}',
  required_files        TEXT[] DEFAULT '{}',
  instructions          TEXT NOT NULL,
  default_profile_name  TEXT,
  starter_action_plan   JSONB DEFAULT '[]',
  version               INTEGER DEFAULT 1,
  is_active             BOOLEAN DEFAULT true,
  completion_artifact   TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (site_id, name)
);
CREATE INDEX IF NOT EXISTS idx_site_workflows_site_id ON site_workflows(site_id);
ALTER TABLE site_workflows ADD COLUMN IF NOT EXISTS portal_type TEXT;
ALTER TABLE site_workflows ADD COLUMN IF NOT EXISTS site_section TEXT;
ALTER TABLE site_workflows ADD COLUMN IF NOT EXISTS entry_url TEXT;
ALTER TABLE site_workflows ADD COLUMN IF NOT EXISTS page_url TEXT;
ALTER TABLE site_workflows ADD COLUMN IF NOT EXISTS page_url_pattern TEXT;
ALTER TABLE site_workflows ADD COLUMN IF NOT EXISTS required_inputs TEXT[] DEFAULT '{}';
ALTER TABLE site_workflows ADD COLUMN IF NOT EXISTS required_files TEXT[] DEFAULT '{}';
ALTER TABLE site_workflows ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE site_workflows ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE site_workflows ADD COLUMN IF NOT EXISTS completion_artifact TEXT;

-- ── User Files (uploads/download artifacts) ─────────────────
CREATE TABLE IF NOT EXISTS user_files (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          TEXT NOT NULL,
  profile_name     TEXT,
  category         TEXT NOT NULL CHECK (category IN ('resume', 'signature', 'photo', 'document', 'receipt', 'other')),
  original_name    TEXT NOT NULL,
  stored_name      TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  file_size_bytes  BIGINT NOT NULL,
  storage_path     TEXT NOT NULL,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_files_category ON user_files(category);

-- ── Proxies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proxies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host          TEXT NOT NULL,
  port          INTEGER NOT NULL,
  username      TEXT,
  password      TEXT,
  protocol      TEXT DEFAULT 'http' CHECK (protocol IN ('http', 'https', 'socks5')),
  health_score  REAL DEFAULT 1.0,
  latency_ms    INTEGER,
  failure_rate  REAL DEFAULT 0.0,
  is_active     BOOLEAN DEFAULT true,
  last_checked  TIMESTAMPTZ DEFAULT NOW(),
  tags          TEXT[] DEFAULT '{}',
  UNIQUE (host, port)
);

-- ── Cached Flows (AI Task Memory) ────────────────────────────
CREATE TABLE IF NOT EXISTS cached_flows (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  task_hash       TEXT NOT NULL,
  task            TEXT NOT NULL,
  action_plan     JSONB NOT NULL,
  success_count   INTEGER DEFAULT 0,
  failure_count   INTEGER DEFAULT 0,
  avg_duration_ms INTEGER,
  last_used       TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (site_id, task_hash)
);
CREATE INDEX IF NOT EXISTS idx_cached_flows_lookup ON cached_flows(site_id, task_hash);

-- ── Job Logs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_logs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                TEXT NOT NULL,
  type                  TEXT NOT NULL,
  site_id               UUID REFERENCES sites(id) ON DELETE SET NULL,
  status                TEXT DEFAULT 'pending',
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  duration_ms           INTEGER,
  success               BOOLEAN,
  ai_call_count         INTEGER DEFAULT 0,
  selector_fallback_cnt INTEGER DEFAULT 0,
  retry_count           INTEGER DEFAULT 0,
  result                JSONB,
  error                 TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_status ON job_logs(status);

-- ── Change Log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id           UUID REFERENCES pages(id) ON DELETE CASCADE,
  change_type       TEXT NOT NULL,
  old_hash          TEXT,
  new_hash          TEXT,
  remap_triggered   BOOLEAN DEFAULT false,
  detected_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_change_log_page ON change_log(page_id);

`;
export async function runMigrations() {
    const pool = getPgPool();
    try {
        await pool.query(SCHEMA_SQL);
        console.log('[DB] ✅ Migrations complete — all tables ready');
    }
    catch (err) {
        console.error('[DB] Migration failed:', err.message);
        throw err;
    }
}
//# sourceMappingURL=index.js.map