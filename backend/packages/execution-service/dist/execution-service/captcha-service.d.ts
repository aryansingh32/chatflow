export interface CaptchaChallenge {
    id: string;
    type: 'text' | 'image' | 'click';
    imageUrl?: string;
    siteId: string;
    userId: string;
    premium: boolean;
}
export declare class CaptchaService {
    private static instance;
    private constructor();
    static getInstance(): CaptchaService;
    solve(challenge: CaptchaChallenge): Promise<string>;
    private solveWithPremiumAPI;
    private solveWithHumanInTheLoop;
}
export declare const captchaService: CaptchaService;
//# sourceMappingURL=captcha-service.d.ts.map