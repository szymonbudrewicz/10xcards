import type { LanguageModel } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export interface OpenRouterModelOptions {
  apiKey: string;
  modelId: string;
  // Override for tests (local fake server); defaults to the provider's own URL.
  baseURL?: string;
}

// Usage accounting is on so every step carries the billed cost (see cost.ts).
export function createOpenRouterModel({ apiKey, modelId, baseURL }: OpenRouterModelOptions): LanguageModel {
  const openrouter = createOpenRouter({ apiKey, baseURL });
  return openrouter(modelId, { usage: { include: true } });
}
