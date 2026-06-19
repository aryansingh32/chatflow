import { getPgPool } from '../shared/db/index.js';
// ─── Selector Engine ─────────────────────────────────────────
export class SelectorEngine {
    aiResolver;
    constructor(aiResolver) {
        this.aiResolver = aiResolver;
    }
    async resolve(ctx) {
        // Load all selectors for this element, ranked by confidence
        const candidates = await this.loadCandidates(ctx.elementId);
        // ── STAGE 1: Stored selectors (highest → lowest confidence) ──
        for (const candidate of candidates) {
            const result = await this.trySelector(ctx.page, candidate.value, candidate.type);
            if (result.found) {
                // Bump confidence slightly on success
                await this.recordSuccess(ctx.elementId, candidate.value);
                return {
                    found: true,
                    selector: candidate.value,
                    method: candidate.type,
                    confidence: candidate.confidence,
                };
            }
            // Record failure — will demote this selector
            await this.recordFailure(ctx.elementId, candidate.value);
        }
        // ── STAGE 2: Heuristic text match ────────────────────────
        const textMatch = await this.tryTextMatch(ctx.page, ctx.label, ctx.elementType);
        if (textMatch) {
            await this.storeNewSelector(ctx.elementId, textMatch, 'text', 0.65);
            return { found: true, selector: textMatch, method: 'text', confidence: 0.65 };
        }
        // ── STAGE 3: DOM similarity heuristic ────────────────────
        const heuristicMatch = await this.tryHeuristicMatch(ctx.page, ctx.label, ctx.elementType);
        if (heuristicMatch) {
            await this.storeNewSelector(ctx.elementId, heuristicMatch, 'css', 0.5);
            return { found: true, selector: heuristicMatch, method: 'css', confidence: 0.5 };
        }
        // ── STAGE 4: AI semantic re-identification ────────────────
        if (this.aiResolver) {
            const aiSelector = await this.tryAIResolver(ctx);
            if (aiSelector) {
                await this.storeNewSelector(ctx.elementId, aiSelector, 'ai-generated', 0.7);
                return { found: true, selector: aiSelector, method: 'ai-generated', confidence: 0.7 };
            }
        }
        return {
            found: false,
            method: 'exhausted',
            error: `Could not locate element "${ctx.label}" after all fallbacks`,
        };
    }
    // ─── Stage Implementations ───────────────────────────────────
    async trySelector(page, selector, type) {
        try {
            let locator;
            if (type === 'text') {
                locator = page.getByText(selector, { exact: false });
            }
            else if (type === 'aria') {
                locator = page.locator(selector);
            }
            else {
                locator = page.locator(selector);
            }
            // Check visibility with short timeout — don't waste time
            await locator.first().waitFor({ state: 'attached', timeout: 2000 });
            const count = await locator.count();
            return { found: count > 0 };
        }
        catch {
            return { found: false };
        }
    }
    async tryTextMatch(page, label, elementType) {
        if (!label || label.length < 2)
            return null;
        // Try exact text match
        const tagMap = {
            button: 'button, [role="button"]',
            link: 'a',
            input: 'input, textarea',
            select: 'select',
        };
        const tagSelector = tagMap[elementType] ?? '*';
        // Playwright text selector
        try {
            const locator = page.locator(`${tagSelector}:has-text("${label.slice(0, 30)}")`);
            const count = await locator.count();
            if (count > 0) {
                return `${tagSelector}:has-text("${label.slice(0, 30)}")`;
            }
        }
        catch { }
        // ARIA label match
        try {
            const locator = page.getByRole(elementType, { name: label, exact: false });
            const count = await locator.count();
            if (count > 0) {
                return `[aria-label*="${label.slice(0, 30)}"]`;
            }
        }
        catch { }
        return null;
    }
    async tryHeuristicMatch(page, label, elementType) {
        // Evaluate DOM to find elements with similar attributes or text
        return page.evaluate(({ label, elementType }) => {
            const lower = label.toLowerCase();
            const typeSelectors = {
                button: 'button, [role="button"], input[type="submit"]',
                link: 'a',
                input: 'input:not([type="hidden"]), textarea',
                select: 'select',
            };
            const selector = typeSelectors[elementType] ?? '[role]';
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                const text = el.textContent?.toLowerCase().trim() ?? '';
                const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() ?? '';
                const placeholder = el.getAttribute('placeholder')?.toLowerCase() ?? '';
                const name = el.getAttribute('name')?.toLowerCase() ?? '';
                const title = el.getAttribute('title')?.toLowerCase() ?? '';
                if (text.includes(lower) ||
                    ariaLabel.includes(lower) ||
                    placeholder.includes(lower) ||
                    name.includes(lower) ||
                    title.includes(lower)) {
                    // Build a selector for this element
                    if (el.id)
                        return `#${CSS.escape(el.id)}`;
                    const testId = el.getAttribute('data-testid');
                    if (testId)
                        return `[data-testid="${testId}"]`;
                    const elName = el.getAttribute('name');
                    if (elName)
                        return `${el.tagName.toLowerCase()}[name="${elName}"]`;
                    // Positional fallback (less reliable)
                    const parent = el.parentElement;
                    if (parent) {
                        const siblings = Array.from(parent.children);
                        const idx = siblings.indexOf(el);
                        return `${el.tagName.toLowerCase()}:nth-child(${idx + 1})`;
                    }
                }
            }
            return null;
        }, { label, elementType });
    }
    async tryAIResolver(ctx) {
        if (!this.aiResolver)
            return null;
        // Build a condensed page context for the AI
        const bodyText = await ctx.page.evaluate(() => document.body?.innerText?.slice(0, 3000) ?? '');
        console.log(`[SelectorEngine] Falling back to AI for "${ctx.label}"`);
        return this.aiResolver(ctx.page, ctx.label, ctx.elementType, bodyText);
    }
    // ─── Database Operations ─────────────────────────────────────
    async loadCandidates(elementId) {
        const pool = getPgPool();
        const { rows } = await pool.query(`
      SELECT value, type, confidence, last_validated, failure_count
      FROM selectors
      WHERE element_id = $1
        AND failure_count < 5          -- drop persistently broken selectors
      ORDER BY confidence DESC, failure_count ASC
      LIMIT 10
    `, [elementId]);
        return rows.map((r) => ({
            value: r.value,
            type: r.type,
            confidence: parseFloat(r.confidence),
            lastValidated: r.last_validated,
            failureCount: r.failure_count,
        }));
    }
    async recordSuccess(elementId, selectorValue) {
        await getPgPool().query(`
      UPDATE selectors
      SET confidence = LEAST(1.0, confidence + 0.02),
          failure_count = GREATEST(0, failure_count - 1),
          last_validated = NOW()
      WHERE element_id = $1 AND value = $2
    `, [elementId, selectorValue]);
    }
    async recordFailure(elementId, selectorValue) {
        await getPgPool().query(`
      UPDATE selectors
      SET confidence = GREATEST(0.1, confidence - 0.15),
          failure_count = failure_count + 1,
          last_validated = NOW()
      WHERE element_id = $1 AND value = $2
    `, [elementId, selectorValue]);
    }
    async storeNewSelector(elementId, value, type, confidence) {
        await getPgPool().query(`
      INSERT INTO selectors (element_id, value, type, confidence, last_validated)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (element_id, value) DO UPDATE
        SET confidence = EXCLUDED.confidence, last_validated = NOW()
    `, [elementId, value, type, confidence]);
    }
}
// ─── Selector Health Reporter ────────────────────────────────
export async function getSelectorHealthReport(siteId) {
    const pool = getPgPool();
    const { rows } = await pool.query(`
    SELECT
      e.type,
      COUNT(s.id) AS total_selectors,
      AVG(s.confidence) AS avg_confidence,
      SUM(s.failure_count) AS total_failures,
      COUNT(CASE WHEN s.failure_count >= 5 THEN 1 END) AS broken_selectors
    FROM selectors s
    JOIN elements e ON s.element_id = e.id
    JOIN pages p ON e.page_id = p.id
    WHERE p.site_id = $1
    GROUP BY e.type
    ORDER BY total_failures DESC
  `, [siteId]);
    return rows;
}
//# sourceMappingURL=selector-engine.js.map