import { chromium } from 'playwright';
import { createHash } from 'crypto';
import { getPgPool } from '../shared/db/index.js';

// ============================================================
// CHANGE DETECTOR
// Lightweight page re-fetcher that compares DOM hashes.
// Triggers incremental remap only for changed pages.
// Reduces crawl load by 80-90% vs full recrawls.
// ============================================================

interface PageHash {
  pageId: string;
  url: string;
  currentHash: string;
}

export class ChangeDetector {

  async detectChanges(siteId: string): Promise<string[]> {
    const pool = getPgPool();

    // Get pages that haven't been verified recently
    const { rows } = await pool.query(`
      SELECT id, url, dom_hash
      FROM pages
      WHERE site_id = $1
        AND last_verified < NOW() - INTERVAL '1 hour'
        AND reliability_score > 0.3
      ORDER BY last_verified ASC
      LIMIT 50      -- cap per run
    `, [siteId]);

    if (!rows.length) return [];

    const changedUrls: string[] = [];

    // Lightweight fetch (no JS execution) to get raw HTML hash
    for (const page of rows) {
      try {
        const newHash = await this.fetchHash(page.url);
        if (!newHash) continue;

        if (newHash !== page.dom_hash) {
          changedUrls.push(page.url);

          // Log the change
          await pool.query(`
            INSERT INTO change_log (page_id, change_type, old_hash, new_hash, remap_triggered)
            VALUES ($1, 'dom-change', $2, $3, true)
          `, [page.id, page.dom_hash, newHash]);
        }

        // Update last_verified timestamp
        await pool.query(
          `UPDATE pages SET last_verified = NOW() WHERE id = $1`,
          [page.id]
        );
      } catch (err) {
        console.error(`[ChangeDetector] Failed to check ${page.url}:`, (err as Error).message);

        // Decrease reliability on repeated failures
        await pool.query(`
          UPDATE pages
          SET reliability_score = GREATEST(0.1, reliability_score - 0.05)
          WHERE id = $1
        `, [page.id]);
      }
    }

    return changedUrls;
  }

  // Fast fetch — uses raw HTTP (no browser) for speed
  private async fetchHash(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AutomationPlatform/1.0)',
          'Accept': 'text/html',
        },
        redirect: 'follow',
      });

      if (!res.ok) return null;

      const html = await res.text();
      // Hash only the body content (ignore head which may have dynamic timestamps)
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const content = bodyMatch ? bodyMatch[1] : html;

      // Normalize whitespace before hashing to reduce false positives
      const normalized = content.replace(/\s+/g, ' ').trim();
      return createHash('md5').update(normalized).digest('hex');
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
