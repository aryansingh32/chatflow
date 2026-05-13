import {
  PlaywrightCrawler,
  PlaywrightCrawlerOptions,
  RequestQueue,
  Configuration,
} from 'crawlee';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import type pg from 'pg';
import { createHash, randomUUID } from 'crypto';
import type { CrawlJob, PageNode, ExtractedElement, SelectorCandidate, DOMSnapshot, SimplifiedDOM } from '../shared/types/index.js';
import { getPgPool, cacheSet, CacheKeys, withTransaction } from '../shared/db/index.js';

// ============================================================
// CRAWLER SERVICE
// Traverses domains using BFS+DFS hybrid, extracts full DOM
// structure, stores to Postgres and caches in Redis
// ============================================================

interface CrawlResult {
  siteId: string;
  pagesDiscovered: number;
  pagesCrawled: number;
  errors: string[];
  duration: number;
}

// ─── DOM Extractor ───────────────────────────────────────────

async function extractPageElements(page: Page): Promise<ExtractedElement[]> {
  return page.evaluate(() => {
    const elements: ExtractedElement[] = [];
    const now = new Date().toISOString();

    const makeId = () => Math.random().toString(36).slice(2, 10);

    const SELECTOR_CANDIDATES = (el: Element): SelectorCandidate[] => {
      const candidates: SelectorCandidate[] = [];

      // 1. ID selector (highest confidence)
      if (el.id) {
        candidates.push({
          value: `#${CSS.escape(el.id)}`,
          type: 'css',
          confidence: 0.98,
          lastValidated: now as any,
          failureCount: 0,
        });
      }

      // 2. ARIA label selector
      const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
      if (ariaLabel) {
        candidates.push({
          value: `[aria-label="${ariaLabel}"]`,
          type: 'aria',
          confidence: 0.9,
          lastValidated: now as any,
          failureCount: 0,
        });
      }

      // 3. Data-testid (common in React apps)
      const testId = el.getAttribute('data-testid') || el.getAttribute('data-cy');
      if (testId) {
        candidates.push({
          value: `[data-testid="${testId}"]`,
          type: 'css',
          confidence: 0.95,
          lastValidated: now as any,
          failureCount: 0,
        });
      }

      // 4. Name attribute (great for inputs)
      const name = el.getAttribute('name');
      if (name && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName)) {
        candidates.push({
          value: `${el.tagName.toLowerCase()}[name="${name}"]`,
          type: 'css',
          confidence: 0.85,
          lastValidated: now as any,
          failureCount: 0,
        });
      }

      // 5. Text content (for buttons/links)
      const text = el.textContent?.trim().slice(0, 50);
      if (text && ['BUTTON', 'A'].includes(el.tagName)) {
        candidates.push({
          value: text,
          type: 'text',
          confidence: 0.75,
          lastValidated: now as any,
          failureCount: 0,
        });
      }

      // 6. Class-based CSS (lower confidence - classes change)
      const classList = Array.from(el.classList).slice(0, 3);
      if (classList.length > 0) {
        candidates.push({
          value: `.${classList.map((c) => CSS.escape(c)).join('.')}`,
          type: 'css',
          confidence: 0.5,
          lastValidated: now as any,
          failureCount: 0,
        });
      }

      return candidates.sort((a, b) => b.confidence - a.confidence);
    };

    // ─── Interactive element selectors ───────────────────────
    const interactiveSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[role="tab"]',
      'form',
      '[onclick]',
      '[data-action]',
    ].join(', ');

    const domElements = document.querySelectorAll(interactiveSelectors);

    domElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 &&
        getComputedStyle(el).display !== 'none' &&
        getComputedStyle(el).visibility !== 'hidden';

      const typeMap: Record<string, ExtractedElement['type']> = {
        A: 'link', BUTTON: 'button', INPUT: 'input',
        SELECT: 'select', TEXTAREA: 'input', FORM: 'form',
      };

      const roleMap: Record<string, ExtractedElement['type']> = {
        button: 'button', link: 'link', menuitem: 'button', tab: 'button',
      };

      const role = el.getAttribute('role') ?? '';
      const tag = el.tagName;
      const elementType =
        typeMap[tag] ?? roleMap[role] ?? 'other';

      const label =
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title') ||
        el.textContent?.trim().slice(0, 80) ||
        el.getAttribute('name') ||
        '';

      const attrs: Record<string, string> = {};
      Array.from(el.attributes).forEach((attr) => {
        attrs[attr.name] = attr.value;
      });

      elements.push({
        id: makeId(),
        type: elementType,
        label,
        selectors: SELECTOR_CANDIDATES(el),
        attributes: attrs,
        boundingBox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        visible: isVisible,
        interactable: isVisible && !el.hasAttribute('disabled'),
      });
    });

    return elements;
  });
}

// ─── DOM Simplifier (for AI context) ─────────────────────────

