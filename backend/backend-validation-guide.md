# Backend Validation Guide

This runbook verifies the structured-workflow backend end-to-end:

1. Prerequisites
   - PostgreSQL reachable on `POSTGRES_HOST:POSTGRES_PORT`
   - Redis reachable on `REDIS_HOST:REDIS_PORT`
   - Node.js dependencies installed
   - Chromium can launch in the current environment

2. Quick validation
   - Run `npm run typecheck`
   - Run `npm run workflow:load`
   - Run `node scripts/test-backend.mjs`
   - Or run the combined path: `npm run validate:backend`

3. What the quick validation covers
   - DB migrations complete
   - Workflow JSON files load into `site_workflows`
   - API service starts cleanly
   - Worker service starts cleanly
   - Browser pool initializes
   - `/health` returns `healthy`
   - `/workflows` exposes the loaded workflow
   - `/test/plan` resolves to `structured-workflow`
   - `/execute` enqueues a job
   - Worker consumes the queue
   - Dry-run runtime state pauses on the first manual input step

4. Manual API checks
   - Start the API: `npm run dev:api`
   - Start the worker: `npm run dev:worker`
   - Check health:
     - `curl -H "x-api-key: dev-key-change-in-prod" http://127.0.0.1:3000/health`
   - List workflows:
     - `curl -H "x-api-key: dev-key-change-in-prod" http://127.0.0.1:3000/workflows`
   - Confirm `workflowKey` `aadhaar-download-v2` exists

5. Manual planner validation
   - Call:
```bash
curl -X POST http://127.0.0.1:3000/test/plan \
  -H "x-api-key: dev-key-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "<site-id-from-/workflows>",
    "task": "download aadhaar",
    "pageUrl": "https://myaadhaar.uidai.gov.in/genricDownloadAadhaar",
    "useCache": false
  }'
```
   - Expected:
     - `source` is `structured-workflow`
     - `matchedWorkflowName` is `Aadhaar Download`
     - action plan contains pause steps for Aadhaar number, CAPTCHA, and OTP

6. Manual dry-run execution validation
   - Call:
```bash
curl -X POST http://127.0.0.1:3000/execute \
  -H "x-api-key: dev-key-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "<site-id-from-/workflows>",
    "task": "download aadhaar",
    "userId": "manual-test",
    "sessionId": "manual-test-session",
    "useCache": false,
    "dryRun": true
  }'
```
   - Save the returned `jobId`
   - Check runtime:
     - `curl -H "x-api-key: dev-key-change-in-prod" http://127.0.0.1:3000/jobs/<jobId>/runtime`
   - Expected:
     - `status` is `paused`
     - `activeStepId` is `s6`
     - `lastInputType` is `text`

7. Manual queue and result validation
   - Fetch job log:
     - `curl -H "x-api-key: dev-key-change-in-prod" http://127.0.0.1:3000/jobs/<jobId>`
   - Expected:
     - `result.mode` is `dry-run`
     - `result.planSource` is `structured-workflow`
     - `result.matchedWorkflowName` is `Aadhaar Download`

8. Full interactive execution validation
   - Use the same `/execute` request with `"dryRun": false`
   - Watch WebSocket or Redis-driven pause events in the client
   - Provide inputs in order:
     - Aadhaar number
     - CAPTCHA
     - OTP
   - Expected:
     - runtime advances step-by-step
     - final artifact is stored through the managed file pipeline

9. Workflow loader regression checks
   - Add a second JSON file under `workflows/<site>/`
   - Run `npm run workflow:load`
   - Confirm upsert behavior by editing the workflow `version` or `triggerPhrases`
   - Re-run `/workflows` and confirm values updated without duplicates

10. Coverage for newly added step types
   - `upload`: add a workflow using `{{userFile:<category>}}`
   - `conditional`: verify true/false branch execution in a dry-run-safe workflow
   - `runSubWorkflow`: add a reusable login JSON and invoke it from a parent flow
   - `extractData`: verify the extracted key appears in execution results
   - `errorRecoveryPlan`: intentionally break a selector and confirm the recovery plan runs before hard failure

11. Failure scenarios to test
   - Stop Redis and verify `/health` becomes `degraded`
   - Stop Postgres and verify API startup fails clearly
   - Break one selector in a workflow and verify fallback selectors are attempted
   - Remove a required file for an `upload` workflow and confirm the error is explicit

12. Current known scope
   - The included automated smoke test covers structured-workflow planning and dry-run execution, not the live Aadhaar website
   - Live website execution still depends on external page stability, CAPTCHA timing, OTP delivery, and browser environment support
