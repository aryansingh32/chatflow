import { getPgPool } from '../shared/db/index.js';
export class SiteWorkflowService {
    async summarizeForSite(siteId) {
        const workflows = await this.listForSite(siteId);
        if (!workflows.length)
            return 'No saved site workflows.';
        return workflows.slice(0, 20).map((workflow) => JSON.stringify({
            name: workflow.name,
            trigger: workflow.trigger,
            portalType: workflow.portalType ?? null,
            siteSection: workflow.siteSection ?? null,
            entryUrl: workflow.entryUrl ?? null,
            pageUrl: workflow.pageUrl ?? null,
            pageUrlPattern: workflow.pageUrlPattern ?? null,
            requiredInputs: workflow.requiredInputs ?? [],
            requiredFiles: workflow.requiredFiles ?? [],
            defaultProfileName: workflow.defaultProfileName ?? null,
            version: workflow.version ?? 1,
            isActive: workflow.isActive ?? true,
            completionArtifact: workflow.completionArtifact ?? null,
        })).join('\n');
    }
    async getWorkflow(workflowId) {
        const pool = getPgPool();
        const { rows } = await pool.query(`SELECT
         id,
         site_id as "siteId",
         name,
         trigger,
         portal_type as "portalType",
         site_section as "siteSection",
         entry_url as "entryUrl",
         page_url as "pageUrl",
         page_url_pattern as "pageUrlPattern",
         required_inputs as "requiredInputs",
         required_files as "requiredFiles",
         instructions,
         default_profile_name as "defaultProfileName",
         starter_action_plan as "starterActionPlan",
         version,
         is_active as "isActive",
         completion_artifact as "completionArtifact",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM site_workflows
       WHERE id = $1
       LIMIT 1`, [workflowId]);
        return rows[0] ?? null;
    }
    async listForSite(siteId) {
        const pool = getPgPool();
        const { rows } = await pool.query(`SELECT
         id,
         site_id as "siteId",
         name,
         trigger,
         portal_type as "portalType",
         site_section as "siteSection",
         entry_url as "entryUrl",
         page_url as "pageUrl",
         page_url_pattern as "pageUrlPattern",
         required_inputs as "requiredInputs",
         required_files as "requiredFiles",
         instructions,
         default_profile_name as "defaultProfileName",
         starter_action_plan as "starterActionPlan",
         version,
         is_active as "isActive",
         completion_artifact as "completionArtifact",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM site_workflows
       WHERE site_id = $1
       ORDER BY updated_at DESC, name ASC`, [siteId]);
        return rows;
    }
    async saveWorkflow(input) {
        const pool = getPgPool();
        const { rows } = await pool.query(`INSERT INTO site_workflows (
         site_id,
         name,
         trigger,
         portal_type,
         site_section,
         entry_url,
         page_url,
         page_url_pattern,
         required_inputs,
         required_files,
         instructions,
         default_profile_name,
         starter_action_plan,
         version,
         is_active,
         completion_artifact,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
       ON CONFLICT (site_id, name)
       DO UPDATE SET
         trigger = EXCLUDED.trigger,
         portal_type = EXCLUDED.portal_type,
         site_section = EXCLUDED.site_section,
         entry_url = EXCLUDED.entry_url,
         page_url = EXCLUDED.page_url,
         page_url_pattern = EXCLUDED.page_url_pattern,
         required_inputs = EXCLUDED.required_inputs,
         required_files = EXCLUDED.required_files,
         instructions = EXCLUDED.instructions,
         default_profile_name = EXCLUDED.default_profile_name,
         starter_action_plan = EXCLUDED.starter_action_plan,
         version = EXCLUDED.version,
         is_active = EXCLUDED.is_active,
         completion_artifact = EXCLUDED.completion_artifact,
         updated_at = NOW()
       RETURNING
         id,
         site_id as "siteId",
         name,
         trigger,
         portal_type as "portalType",
         site_section as "siteSection",
         entry_url as "entryUrl",
         page_url as "pageUrl",
         page_url_pattern as "pageUrlPattern",
         required_inputs as "requiredInputs",
         required_files as "requiredFiles",
         instructions,
         default_profile_name as "defaultProfileName",
         starter_action_plan as "starterActionPlan",
         version,
         is_active as "isActive",
         completion_artifact as "completionArtifact",
         created_at as "createdAt",
         updated_at as "updatedAt"`, [
            input.siteId,
            input.name.trim(),
            input.trigger.trim(),
            input.portalType ?? null,
            input.siteSection?.trim() || null,
            input.entryUrl?.trim() || null,
            input.pageUrl?.trim() || null,
            input.pageUrlPattern?.trim() || null,
            input.requiredInputs ?? [],
            input.requiredFiles ?? [],
            input.instructions.trim(),
            input.defaultProfileName?.trim() || null,
            JSON.stringify(input.starterActionPlan ?? []),
            input.version ?? 1,
            input.isActive ?? true,
            input.completionArtifact?.trim() || null,
        ]);
        return rows[0];
    }
    async deleteWorkflow(workflowId) {
        const pool = getPgPool();
        const result = await pool.query(`DELETE FROM site_workflows WHERE id = $1`, [workflowId]);
        return (result.rowCount ?? 0) > 0;
    }
}
export const siteWorkflowService = new SiteWorkflowService();
//# sourceMappingURL=site-workflow.service.js.map