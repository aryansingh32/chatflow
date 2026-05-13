import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestManualIntervention } from './captcha-handler';

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
