import { runMigrations } from '../packages/shared/db/index.js';
import { workflowLoader } from '../packages/shared/workflow-loader.js';
import { siteWorkflowService } from '../packages/api-service/site-workflow.service.js';
import { getAIPlanner } from '../packages/ai-service/planner.js';
import type { DOMSnapshot, ExtractedElement } from '../packages/shared/types/index.js';

async function main() {
  await runMigrations();
  await workflowLoader.loadAllWorkflows();

  const workflows = await siteWorkflowService.listAll();
  const workflow = workflows.find((entry) => entry.workflowKey === 'aadhaar-download-v2');
  if (!workflow) {
    throw new Error('aadhaar-download-v2 was not loaded from workflows/');
  }

  const planner = getAIPlanner();
  const snapshot: DOMSnapshot = {
    url: 'https://myaadhaar.uidai.gov.in/genricDownloadAadhaar',
    timestamp: new Date(),
    html: '<html><body><button>Download Aadhaar</button></body></html>',
    simplified: [],
  };
  const elements: ExtractedElement[] = [];

  const decision = await planner.planTask('download aadhaar', workflow.siteId, snapshot, elements, false);
  console.log('[test] planning source:', decision.source);
  console.log('[test] matched workflow:', decision.matchedWorkflowName ?? 'none');
  console.log('[test] action plan steps:', decision.actionPlan.length);

  if (decision.source !== 'structured-workflow') {
    throw new Error(`Expected structured-workflow but got ${decision.source}`);
  }

  if (workflow.workflowKey !== 'aadhaar-download-v2') {
    throw new Error(`Expected workflow key aadhaar-download-v2 but got ${workflow.workflowKey}`);
  }

  if ((workflow.starterActionPlan ?? []).length < 10) {
    throw new Error('Aadhaar workflow plan is unexpectedly short');
  }

  console.log('[test] structured workflow load + match passed');
}

main().catch((err) => {
  console.error('[seed/test] failed:', err);
  process.exit(1);
});
