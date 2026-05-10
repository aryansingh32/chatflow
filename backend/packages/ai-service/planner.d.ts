import type { ActionStep, AIDecision, DOMSnapshot, ExtractedElement } from '../../shared/types/index.js';
export declare class AIPlanner {
    planTask(task: string, siteId: string, snapshot: DOMSnapshot, elements: ExtractedElement[], useCache?: boolean): Promise<AIDecision>;
    recoverFromFailure(originalTask: string, failedStep: ActionStep, errorMessage: string, currentDOM: string): Promise<ActionStep[] | null>;
    resolveSelector(page: import('playwright').Page, label: string, elementType: string, bodyContext?: string): Promise<string | null>;
    recordOutcome(siteId: string, task: string, success: boolean): Promise<void>;
}
export declare function getAIPlanner(): AIPlanner;
//# sourceMappingURL=planner.d.ts.map