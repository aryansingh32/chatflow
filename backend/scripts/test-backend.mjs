import { execFileSync, spawn } from 'child_process';

const API_BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const API_KEY = 'dev-key-change-in-prod';
const STARTUP_TIMEOUT_MS = parseInt(process.env.API_STARTUP_TIMEOUT_MS || '120000', 10);

let startedApiProcess = null;
let startedWorkerProcess = null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHealth() {
  const response = await fetch(`${API_BASE_URL}/health`, {
    headers: { 'x-api-key': API_KEY },
  });
  if (!response.ok) {
    throw new Error(`Health check failed with ${response.status}`);
  }
  return response.json();
}

async function isApiReachable() {
  try {
    await fetchHealth();
    return true;
  } catch {
    return false;
  }
}

async function ensureApiServer() {
  if (await isApiReachable()) {
    console.log('[test:backend] API already reachable:', API_BASE_URL);
    return;
  }

  console.log('[test:backend] API not reachable, starting local API server');
  startedApiProcess = spawn(
    process.execPath,
    ['--import', 'tsx', 'packages/api-service/server.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        API_KEY,
      },
      stdio: 'inherit',
    }
  );

  startedApiProcess.once('exit', (code, signal) => {
    if (startedApiProcess) {
      console.error(`[test:backend] API server exited before readiness (code=${code}, signal=${signal})`);
    }
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (startedApiProcess.exitCode !== null) {
      throw new Error(`API server exited early with code ${startedApiProcess.exitCode}`);
    }

    try {
      const health = await fetchHealth();
      if (health.status === 'healthy') {
        console.log('[test:backend] API became healthy');
        return;
      }
      console.log(`[test:backend] Waiting for healthy API status, current status: ${health.status}`);
    } catch {}

    await sleep(1500);
  }

  throw new Error(`Timed out waiting ${STARTUP_TIMEOUT_MS}ms for API readiness`);
}

async function ensureWorkerServer() {
  if (startedWorkerProcess) return;

  console.log('[test:backend] starting local worker process');
  startedWorkerProcess = spawn(
    process.execPath,
    ['--import', 'tsx', 'packages/execution-service/worker.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        API_KEY,
      },
      stdio: 'inherit',
    }
  );

  startedWorkerProcess.once('exit', (code, signal) => {
    if (startedWorkerProcess) {
      console.error(`[test:backend] Worker exited unexpectedly (code=${code}, signal=${signal})`);
    }
  });

  await sleep(5000);
  if (startedWorkerProcess.exitCode !== null) {
    throw new Error(`Worker exited early with code ${startedWorkerProcess.exitCode}`);
  }
}

async function cleanupApiServer() {
  if (!startedApiProcess) return;

  const child = startedApiProcess;
  startedApiProcess = null;
  child.kill('SIGINT');

  const finished = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(false);
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

  if (!finished) {
    await sleep(1000);
  }
}

async function cleanupWorkerServer() {
  if (!startedWorkerProcess) return;

  const child = startedWorkerProcess;
  startedWorkerProcess = null;
  child.kill('SIGINT');

  const finished = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(false);
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

  if (!finished) {
    await sleep(1000);
  }
}

async function request(path, init = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method || 'GET'} ${path} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function waitForJob(jobId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const result = await request(`/jobs/${jobId}`);
      return result.job;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for job log for ${jobId}`);
}

async function main() {
  await ensureApiServer();
  await ensureWorkerServer();

  const health = await request('/health', { headers: { 'x-api-key': API_KEY } });
  assert(health.status === 'healthy', `Backend health is ${health.status}`);

  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed-and-test-aadhaar-workflow.ts'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  const workflowList = await request('/workflows');
  const workflow = workflowList.workflows.find((item) => item.workflowKey === 'aadhaar-download-v2');
  assert(workflow, 'Seeded workflow "aadhaar-download-v2" was not found via API');

  const plan = await request('/test/plan', {
    method: 'POST',
    body: JSON.stringify({
      siteId: workflow.siteId,
      task: 'download aadhaar',
      pageUrl: 'https://myaadhaar.uidai.gov.in/genricDownloadAadhaar',
      useCache: false,
    }),
  });

  assert(plan.source === 'structured-workflow', `Expected structured-workflow source, got ${plan.source}`);
  assert(plan.matchedWorkflowName === 'Aadhaar Download', `Expected matched workflow "Aadhaar Download", got ${plan.matchedWorkflowName}`);
  assert(Array.isArray(plan.pauseSteps) && plan.pauseSteps.length >= 3, 'Expected pauseForUserInput steps in planned workflow');

  const execute = await request('/execute', {
    method: 'POST',
    body: JSON.stringify({
      siteId: workflow.siteId,
      task: 'download aadhaar',
      userId: 'backend-test',
      sessionId: 'backend-test-session',
      useCache: false,
      dryRun: true,
    }),
  });

  const job = await waitForJob(execute.jobId);
  const runtimeResponse = await request(`/jobs/${execute.jobId}/runtime`);
  const runtime = runtimeResponse.runtime;

  assert(job.result?.mode === 'dry-run', `Expected dry-run job result, got ${JSON.stringify(job.result)}`);
  assert(job.result?.planSource === 'structured-workflow', `Expected structured-workflow dry-run result, got ${job.result?.planSource}`);
  assert(job.result?.matchedWorkflowName === 'Aadhaar Download', `Expected dry-run to use "Aadhaar Download", got ${job.result?.matchedWorkflowName}`);
  assert(Array.isArray(job.result?.pauseSteps) && job.result.pauseSteps.length >= 3, 'Expected dry-run result to expose pause steps');
  assert(runtime.status === 'paused', `Expected runtime status "paused", got ${runtime.status}`);
  assert(runtime.activeStepId === 's6', `Expected first pause step s6, got ${runtime.activeStepId}`);

  console.log('[test:backend] health check passed');
  console.log('[test:backend] workflow match source:', plan.source);
  console.log('[test:backend] matched workflow:', plan.matchedWorkflowName);
  console.log('[test:backend] dry-run job id:', execute.jobId);
  console.log('[test:backend] first pause step:', runtime.activeStepId);
  console.log('[test:backend] backend end-to-end verification passed');
}

main().catch((error) => {
  console.error('[test:backend] failed:', error.message);
  process.exitCode = 1;
}).finally(async () => {
  await cleanupApiServer();
  await cleanupWorkerServer();
});
