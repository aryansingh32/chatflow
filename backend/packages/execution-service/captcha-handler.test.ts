import test from 'node:test';
import assert from 'node:assert';
import { OpenSourceSolver } from './captcha-handler.js';
import type { Page } from 'playwright';

test('OpenSourceSolver.solveHCaptcha catches and returns errors', async () => {
  const solver = new OpenSourceSolver();

  const mockPage = {
    frameLocator: () => {
      throw new Error('Mocked frameLocator error');
    }
  } as unknown as Page;

  const result = await solver.solveHCaptcha(mockPage, 'dummy-sitekey');

  assert.strictEqual(result.solved, false);
  assert.strictEqual(result.method, 'open-source');
  assert.strictEqual(result.error, 'Mocked frameLocator error');
});

test('OpenSourceSolver.solveHCaptcha successfully solves', async () => {
  const solver = new OpenSourceSolver();

  let checkboxClicked = false;

  const mockLocator = {
    click: async () => { checkboxClicked = true; },
    count: async () => 1
  };

  const mockPage = {
    frameLocator: () => {
      return {
        locator: (selector: string) => {
          return mockLocator;
        }
      }
    }
  } as unknown as Page;

  const result = await solver.solveHCaptcha(mockPage, 'dummy-sitekey');

  assert.strictEqual(result.solved, true);
  assert.strictEqual(result.method, 'open-source');
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(checkboxClicked, true);
});

test('OpenSourceSolver.solveHCaptcha challenge required', async () => {
  const solver = new OpenSourceSolver();

  const mockLocator = {
    click: async () => {},
    count: async () => 0
  };

  const mockPage = {
    frameLocator: () => {
      return {
        locator: (selector: string) => mockLocator
      }
    }
  } as unknown as Page;

  const result = await solver.solveHCaptcha(mockPage, 'dummy-sitekey');

  assert.strictEqual(result.solved, false);
  assert.strictEqual(result.method, 'open-source');
  assert.strictEqual(result.error, 'hCaptcha challenge required');
});
