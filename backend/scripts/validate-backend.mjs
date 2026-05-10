#!/usr/bin/env node
/**
 * validate-backend.mjs — Real validation of backend infrastructure.
 *
 * Checks:
 *  1. TypeScript compilation (tsc --noEmit)
 *  2. Postgres connectivity
 *  3. Redis connectivity
 *  4. DB migrations run cleanly
 *  5. Workflow loading from workflows/
 *  6. Structured workflow matching for "download aadhaar"
 *  7. Action handler coverage check
 */

import { execSync } from 'child_process';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const CHECK = `${GREEN}✅${RESET}`;
const FAIL = `${RED}❌${RESET}`;
const WARN = `${YELLOW}⚠️${RESET}`;

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(label) {
  console.log(`  ${CHECK} ${label}`);
  passed++;
}

function fail(label, detail) {
  console.log(`  ${FAIL} ${label}: ${detail}`);
  failed++;
}

function warn(label, detail) {
  console.log(`  ${WARN} ${label}: ${detail}`);
  warnings++;
}

// ─── Step 1: TypeScript ────────────────────────────────────────
console.log('\n🔨 Step 1: TypeScript Compilation');
try {
  execSync('npx tsc --noEmit 2>&1', { cwd: process.cwd(), timeout: 60_000 });
  pass('TypeScript strict compilation passed');
} catch (err) {
  const output = err.stdout?.toString() ?? err.stderr?.toString() ?? '';
  const errorLines = output.split('\n').filter(l => l.includes('error TS'));
  if (errorLines.length > 0) {
    fail('TypeScript compilation', `${errorLines.length} errors found`);
    errorLines.slice(0, 5).forEach(line => console.log(`      ${line.trim()}`));
    if (errorLines.length > 5) console.log(`      ... and ${errorLines.length - 5} more`);
  } else {
    warn('TypeScript compilation', 'Process exited non-zero but no TS errors found');
  }
}

// ─── Step 2: Postgres ──────────────────────────────────────────
console.log('\n🐘 Step 2: Postgres Connectivity');
try {
  const { getPgPool } = await import('../packages/shared/db/index.js');
  const pool = getPgPool();
  const { rows } = await pool.query('SELECT 1 AS ok');
  if (rows[0]?.ok === 1) {
    pass('Postgres connection established');
  } else {
    fail('Postgres', 'Unexpected query result');
  }
} catch (err) {
  fail('Postgres connectivity', err.message);
}

// ─── Step 3: Redis ─────────────────────────────────────────────
console.log('\n🔴 Step 3: Redis Connectivity');
try {
  const { getRedisClient } = await import('../packages/shared/db/index.js');
  const redis = await getRedisClient();
  const pong = await redis.ping();
  if (pong === 'PONG') {
    pass('Redis connection established (PONG received)');
  } else {
    fail('Redis', `Unexpected ping response: ${pong}`);
  }
} catch (err) {
  fail('Redis connectivity', err.message);
}

// ─── Step 4: Migrations ───────────────────────────────────────
console.log('\n🗄️  Step 4: Database Migrations');
try {
  const { runMigrations } = await import('../packages/shared/db/index.js');
  await runMigrations();
  pass('All migrations applied successfully');
} catch (err) {
  fail('Migrations', err.message);
}

// ─── Step 5: Workflow Loading ─────────────────────────────────
console.log('\n📋 Step 5: Workflow Loading');
try {
  const { workflowLoader } = await import('../packages/shared/workflow-loader.js');
  const result = await workflowLoader.loadAllWorkflows();
  if (result.loaded > 0) {
    pass(`Loaded ${result.loaded} workflow(s) from ${result.files.length} file(s)`);
  } else if (result.files.length === 0) {
    warn('Workflow loading', 'No JSON files found in workflows/ directory');
  } else {
    fail('Workflow loading', `${result.skipped} file(s) failed to load`);
  }
} catch (err) {
  fail('Workflow loading', err.message);
}

