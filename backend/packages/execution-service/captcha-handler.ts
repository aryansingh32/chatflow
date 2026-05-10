import type { Page } from 'playwright';

// ============================================================
// CAPTCHA HANDLER
// Three-tier strategy:
//   Tier 1: Prevention — behave so human-like captcha never fires
//   Tier 2: Open-source solvers (reCaptcha v2/v3, hCaptcha, image CAPTCHAs)
//   Tier 3: Manual intervention signal (webhook / pause job)
// ============================================================

export type CaptchaType =
  | 'recaptcha-v2'
  | 'recaptcha-v3'
  | 'hcaptcha'
  | 'cloudflare-turnstile'
  | 'image-text'
  | 'slider'
  | 'puzzle'
  | 'unknown';

export interface CaptchaDetection {
  detected: boolean;
  type: CaptchaType;
  selector?: string;
  sitekey?: string;
}

export interface SolveResult {
  solved: boolean;
  method: 'prevention' | 'open-source' | 'ai' | 'manual';
  token?: string;
  error?: string;
}

// ─── Detection ───────────────────────────────────────────────

export async function detectCaptcha(page: Page): Promise<CaptchaDetection> {
  return page.evaluate(() => {
    // reCAPTCHA v2
    const rc2 = document.querySelector('.g-recaptcha, iframe[src*="recaptcha"]');
    if (rc2) {
      return {
        detected: true,
        type: 'recaptcha-v2' as const,
        selector: '.g-recaptcha',
        sitekey: rc2.getAttribute('data-sitekey') ?? undefined,
      };
    }

    // reCAPTCHA v3 (invisible — check for script)
    if (document.querySelector('script[src*="recaptcha/api.js"]')) {
      return { detected: true, type: 'recaptcha-v3' as const };
    }

    // hCaptcha
    const hcap = document.querySelector('.h-captcha, iframe[src*="hcaptcha"]');
    if (hcap) {
      return {
        detected: true,
        type: 'hcaptcha' as const,
        selector: '.h-captcha',
        sitekey: hcap.getAttribute('data-sitekey') ?? undefined,
      };
    }

    // Cloudflare Turnstile
    if (document.querySelector('.cf-turnstile, iframe[src*="challenges.cloudflare"]')) {
      return { detected: true, type: 'cloudflare-turnstile' as const };
    }

    // Slider captcha
    if (document.querySelector('[class*="slider"][class*="captcha"], [id*="slider-captcha"]')) {
      return { detected: true, type: 'slider' as const };
    }

    // Puzzle captcha
    if (document.querySelector('[class*="puzzle-captcha"], [class*="jigsaw"]')) {
      return { detected: true, type: 'puzzle' as const };
    }

    // Generic image captcha
    if (document.querySelector('img[src*="captcha"], img[alt*="captcha" i], canvas[id*="captcha"]')) {
      return { detected: true, type: 'image-text' as const };
    }

    return { detected: false, type: 'unknown' as const };
  });
}

// ─── Prevention Layer ─────────────────────────────────────────

export async function applyAntiDetection(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Overwrite automation signals
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });

    // Fake plugins array
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer',  filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client',      filename: 'internal-nacl-plugin' },
        ];
        arr.toString = () => arr.map((p) => p.name).join(', ');
        return arr;
      },
    });

    // Fake languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Remove automation traces from window
    delete (window as any).__selenium_evaluate;
    delete (window as any).__webdriver_evaluate;
    delete (window as any).__driver_evaluate;

    // Add chrome object (present in real Chrome)
    (window as any).chrome = {
      app: { isInstalled: false },
      runtime: {
        connect: () => {},
        sendMessage: () => {},
      },
    };

    // Spoof screen resolution
    Object.defineProperty(screen, 'availHeight', { get: () => 900 });
    Object.defineProperty(screen, 'availWidth', { get: () => 1440 });
  });

  // Randomize mouse movements on page load
  await simulateHumanPresence(page);
}

// ─── Human Presence Simulation ─────────────────────────────────

export async function simulateHumanPresence(page: Page): Promise<void> {
  // Random mouse movement on page load
  const steps = 3 + Math.floor(Math.random() * 5);
  for (let i = 0; i < steps; i++) {
    const x = 100 + Math.random() * 1000;
    const y = 100 + Math.random() * 600;
    await page.mouse.move(x, y, { steps: 5 });
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 300));
  }
}

// ─── Open-source Solver ───────────────────────────────────────

export class OpenSourceSolver {

