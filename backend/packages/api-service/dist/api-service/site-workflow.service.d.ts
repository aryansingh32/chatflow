import type { ActionStep, SiteWorkflow } from '../shared/types/index.js';
export declare class SiteWorkflowService {
    summarizeForSite(siteId: string): Promise<string>;
    getWorkflow(workflowId: string): Promise<SiteWorkflow | null>;
    listAll(): Promise<SiteWorkflow[]>;
    listForSite(siteId: string): Promise<SiteWorkflow[]>;
    saveWorkflow(input: {
        siteId: string;
        name: string;
        trigger: string;
        portalType?: 'government' | 'jobs' | 'education' | 'banking' | 'general' | 'aadhaar';
        siteSection?: string;
        entryUrl?: string;
        pageUrl?: string;
        pageUrlPattern?: string;
        requiredInputs?: string[];
        requiredFiles?: Array<'resume' | 'signature' | 'photo' | 'document' | 'receipt' | 'other'>;
        instructions: string;
        defaultProfileName?: string;
        starterActionPlan?: ActionStep[];
        version?: number;
        isActive?: boolean;
        completionArtifact?: string;
    }): Promise<SiteWorkflow>;
    deleteWorkflow(workflowId: string): Promise<boolean>;
}
export declare const siteWorkflowService: SiteWorkflowService;
//# sourceMappingURL=site-workflow.service.d.ts.map