async function buildSimplifiedDOM(page: Page): Promise<SimplifiedDOM[]> {
  return page.evaluate(() => {
    function simplify(el: Element, depth = 0): SimplifiedDOM | null {
      if (depth > 6) return null;
      const ignoredTags = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'NOSCRIPT', 'SVG']);
      if (ignoredTags.has(el.tagName)) return null;

      const attrs: Record<string, string> = {};
      ['id', 'class', 'type', 'name', 'href', 'role', 'aria-label', 'placeholder', 'data-testid'].forEach((k) => {
        const v = el.getAttribute(k);
        if (v) attrs[k] = v.slice(0, 100);
      });

      const directText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 80);

      const children = Array.from(el.children)
        .map((child) => simplify(child, depth + 1))
        .filter(Boolean) as SimplifiedDOM[];

      return { tag: el.tagName.toLowerCase(), text: directText || undefined, role: attrs.role, attributes: attrs, children };
    }

    return Array.from(document.body?.children ?? [])
      .map((el) => simplify(el))
      .filter(Boolean) as SimplifiedDOM[];
  });
}

// ─── Crawler Implementation ───────────────────────────────────

export class SiteCrawler {
  private siteId: string;
  private domain: string;

  constructor(siteId: string, domain: string) {
    this.siteId = siteId;
    this.domain = domain;
  }

  async crawl(job: CrawlJob): Promise<CrawlResult> {
    const startTime = Date.now();
    const { url, maxDepth, maxPages, respectRobots } = job.payload;

    const visited = new Set<string>();
    const errors: string[] = [];
    const pageData: Map<string, PageNode> = new Map();

    console.log(`[Crawler] Starting crawl of ${url} (max: ${maxPages} pages)`);

    const crawlerOptions: PlaywrightCrawlerOptions = {
      maxRequestsPerCrawl: maxPages,
      maxConcurrency: 5,
      requestHandlerTimeoutSecs: 30,

      launchContext: {
        launchOptions: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
          ],
        },
      },

