import OpenAI from 'openai';
type LLMProviderConfig = {
    apiKey: string;
    baseURL?: string;
    chatModel: string;
    plannerModel: string;
    selectorModel: string;
    recoveryModel: string;
    reasoningEnabled: boolean;
};
export declare function getLLMProviderConfig(): LLMProviderConfig;
export declare function getOpenAICompatibleClient(): OpenAI;
export declare function getReasoningRequestBody(): Record<string, unknown> | undefined;
export declare function isDummyLLMKey(): boolean;
export {};
//# sourceMappingURL=index.d.ts.map