import type { Page } from 'playwright';
export type CaptchaType = 'recaptcha-v2' | 'recaptcha-v3' | 'hcaptcha' | 'cloudflare-turnstile' | 'image-text' | 'slider' | 'puzzle' | 'unknown';
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
export declare function detectCaptcha(page: Page): Promise<CaptchaDetection>;
export declare function applyAntiDetection(page: Page): Promise<void>;
export declare function simulateHumanPresence(page: Page): Promise<void>;
export declare class OpenSourceSolver {
    solveRecaptchaV2(page: Page, sitekey: string): Promise<SolveResult>;
    solveHCaptcha(page: Page, sitekey: string): Promise<SolveResult>;
    solveSlider(page: Page, sliderSelector?: string): Promise<SolveResult>;
    private transcribeAudio;
}
export declare function requestManualIntervention(jobId: string, pageUrl: string, captchaType: CaptchaType): Promise<void>;
export declare class CaptchaHandler {
    private solver;
    handle(page: Page, jobId: string): Promise<SolveResult>;
}
//# sourceMappingURL=captcha-handler.d.ts.map