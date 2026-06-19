export declare class WorkflowLoader {
    private readonly workflowsDir;
    constructor(workflowsDir?: string);
    loadAllWorkflows(): Promise<{
        loaded: number;
        skipped: number;
        files: string[];
    }>;
    private getAllWorkflowFiles;
    private ensureSite;
}
export declare const workflowLoader: WorkflowLoader;
//# sourceMappingURL=workflow-loader.d.ts.map