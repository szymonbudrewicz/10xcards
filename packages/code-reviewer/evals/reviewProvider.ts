// promptfoo provider that runs the real reviewer (runReview), not a bare model with a copy of the
// prompt: schema, verdict rule and per-run limits are what the CI gate relies on, so the eval
// measures exactly that path. promptfoo instantiates this class once per entry in `providers`.
//   config.model               OpenRouter model id (required)
//   config.maxReasoningTokens  number | null (null = no separate reasoning cap); default: library default
// The prompt promptfoo renders is ignored: the diff comes from the test's `vars`.
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createOpenRouterModel, ReviewLimitError, runReview, type ReviewLimits } from "../src/index.ts";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
// Same key source as the CLI: this package's .env only (never the app's .env/.dev.vars).
loadEnv({ path: `${PACKAGE_DIR}.env`, quiet: true });

export interface ReviewProviderConfig {
  model: string;
  maxReasoningTokens?: number | null;
}

interface ProviderOptions {
  id?: string;
  label?: string;
  config?: Partial<ReviewProviderConfig>;
}

interface CallContext {
  vars?: Record<string, unknown>;
}

export interface ReviewProviderResponse {
  output?: unknown;
  error?: string;
  tokenUsage?: { total?: number; prompt?: number; completion?: number };
  cost?: number;
  metadata?: Record<string, unknown>;
}

function textVar(vars: Record<string, unknown> | undefined, name: string): string | undefined {
  const value = vars?.[name];
  return typeof value === "string" ? value : undefined;
}

export default class ReviewProvider {
  private readonly model: string;
  private readonly limits: Partial<ReviewLimits>;
  private readonly providerId: string;

  constructor(options: ProviderOptions = {}) {
    const model = options.config?.model;
    if (!model) throw new Error("reviewProvider: config.model is required");
    this.model = model;
    this.limits =
      options.config?.maxReasoningTokens === undefined ? {} : { maxReasoningTokens: options.config.maxReasoningTokens };
    this.providerId = options.id ?? `review:${model}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallContext): Promise<ReviewProviderResponse> {
    const diff = textVar(context?.vars, "diff");
    if (!diff) return { error: "reviewProvider: test var `diff` is missing" };
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return { error: "reviewProvider: OPENROUTER_API_KEY missing (packages/code-reviewer/.env)" };

    const model = createOpenRouterModel({ apiKey, modelId: this.model, baseURL: process.env.OPENROUTER_BASE_URL });
    const started = performance.now();
    try {
      const { review, modelVerdict, usage } = await runReview(
        { diff, title: textVar(context?.vars, "title"), body: textVar(context?.vars, "body") },
        { model, limits: this.limits },
      );
      const latencyMs = Math.round(performance.now() - started);
      return {
        output: review,
        tokenUsage: {
          total: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
          prompt: usage.inputTokens,
          completion: usage.outputTokens,
        },
        cost: usage.costUsd,
        metadata: {
          modelVerdict,
          provider: usage.provider,
          reasoningTokens: usage.reasoningTokens,
          latencyMs,
          costUsd: usage.costUsd,
        },
      };
    } catch (error) {
      // Class name + message only: never the diff, never the key.
      const latencyMs = Math.round(performance.now() - started);
      // OutputTokenLimitError and NoReviewOutputError carry the usage of the paid call.
      const usage = hasUsage(error) ? error.usage : undefined;
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : String(error);
      return {
        error: `${name}: ${message}`,
        cost: usage?.costUsd,
        metadata: {
          latencyMs,
          limit: error instanceof ReviewLimitError,
          provider: usage?.provider,
          reasoningTokens: usage?.reasoningTokens,
        },
      };
    }
  }
}

function hasUsage(
  error: unknown,
): error is { usage: { costUsd?: number; provider?: string; reasoningTokens?: number } } {
  return typeof error === "object" && error !== null && "usage" in error && typeof error.usage === "object";
}
