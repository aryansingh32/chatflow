import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestManualIntervention, OpenSourceSolver } from './captcha-handler';
import type { Page } from 'playwright';

describe('requestManualIntervention', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should not call fetch if CAPTCHA_WEBHOOK_URL is not configured', async () => {
    delete process.env.CAPTCHA_WEBHOOK_URL;

    await requestManualIntervention('job-123', 'https://example.com', 'unknown' as any);

    expect(console.warn).toHaveBeenCalledWith('[Captcha] No webhook configured for manual intervention');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should call fetch if CAPTCHA_WEBHOOK_URL is configured', async () => {
    process.env.CAPTCHA_WEBHOOK_URL = 'https://webhook.example.com';

    await requestManualIntervention('job-123', 'https://example.com', 'unknown' as any);

    expect(fetch).toHaveBeenCalledWith('https://webhook.example.com', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"event":"captcha.manual_required"')
    }));
  });
});

describe('OpenSourceSolver.solveHCaptcha', () => {
  it('catches and returns errors', async () => {
    const solver = new OpenSourceSolver();

    const mockPage = {
      frameLocator: () => {
        throw new Error('Mocked frameLocator error');
      }
    } as unknown as Page;

    const result = await solver.solveHCaptcha(mockPage, 'dummy-sitekey');

    expect(result.solved).toBe(false);
    expect(result.method).toBe('open-source');
    expect(result.error).toBe('Mocked frameLocator error');
  });

  it('successfully solves', async () => {
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

    expect(result.solved).toBe(true);
    expect(result.method).toBe('open-source');
    expect(result.error).toBeUndefined();
    expect(checkboxClicked).toBe(true);
  });

  it('challenge required', async () => {
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

    expect(result.solved).toBe(false);
    expect(result.method).toBe('open-source');
    expect(result.error).toBe('hCaptcha challenge required');
  });
});
