import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { getPgPool, cacheGet, cacheSet, CacheKeys } from '../shared/db/index.js';
// ============================================================
// AI SERVICE
// Uses Claude for:
//   1. Natural language → action plan conversion
//   2. Selector fallback recovery
//   3. Error recovery suggestions
//   4. Flow caching (AI is fallback, not primary path)
// ============================================================
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';
let anthropicClient = null;
function getAnthropicClient() {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required for AI fallback planning');
    }
    if (!anthropicClient) {
        anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return anthropicClient;
}
// ─── Flow Cache ──────────────────────────────────────────────
function hashTask(task) {
    // Normalize: lowercase, trim, remove punctuation
    const normalized = task.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
    return createHash('md5').update(normalized).digest('hex');
}
async function getCachedFlow(siteId, task) {
    const taskHash = hashTask(task);
    const cacheKey = CacheKeys.flowCache(siteId, taskHash);
    // Redis fast path
    const cached = await cacheGet(cacheKey);
    if (cached) {
        console.log(`[AI] ✅ Cache hit for task "${task.slice(0, 40)}"`);
        return cached;
    }
    // Postgres fallback
    const pool = getPgPool();
    const { rows } = await pool.query(`
    SELECT * FROM cached_flows
    WHERE site_id = $1 AND task_hash = $2
      AND success_count > failure_count    -- only use flows with more wins than losses
    LIMIT 1
  `, [siteId, taskHash]);
    if (rows.length > 0) {
        const flow = {
            id: rows[0].id,
            siteId: rows[0].site_id,
            taskHash: rows[0].task_hash,
            task: rows[0].task,
            actionPlan: rows[0].action_plan,
            successCount: rows[0].success_count,
            failureCount: rows[0].failure_count,
            lastUsed: rows[0].last_used,
            avgDuration: rows[0].avg_duration_ms,
        };
        await cacheSet(cacheKey, flow, 1800);
        return flow;
    }
    return null;
}
async function saveFlow(siteId, task, actionPlan) {
    const taskHash = hashTask(task);
    const pool = getPgPool();
    await pool.query(`
    INSERT INTO cached_flows (site_id, task_hash, task, action_plan, success_count)
    VALUES ($1, $2, $3, $4, 1)
    ON CONFLICT (site_id, task_hash) DO UPDATE SET
      action_plan   = EXCLUDED.action_plan,
      success_count = cached_flows.success_count + 1,
      last_used     = NOW()
  `, [siteId, taskHash, task, JSON.stringify(actionPlan)]);
    const cacheKey = CacheKeys.flowCache(siteId, taskHash);
    await cacheSet(cacheKey, { siteId, taskHash, task, actionPlan }, 1800);
}
async function markFlowFailure(siteId, task) {
    const taskHash = hashTask(task);
    await getPgPool().query(`
    UPDATE cached_flows
    SET failure_count = failure_count + 1
    WHERE site_id = $1 AND task_hash = $2
  `, [siteId, taskHash]);
}
async function getSiteWorkflowContext(siteId) {
    const pool = getPgPool();
    const { rows } = await pool.query(`SELECT
       name,
       trigger,
       portal_type,
       site_section,
       page_url,
       page_url_pattern,
       required_inputs,
       instructions,
       default_profile_name,
       starter_action_plan
     FROM site_workflows
     WHERE site_id = $1
     ORDER BY updated_at DESC, name ASC
     LIMIT 10`, [siteId]);
    if (!rows.length)
        return 'No custom site workflow instructions are configured.';
    return rows.map((row, index) => JSON.stringify({
        priority: index + 1,
        name: row.name,
        trigger: row.trigger,
        portalType: row.portal_type,
        siteSection: row.site_section,
        pageUrl: row.page_url,
        pageUrlPattern: row.page_url_pattern,
        requiredInputs: row.required_inputs ?? [],
        instructions: row.instructions,
        defaultProfileName: row.default_profile_name,
        starterActionPlan: row.starter_action_plan ?? [],
    })).join('\n');
}
function normalizeText(text) {
    return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function scoreWorkflowMatch(workflow, task, pageUrl) {
    const normalizedTask = normalizeText(task);
    let score = 0;
    const trigger = normalizeText(workflow.trigger);
    const name = normalizeText(workflow.name);
    const section = normalizeText(workflow.siteSection ?? '');
    if (trigger && normalizedTask.includes(trigger))
        score += 10;
    if (name && normalizedTask.includes(name))
        score += 6;
    if (section && normalizedTask.includes(section))
        score += 4;
    if (workflow.requiredInputs?.length) {
        for (const input of workflow.requiredInputs) {
            if (normalizedTask.includes(input.replace('_', ' ')))
                score += 1;
        }
    }
    if (pageUrl && workflow.pageUrl && pageUrl === workflow.pageUrl)
        score += 12;
    if (pageUrl && workflow.pageUrlPattern) {
        try {
            if (new RegExp(workflow.pageUrlPattern).test(pageUrl))
                score += 8;
        }
        catch {
            if (pageUrl.includes(workflow.pageUrlPattern))
                score += 4;
        }
    }
    if (workflow.starterActionPlan?.length)
        score += 5;
    return score;
}
async function getStructuredWorkflows(siteId) {
    const pool = getPgPool();
    const { rows } = await pool.query(`SELECT
       id,
       site_id as "siteId",
       name,
       trigger,
       portal_type as "portalType",
       site_section as "siteSection",
       page_url as "pageUrl",
       page_url_pattern as "pageUrlPattern",
       required_inputs as "requiredInputs",
       instructions,
       default_profile_name as "defaultProfileName",
       starter_action_plan as "starterActionPlan",
       created_at as "createdAt",
       updated_at as "updatedAt"
     FROM site_workflows
     WHERE site_id = $1
     ORDER BY updated_at DESC, name ASC`, [siteId]);
    return rows;
}
async function findBestStructuredWorkflow(siteId, task, pageUrl) {
    const workflows = await getStructuredWorkflows(siteId);
    if (!workflows.length)
        return null;
    const ranked = workflows
        .map((workflow) => ({ workflow, score: scoreWorkflowMatch(workflow, task, pageUrl) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);
    return ranked[0] ?? null;
}
// ─── DOM Serializer ──────────────────────────────────────────
function serializeDOM(snapshot, elements) {
    const interactable = elements
        .filter((e) => e.interactable)
        .slice(0, 80) // cap for token budget
        .map((e) => ({
        type: e.type,
        label: e.label,
        selector: e.selectors[0]?.value ?? 'unknown',
        visible: e.visible,
    }));
    return JSON.stringify({ url: snapshot.url, elements: interactable }, null, 2);
}
export function buildSyntheticSnapshot(url) {
    return {
        url: url ?? 'about:blank',
        timestamp: new Date(),
        html: '',
        simplified: [],
    };
}
// ─── Action Plan Generator ────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert browser automation planner.
Given a website's interactive elements and a user task, generate a precise JSON action plan.

RULES:
1. Return ONLY valid JSON — no markdown, no explanation
2. Each step must have a unique id (use short random strings like "s1", "s2")
3. action must be one of: navigate, click, fill, select, upload, download, wait, scroll, screenshot, extract, pauseForUserInput, payment
4. timeout is in milliseconds (default 10000)
5. retries should be 2 for critical steps, 1 for others
6. For fill actions, value is the text to type
7. For navigate, value is the full URL
8. target.value is a CSS selector, target.type is "css"
9. description must be human-readable (used as label for AI selector fallback)
10. Keep plans minimal — only necessary steps
11. If login, signup, OTP, CAPTCHA, payment, email, mobile, or password input is required and the task does not contain it, insert pauseForUserInput before the dependent step.
12. For pauseForUserInput, set expectedInput to otp, upi_id, captcha, confirmation, text, email, mobile, or password.
13. If payment is required, prefer a payment step followed by a confirmation pause.
14. If a workflow defines requiredInputs, make sure the plan either uses them directly or pauses to collect them.
15. If a workflow includes starterActionPlan, treat it as high-priority guidance for matching tasks.

OUTPUT FORMAT:
{
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "warnings": ["any caveats"],
  "estimatedDuration": milliseconds,
  "actionPlan": [
    {
      "id": "s1",
      "order": 1,
      "action": "navigate",
      "value": "https://example.com/login",
      "target": null,
      "waitFor": null,
      "timeout": 10000,
      "retries": 1,
      "description": "Navigate to login page"
    }
  ]
}`;
// ─── AI Planner ───────────────────────────────────────────────
export class AIPlanner {
    async planTask(task, siteId, snapshot, elements, useCache = true) {
        // Structured workflow match first — primary mode
        const matchedWorkflow = await findBestStructuredWorkflow(siteId, task, snapshot.url);
        if (matchedWorkflow?.workflow.starterActionPlan?.length) {
            return {
                confidence: 0.98,
                reasoning: `Matched structured workflow "${matchedWorkflow.workflow.name}"`,
                actionPlan: matchedWorkflow.workflow.starterActionPlan,
                estimatedDuration: matchedWorkflow.workflow.starterActionPlan.length * 3000,
                warnings: [],
                source: 'structured-workflow',
                matchedWorkflowId: matchedWorkflow.workflow.id,
                matchedWorkflowName: matchedWorkflow.workflow.name,
            };
        }
        // Check cache second — still cheaper than AI
        if (useCache) {
            const cached = await getCachedFlow(siteId, task);
            if (cached) {
                return {
                    confidence: 0.9,
                    reasoning: `Replaying cached flow (${cached.successCount} successes, ${cached.failureCount} failures)`,
                    actionPlan: cached.actionPlan,
                    estimatedDuration: cached.avgDuration,
                    warnings: [],
                    source: 'cached-flow',
                };
            }
        }
        console.log(`[AI] Planning task: "${task.slice(0, 60)}"`);
        const domContext = serializeDOM(snapshot, elements);
        const workflowContext = await getSiteWorkflowContext(siteId);
        const message = await getAnthropicClient().messages.create({
            model: MODEL,
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: `TASK: ${task}\n\nSITE WORKFLOW INSTRUCTIONS:\n${workflowContext}\n\nPAGE STATE:\n${domContext}`,
                },
            ],
        });
        const raw = message.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('');
        let parsed;
        try {
            // Strip potential markdown fences
            const clean = raw.replace(/```json\n?|\n?```/g, '').trim();
            const data = JSON.parse(clean);
            parsed = {
                confidence: data.confidence ?? 0.7,
                reasoning: data.reasoning ?? '',
                actionPlan: data.actionPlan ?? [],
                estimatedDuration: data.estimatedDuration ?? 5000,
                warnings: data.warnings ?? [],
                fallbackPlan: data.fallbackPlan,
                source: 'ai-generated',
                matchedWorkflowId: matchedWorkflow?.workflow.id,
                matchedWorkflowName: matchedWorkflow?.workflow.name,
            };
        }
        catch (err) {
            throw new Error(`[AI] Failed to parse action plan: ${err.message}\nRaw: ${raw.slice(0, 200)}`);
        }
        // Cache the new flow
        if (parsed.actionPlan.length > 0) {
            await saveFlow(siteId, task, parsed.actionPlan);
        }
        return parsed;
    }
    // ─── Error Recovery ───────────────────────────────────────────
    async recoverFromFailure(originalTask, failedStep, errorMessage, currentDOM) {
        console.log(`[AI] Attempting recovery for failed step: ${failedStep.description}`);
        const message = await getAnthropicClient().messages.create({
            model: MODEL,
            max_tokens: 1024,
            messages: [
                {
                    role: 'user',
                    content: `A browser automation step failed. Suggest recovery steps.

ORIGINAL TASK: ${originalTask}
FAILED STEP: ${JSON.stringify(failedStep)}
ERROR: ${errorMessage}
CURRENT DOM (simplified): ${currentDOM.slice(0, 2000)}

Return a JSON array of recovery ActionStep objects, or null if unrecoverable.
Format: { "recoverable": true/false, "steps": [...] }`,
                },
            ],
        });
        const raw = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
        try {
            const clean = raw.replace(/```json\n?|\n?```/g, '').trim();
            const data = JSON.parse(clean);
            return data.recoverable ? data.steps : null;
        }
        catch {
            return null;
        }
    }
    // ─── AI Selector Recovery ─────────────────────────────────────
    // Used as stage-4 fallback in SelectorEngine
    async resolveSelector(page, label, elementType, bodyContext) {
        const message = await getAnthropicClient().messages.create({
            model: MODEL,
            max_tokens: 256,
            messages: [
                {
                    role: 'user',
                    content: `Given this page content, return a CSS selector for element:
Label: "${label}"
Type: ${elementType}

PAGE TEXT (first 1500 chars):
${(bodyContext ?? '').slice(0, 1500)}

Return ONLY a CSS selector string, no explanation. If impossible, return null.`,
                },
            ],
        });
        const raw = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
        if (!raw || raw === 'null' || raw.length > 200)
            return null;
        // Validate the selector works
        try {
            const count = await page.locator(raw).count();
            return count > 0 ? raw : null;
        }
        catch {
            return null;
        }
    }
    // ─── Flow Feedback ────────────────────────────────────────────
    async recordOutcome(siteId, task, success) {
        if (!success) {
            await markFlowFailure(siteId, task);
        }
    }
}
// ─── Singleton ────────────────────────────────────────────────
let aiPlanner = null;
export function getAIPlanner() {
    if (!aiPlanner)
        aiPlanner = new AIPlanner();
    return aiPlanner;
}
//# sourceMappingURL=planner.js.map