      // Human-like behavior
      preNavigationHooks: [
        async ({ page }) => {
          // Randomize viewport
          await page.setViewportSize({
            width: 1280 + Math.floor(Math.random() * 200),
            height: 800 + Math.floor(Math.random() * 100),
          });
          // Human-like headers
          await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          });
        },
      ],

      requestHandler: async ({ request, page, enqueueLinks, log }) => {
        const pageUrl = request.url;
        if (visited.has(pageUrl)) return;
        visited.add(pageUrl);

        // Human-like delay
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500 + Math.random() * 1000);

        const loadStart = Date.now();

        try {
          await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

          const loadTime = Date.now() - loadStart;
          const title = await page.title();
          const html = await page.content();
          const domHash = createHash('md5').update(html).digest('hex');

          // Extract elements
          const elements = await extractPageElements(page);
          const simplifiedDOM = await buildSimplifiedDOM(page);

          const pageNode: PageNode = {
            id: randomUUID(),
            url: pageUrl,
            title,
            loadTime,
            reliabilityScore: 1.0,
            lastVerified: new Date(),
            elements,
            snapshot: {
              url: pageUrl,
              timestamp: new Date(),
              html: html.slice(0, 50_000), // cap at 50KB
              simplified: simplifiedDOM,
            },
          };

          pageData.set(pageUrl, pageNode);

          // Persist to DB
          await this.persistPage(pageNode, domHash);

          log.info(`✅ Crawled [${elements.length} elements]: ${pageUrl}`);

          // Enqueue child links (same domain)
          if ((request.userData?.['depth'] ?? 0) < maxDepth) {
            await enqueueLinks({
              strategy: 'same-domain',
              transformRequestFunction: (req) => {
                req.userData = {
                  ...(req.userData ?? {}),
                  depth: (request.userData?.['depth'] ?? 0) + 1,
                };
                return req;
              },
            });
          }

          // Cache DOM snapshot in Redis (1 hour TTL)
          await cacheSet(
            CacheKeys.domSnapshot(pageNode.id),
            pageNode.snapshot,
            3600
          );

        } catch (err) {
          errors.push(`${pageUrl}: ${(err as Error).message}`);
          log.error(`Failed to process ${pageUrl}:`, err as Error);
        }
      },

      failedRequestHandler: async ({ request, log }, err) => {
        errors.push(`FAILED: ${request.url} — ${err.message}`);
        log.error(`Request failed: ${request.url}`);
      },
    };

    const crawler = new PlaywrightCrawler(crawlerOptions);

    await crawler.run([{ url, userData: { depth: 0 } }]);

    const duration = Date.now() - startTime;

    // Build and cache site graph
    await this.buildAndCacheSiteGraph();

    return {
      siteId: this.siteId,
      pagesDiscovered: visited.size,
      pagesCrawled: pageData.size,
      errors,
      duration,
    };
  }

  // ─── Persist page to Postgres ───────────────────────────────

  private async persistPage(node: PageNode, domHash: string): Promise<void> {
    await withTransaction(async (client: pg.PoolClient) => {
      // Upsert page
      const { rows } = await client.query(`
        INSERT INTO pages (id, site_id, url, title, load_time_ms, last_verified, dom_hash, reliability_score)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (site_id, url) DO UPDATE SET
          title = EXCLUDED.title,
          load_time_ms = EXCLUDED.load_time_ms,
          last_verified = EXCLUDED.last_verified,
          dom_hash = EXCLUDED.dom_hash
        RETURNING id
      `, [node.id, this.siteId, node.url, node.title, node.loadTime, node.lastVerified, domHash, node.reliabilityScore]);

      const pageId = rows[0].id;

      // Batch insert elements
      const elementsChunkSize = 500;
      for (let i = 0; i < node.elements.length; i += elementsChunkSize) {
        const chunk = node.elements.slice(i, i + elementsChunkSize);
        const elValues: string[] = [];
        const elParams: any[] = [];
        let pIdx = 1;

        for (const el of chunk) {
          elValues.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
          elParams.push(
            el.id, pageId, el.type, el.label,
            JSON.stringify(el.attributes),
            JSON.stringify(el.boundingBox),
            el.visible, el.interactable
          );
        }

        if (elValues.length > 0) {
          await client.query(`
            INSERT INTO elements (id, page_id, type, label, attributes, bounding_box, visible, interactable)
            VALUES ${elValues.join(', ')}
            ON CONFLICT DO NOTHING
          `, elParams);
        }
      }

      // Collect all selectors
      const allSelectors: { elId: string, sel: any }[] = [];
      for (const el of node.elements) {
        for (const sel of el.selectors) {
          allSelectors.push({ elId: el.id, sel });
        }
      }

      // Batch insert selectors
      const selectorsChunkSize = 2000;
      const now = new Date();
      for (let i = 0; i < allSelectors.length; i += selectorsChunkSize) {
        const chunk = allSelectors.slice(i, i + selectorsChunkSize);
        const selValues: string[] = [];
        const selParams: any[] = [];
        let pIdx = 1;

        for (const item of chunk) {
          selValues.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
          selParams.push(
            item.elId, item.sel.value, item.sel.type, item.sel.confidence, now
          );
        }

        if (selValues.length > 0) {
          await client.query(`
            INSERT INTO selectors (element_id, value, type, confidence, last_validated)
            VALUES ${selValues.join(', ')}
            ON CONFLICT (element_id, value) DO UPDATE SET
              confidence = EXCLUDED.confidence,
              last_validated = EXCLUDED.last_validated
          `, selParams);
        }
      }
    });
  }

  // ─── Build site graph and cache ──────────────────────────────

  private async buildAndCacheSiteGraph(): Promise<void> {
    const pool = getPgPool();

    const { rows: pages } = await pool.query(
      `SELECT id, url, title, load_time_ms, reliability_score, last_verified
       FROM pages WHERE site_id = $1`,
      [this.siteId]
    );

    const { rows: edges } = await pool.query(
      `SELECT from_page_id, to_page_id, link_text, selector, navigation_type
       FROM page_edges WHERE site_id = $1`,
      [this.siteId]
    );

    const graph = {
      nodes: pages,
      edges: edges,
      generatedAt: new Date(),
    };

    await cacheSet(CacheKeys.siteGraph(this.siteId), graph, 1800); // 30 min
    console.log(`[Crawler] ✅ Graph cached for site ${this.siteId}: ${pages.length} nodes, ${edges.length} edges`);
  }
}

// ─── Partial Remapper ─────────────────────────────────────────

export class IncrementalRemapper {
  private crawler: SiteCrawler;

  constructor(siteId: string, domain: string) {
    this.crawler = new SiteCrawler(siteId, domain);
  }

  async remapPages(urls: string[]): Promise<void> {
    const pool = getPgPool();

    for (const url of urls) {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
        const html = await page.content();
        const newHash = createHash('md5').update(html).digest('hex');

        const { rows } = await pool.query(
          `SELECT id, dom_hash FROM pages WHERE url = $1`,
          [url]
        );

        if (rows.length > 0 && rows[0].dom_hash !== newHash) {
          console.log(`[Remapper] Change detected at ${url}, remapping...`);

          const elements = await extractPageElements(page);
          const simplifiedDOM = await buildSimplifiedDOM(page);

          const node: PageNode = {
            id: rows[0].id,
            url,
            title: await page.title(),
            loadTime: 0,
            reliabilityScore: 1.0,
            lastVerified: new Date(),
            elements,
            snapshot: {
              url, timestamp: new Date(),
              html: html.slice(0, 50_000),
              simplified: simplifiedDOM,
            },
          };

          await this.crawler['persistPage'](node, newHash);

          // Log change
          await pool.query(`
            INSERT INTO change_log (page_id, change_type, old_hash, new_hash, remap_triggered)
            VALUES ($1, 'dom-change', $2, $3, true)
          `, [rows[0].id, rows[0].dom_hash, newHash]);
        }
      } finally {
        await browser.close();
      }
    }
  }
}
