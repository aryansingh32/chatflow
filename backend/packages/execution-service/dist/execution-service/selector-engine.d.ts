import type { Page } from 'playwright';
import type { SelectorCandidate, ExtractedElement } from '../shared/types/index.js';
export type SelectorResolution = {
    found: true;
    selector: string;
    method: SelectorCandidate['type'];
    confidence: number;
} | {
    found: false;
    method: 'exhausted';
    error: string;
};
export interface ResolutionContext {
    page: Page;
    elementId: string;
    label: string;
    elementType: ExtractedElement['type'];
    aiResolver?: AIResolver;
}
export type AIResolver = (page: Page, label: string, elementType: string, context?: string) => Promise<string | null>;
export declare class SelectorEngine {
    private aiResolver?;
    constructor(aiResolver?: AIResolver);
    resolve(ctx: ResolutionContext): Promise<SelectorResolution>;
    private trySelector;
    private tryTextMatch;
    private tryHeuristicMatch;
    private tryAIResolver;
    private loadCandidates;
    private recordSuccess;
    private recordFailure;
    private storeNewSelector;
}
export declare function getSelectorHealthReport(siteId: string): Promise<any[]>;
//# sourceMappingURL=selector-engine.d.ts.map