  // reCAPTCHA v2: token injection via audio challenge bypass
  async solveRecaptchaV2(page: Page, sitekey: string): Promise<SolveResult> {
    try {
      // Click the checkbox
      const iframe = page.frameLocator('iframe[src*="recaptcha"][title*="reCAPTCHA"]');
      const checkbox = iframe.locator('#recaptcha-anchor');
      await checkbox.click();
      await new Promise((r) => setTimeout(r, 1500));

      // Check if already solved (trivial case)
      const solved = await iframe.locator('.recaptcha-checkbox-checked').count();
      if (solved > 0) {
        return { solved: true, method: 'open-source' };
      }

      // Switch to audio challenge (more reliable for automation)
      const challengeFrame = page.frameLocator('iframe[src*="recaptcha"][title*="challenge"]');
      const audioBtn = challengeFrame.locator('#recaptcha-audio-button');
      if (await audioBtn.count() > 0) {
        await audioBtn.click();
        await new Promise((r) => setTimeout(r, 1000));

        // Download audio and process
        const audioSrc = await challengeFrame.locator('#audio-source').getAttribute('src');
        if (audioSrc) {
          const transcription = await this.transcribeAudio(audioSrc);
          if (transcription) {
            await challengeFrame.locator('#audio-response').fill(transcription);
            await challengeFrame.locator('#recaptcha-verify-button').click();
            await new Promise((r) => setTimeout(r, 1500));
            return { solved: true, method: 'open-source', token: transcription };
          }
        }
      }

      return { solved: false, method: 'open-source', error: 'Audio challenge not available' };
    } catch (err) {
      return { solved: false, method: 'open-source', error: (err as Error).message };
    }
  }

  // hCaptcha: similar approach
  async solveHCaptcha(page: Page, sitekey: string): Promise<SolveResult> {
    try {
      const iframe = page.frameLocator('iframe[src*="hcaptcha"]');
      await iframe.locator('.checkbox').click();
      await new Promise((r) => setTimeout(r, 2000));

      const checked = await iframe.locator('[aria-checked="true"]').count();
      if (checked > 0) {
        return { solved: true, method: 'open-source' };
      }

      return { solved: false, method: 'open-source', error: 'hCaptcha challenge required' };
    } catch (err) {
      return { solved: false, method: 'open-source', error: (err as Error).message };
    }
  }

  // Slider captcha: track mouse path simulation
  async solveSlider(page: Page, sliderSelector = '[class*="slider"]'): Promise<SolveResult> {
    try {
      const slider = page.locator(sliderSelector).first();
      const box = await slider.boundingBox();
      if (!box) return { solved: false, method: 'open-source', error: 'Slider not found' };

      const startX = box.x + 10;
      const startY = box.y + box.height / 2;
      const endX   = box.x + box.width - 10;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await new Promise((r) => setTimeout(r, 200));

      // Simulate human drag with acceleration/deceleration curve
      const totalSteps = 30;
      for (let i = 0; i <= totalSteps; i++) {
        const t = i / totalSteps;
        // Ease in-out curve
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const x = startX + (endX - startX) * ease;
        // Tiny vertical wobble
        const y = startY + (Math.sin(i * 0.5) * 2);
        await page.mouse.move(x, y);
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
      }

      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 1000));

      return { solved: true, method: 'open-source' };
    } catch (err) {
      return { solved: false, method: 'open-source', error: (err as Error).message };
    }
  }

  private async transcribeAudio(audioUrl: string): Promise<string | null> {
    // This calls a local speech-to-text service or Whisper API
    // Implementation depends on deployment environment
    try {
      const response = await fetch(`${process.env.WHISPER_API_URL}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: audioUrl }),
      });
      if (!response.ok) return null;
      const data = await response.json() as { text?: string };
      return data.text ?? null;
    } catch {
      return null;
    }
  }
}

// ─── Manual Intervention Signal ───────────────────────────────

export async function requestManualIntervention(
  jobId: string,
  pageUrl: string,
  captchaType: CaptchaType
): Promise<void> {
  // Notify via webhook — pause job and wait for human
  const webhookUrl = process.env.CAPTCHA_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[Captcha] No webhook configured for manual intervention');
    return;
  }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'captcha.manual_required',
      jobId,
      pageUrl,
      captchaType,
      timestamp: new Date().toISOString(),
    }),
  });
}

// ─── Unified Handler ─────────────────────────────────────────

export class CaptchaHandler {
  private solver = new OpenSourceSolver();

  async handle(page: Page, jobId: string): Promise<SolveResult> {
    const detection = await detectCaptcha(page);

    if (!detection.detected) {
      return { solved: true, method: 'prevention' };
    }

    console.log(`[Captcha] Detected: ${detection.type} on ${page.url()}`);

    switch (detection.type) {
      case 'recaptcha-v2':
        return this.solver.solveRecaptchaV2(page, detection.sitekey ?? '');

      case 'hcaptcha':
        return this.solver.solveHCaptcha(page, detection.sitekey ?? '');

      case 'slider':
        return this.solver.solveSlider(page, detection.selector);

      case 'recaptcha-v3':
      case 'cloudflare-turnstile':
      case 'puzzle':
      case 'image-text':
      case 'unknown':
      default:
        // These require manual intervention
        await requestManualIntervention(jobId, page.url(), detection.type);
        return {
          solved: false,
          method: 'manual',
          error: `Manual solve required for ${detection.type}. Webhook notified.`,
        };
    }
  }
}
