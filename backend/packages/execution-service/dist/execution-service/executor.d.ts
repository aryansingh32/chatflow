import type { ExecutionResult, ExecuteJob } from '../shared/types/index.js';
import { type AIResolver } from './selector-engine.js';
export declare class ExecutionEngine {
    private sessionManager;
    private selectorEngine;
    constructor(aiResolver?: AIResolver);
    execute(job: ExecuteJob): Promise<ExecutionResult>;
    private executeStep;
    private logResult;
}
//# sourceMappingURL=executor.d.ts.map