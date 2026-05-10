import OpenAI from 'openai';
import { getRedisClient, CacheKeys } from '../shared/db/index.js';
import { memoryService } from './user-memory.service.js';
import { enqueueJob } from '../shared/queue/index.js';
import { randomUUID } from 'crypto';
import { fileStorageService } from './file-storage.service.js';
// ============================================================
// CHAT ORCHESTRATOR
// Brain of the chatbot. Uses an LLM (OpenRouter, Local, etc.)
// to understand intent, manage state, and trigger automation.
// ============================================================
// Initialize OpenAI client pointing to OpenRouter, Local LLM (Ollama/vLLM), or standard OpenAI.
// To use local LLMs or OpenRouter, set OPENAI_BASE_URL (e.g. https://openrouter.ai/api/v1)
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-local',
    baseURL: process.env.OPENAI_BASE_URL,
});
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';
const SYSTEM_PROMPT = `
You are an intelligent automation assistant. You help users fill out forms, apply for jobs, and perform tasks on government or portal sites.
You have access to the user's saved profiles.
You also have access to uploaded user files like resumes, signatures, photos, and receipts.
When the user asks to perform a task, you should extract the goal and check if you have enough details. 
If the user references a profile (e.g., "my default details", "my dad's details"), assume we will use it.
If the task likely needs a resume, signature, or photo and the user has uploaded one, prefer using that saved file reference.
Respond with a JSON object containing your intent.

Your JSON MUST match this schema:
{
  "replyText": "What to say to the user in chat",
  "intent": "start_job" | "provide_input" | "chat",
  "jobDetails": { // Only if intent is start_job
    "site": "Domain or name of the site",
    "task": "Specific natural language task for the executor",
    "profileToUse": "default" // or specific profile name
  }
}

Do not include any text outside the JSON.
`;
export class ChatOrchestrator {
    /**
     * Main entry point for a new chat message
     */
    async handleMessage(userId, sessionId, message, replyCallback) {
        const state = await this.getState(userId, sessionId);
        // Add user message to history
        state.history.push({ role: 'user', content: message });
        // Check if we are awaiting input for a paused job (OTP, CAPTCHA, Payment)
        if (state.awaitingInput && state.activeJobId) {
            // User is providing the requested input
            await memoryService.storeEphemeralData(userId, `job:${state.activeJobId}:input:${state.awaitingInput.stepId}`, message, 900);
            await this.resumeJob(state.activeJobId, message);
            const reply = `Got it, I've entered the ${state.awaitingInput.type} and resumed the task!`;
            state.history.push({ role: 'assistant', content: reply });
            state.awaitingInput = undefined;
            state.memoryContext.lastUserInput = message;
            await this.saveState(state);
            replyCallback(reply);
            return;
        }
        // Otherwise, classify intent via LLM
        try {
            const profileSummary = await memoryService.summarizeProfiles(userId);
            const fileSummary = await fileStorageService.summarizeFiles(userId);
            const response = await openai.chat.completions.create({
                model: LLM_MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'system', content: `USER PROFILES:\n${profileSummary}\n\nUSER FILES:\n${fileSummary}` },
                    ...state.history.map(h => ({ role: h.role, content: h.content }))
                ],
                response_format: { type: "json_object" }
            });
            const content = response.choices[0]?.message?.content || '{}';
            const parsed = JSON.parse(content);
            state.history.push({ role: 'assistant', content: parsed.replyText });
            replyCallback(parsed.replyText);
            // Handle Job Start
            if (parsed.intent === 'start_job' && parsed.jobDetails) {
                let taskInstruction = parsed.jobDetails.task;
                // Append profile data if requested
                if (parsed.jobDetails.profileToUse) {
                    const profile = await memoryService.getProfileByName(userId, parsed.jobDetails.profileToUse);
                    if (profile) {
                        taskInstruction += `\nUse the following details: ${JSON.stringify(profile.data)}`;
                    }
                    else {
                        replyCallback(`\n(Note: I couldn't find a saved profile named '${parsed.jobDetails.profileToUse}'. I will try my best without it or ask you later.)`);
                    }
                }
                const savedFiles = await fileStorageService.summarizeFiles(userId);
                taskInstruction += `\nAvailable uploaded files for automation:\n${savedFiles}`;
                const job = {
                    id: randomUUID(),
                    type: 'execute',
                    priority: 'normal',
                    createdAt: new Date(),
                    userId,
                    sessionId,
                    payload: {
                        siteId: parsed.jobDetails.site, // Simplified; normally map to internal DB ID
                        task: taskInstruction,
                        sessionId,
                        useCache: false
                    }
                };
                const jobId = await enqueueJob(job);
                state.activeJobId = jobId;
                state.memoryContext.siteId = parsed.jobDetails.site;
                state.memoryContext.task = taskInstruction;
                await this.saveJobRuntimeState({
                    jobId,
                    userId,
                    sessionId,
                    siteId: parsed.jobDetails.site,
                    task: taskInstruction,
                    status: 'queued',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
            }
            await this.saveState(state);
        }
        catch (err) {
            console.error('[ChatOrchestrator] Error parsing LLM response:', err);
            replyCallback("Sorry, I had trouble understanding that. Let's try again.");
        }
    }
    /**
     * Called by the Execution engine via Redis pub/sub when a job pauses for OTP/CAPTCHA
     */
    async handleJobPauseRequest(userId, sessionId, jobId, stepId, type, contextMessage, replyCallback) {
        const state = await this.getState(userId, sessionId);
        state.activeJobId = jobId;
        state.awaitingInput = { jobId, stepId, type, contextMessage };
        state.history.push({ role: 'assistant', content: contextMessage });
        await this.saveState(state);
        await this.saveJobRuntimeState({
            jobId,
            userId,
            sessionId,
            siteId: state.memoryContext.siteId ?? 'unknown',
            task: state.memoryContext.task ?? '',
            status: 'paused',
            activeStepId: stepId,
            lastInputType: type,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        replyCallback(contextMessage);
    }
    async resumeJob(jobId, input) {
        const redis = await getRedisClient();
        await redis.publish(`job:resume:${jobId}`, input);
    }
    // ─── State Management ────────────────────────────────────────
    async getState(userId, sessionId) {
        const redis = await getRedisClient();
        const key = `chat-state:${userId}:${sessionId}`;
        const data = await redis.get(key);
        if (data) {
            return JSON.parse(data);
        }
        return {
            userId,
            sessionId,
            history: [],
            memoryContext: {},
            lastUpdated: new Date()
        };
    }
    async saveState(state) {
        const redis = await getRedisClient();
        const key = `chat-state:${state.userId}:${state.sessionId}`;
        state.lastUpdated = new Date();
        await redis.setex(key, 86400, JSON.stringify(state)); // 24 hour TTL
    }
    async saveJobRuntimeState(state) {
        const redis = await getRedisClient();
        await redis.setEx(CacheKeys.jobRuntime(state.jobId), 86400, JSON.stringify(state));
    }
}
export const chatOrchestrator = new ChatOrchestrator();
//# sourceMappingURL=chat-orchestrator.js.map