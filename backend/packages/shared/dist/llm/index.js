import OpenAI from 'openai';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
let openAICompatibleClient = null;
function isTruthy(value, fallback) {
    if (value == null || value === '')
        return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
export function getLLMProviderConfig() {
    const usingOpenRouter = Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_BASE_URL);
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || 'dummy-key-for-local';
    const baseURL = process.env.OPENROUTER_BASE_URL
        || process.env.OPENAI_BASE_URL
        || (usingOpenRouter ? DEFAULT_OPENROUTER_BASE_URL : undefined);
    return {
        apiKey,
        baseURL,
        chatModel: process.env.CHAT_LLM_MODEL || process.env.LLM_MODEL || DEFAULT_OPENROUTER_MODEL,
        plannerModel: process.env.AI_PLANNER_MODEL || process.env.LLM_MODEL || DEFAULT_OPENROUTER_MODEL,
        selectorModel: process.env.AI_SELECTOR_MODEL || process.env.AI_PLANNER_MODEL || process.env.LLM_MODEL || DEFAULT_OPENROUTER_MODEL,
        recoveryModel: process.env.AI_RECOVERY_MODEL || process.env.AI_PLANNER_MODEL || process.env.LLM_MODEL || DEFAULT_OPENROUTER_MODEL,
        reasoningEnabled: isTruthy(process.env.OPENROUTER_ENABLE_REASONING, true),
    };
}
export function getOpenAICompatibleClient() {
    const { apiKey, baseURL } = getLLMProviderConfig();
    if (!openAICompatibleClient) {
        openAICompatibleClient = new OpenAI({
            apiKey,
            baseURL,
        });
    }
    return openAICompatibleClient;
}
export function getReasoningRequestBody() {
    return getLLMProviderConfig().reasoningEnabled
        ? { reasoning: { enabled: true } }
        : undefined;
}
export function isDummyLLMKey() {
    return getLLMProviderConfig().apiKey === 'dummy-key-for-local';
}
//# sourceMappingURL=index.js.map