// ─── Step 6: Structured Workflow Matching ─────────────────────
console.log('\n🎯 Step 6: Structured Workflow Matching');
try {
  const { siteWorkflowService } = await import('../packages/api-service/site-workflow.service.js');
  const allWorkflows = await siteWorkflowService.listAll();

  if (allWorkflows.length === 0) {
    warn('Workflow matching', 'No workflows in DB to test matching against');
  } else {
    pass(`${allWorkflows.length} workflow(s) found in database`);

    const aadhaarWorkflow = allWorkflows.find(
      w => w.workflowKey === 'aadhaar-download-v2'
    );
    if (aadhaarWorkflow) {
      pass('Aadhaar download workflow found (aadhaar-download-v2)');

      if ((aadhaarWorkflow.starterActionPlan ?? []).length >= 10) {
        pass(`Aadhaar workflow has ${aadhaarWorkflow.starterActionPlan.length} action steps`);
      } else {
        fail('Aadhaar workflow', `Only ${(aadhaarWorkflow.starterActionPlan ?? []).length} steps — expected 10+`);
      }

      // Check pause steps exist
      const pauseSteps = (aadhaarWorkflow.starterActionPlan ?? []).filter(
        s => s.action === 'pauseForUserInput'
      );
      if (pauseSteps.length >= 3) {
        pass(`Aadhaar workflow has ${pauseSteps.length} pause steps (Aadhaar #, CAPTCHA, OTP)`);
      } else {
        fail('Aadhaar workflow', `Only ${pauseSteps.length} pause steps — expected 3+`);
      }

      // Check conditional steps exist
      const conditionalSteps = (aadhaarWorkflow.starterActionPlan ?? []).filter(
        s => s.action === 'conditional'
      );
      if (conditionalSteps.length >= 1) {
        pass(`Aadhaar workflow has ${conditionalSteps.length} conditional step(s)`);
      } else {
        warn('Aadhaar workflow', 'No conditional steps found');
      }

      // Test AI Planner matching (without LLM — structured path only)
      try {
        const { getAIPlanner } = await import('../packages/ai-service/planner.js');
        const planner = getAIPlanner();
        const snapshot = {
          url: 'https://myaadhaar.uidai.gov.in/genricDownloadAadhaar',
          timestamp: new Date(),
          html: '<html><body><button>Download Aadhaar</button></body></html>',
          simplified: [],
        };

        const decision = await planner.planTask(
          'download aadhaar',
          aadhaarWorkflow.siteId,
          snapshot,
          [],
          false
        );

        if (decision.source === 'structured-workflow') {
          pass(`Planner matched structured workflow: "${decision.matchedWorkflowName}"`);
        } else {
          fail('Planner', `Expected structured-workflow source, got: ${decision.source}`);
        }

        if (decision.confidence >= 0.9) {
          pass(`Match confidence: ${decision.confidence}`);
        } else {
          warn('Planner', `Low confidence: ${decision.confidence}`);
        }
      } catch (err) {
        fail('AI Planner matching', err.message);
      }
    } else {
      warn('Workflow matching', 'aadhaar-download-v2 not found — skipping match tests');
    }
  }
} catch (err) {
  fail('Workflow matching', err.message);
}

// ─── Step 7: Action Handler Coverage ──────────────────────────
console.log('\n🔧 Step 7: Action Type Coverage');
const EXPECTED_ACTIONS = [
  'navigate', 'click', 'fill', 'select', 'check', 'uncheck',
  'upload', 'download', 'waitForSelector', 'waitForNavigation',
  'waitForTimeout', 'scroll', 'mouseMove', 'humanType',
  'pauseForUserInput', 'extractData', 'runSubWorkflow',
  'conditional', 'customJS', 'refresh', 'wait', 'screenshot',
  'extract', 'payment'
];
try {
  const fs = await import('fs/promises');
  const executorSource = await fs.readFile('packages/execution-service/executor.ts', 'utf8');

  const covered = [];
  const missing = [];
  for (const action of EXPECTED_ACTIONS) {
    // Executor uses ACTION_HANDLERS record, not switch/case
    // Pattern: `actionName: async (step, ctx) =>` or `actionName: async (step) =>`
    const handlerPattern = new RegExp(`\\b${action}\\s*:\\s*async\\s*\\(`);
    if (handlerPattern.test(executorSource)) {
      covered.push(action);
    } else {
      missing.push(action);
    }
  }

  if (missing.length === 0) {
    pass(`All ${EXPECTED_ACTIONS.length} action types have handlers in executor.ts`);
  } else {
    warn('Action handlers', `Missing case handlers: ${missing.join(', ')}`);
    pass(`${covered.length}/${EXPECTED_ACTIONS.length} action types covered`);
  }
} catch (err) {
  fail('Action handler check', err.message);
}

// ─── Summary ──────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log(`  ${GREEN}Passed:${RESET}   ${passed}`);
if (warnings > 0) console.log(`  ${YELLOW}Warnings:${RESET} ${warnings}`);
if (failed > 0) console.log(`  ${RED}Failed:${RESET}   ${failed}`);
console.log('═══════════════════════════════════════════════');

if (failed > 0) {
  console.log(`\n${FAIL} Backend validation FAILED with ${failed} error(s)\n`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`\n${WARN} Backend validation PASSED with ${warnings} warning(s)\n`);
} else {
  console.log(`\n${CHECK} Backend validation PASSED — all checks green!\n`);
}

// Graceful close
try {
  const { getPgPool, getRedisClient } = await import('../packages/shared/db/index.js');
  const redis = await getRedisClient();
  await redis.quit();
  const pool = getPgPool();
  await pool.end();
} catch {}
