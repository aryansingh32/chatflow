#!/usr/bin/env node
/**
 * ESM proxy for the TypeScript seed-and-test script.
 * This is called by test-backend.mjs via execFileSync.
 */
import { execSync } from 'child_process';

execSync('node --import tsx scripts/seed-and-test-aadhaar-workflow.ts', {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});
