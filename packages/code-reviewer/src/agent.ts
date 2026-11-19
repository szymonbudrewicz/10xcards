// The reviewer as a library: no env, no stdin/stdout. The caller supplies the model,
// so the CLI, tests and future promptfoo evals can each bring their own.
import {
  ToolLoopAgent,
  Output,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  isStepCount,
  type LanguageModel,
} from "ai";
import { costBudget, totalCost } from "./cost.ts";
import {
  BudgetExceededError,
  DEFAULT_LIMITS,
  DiffTooLargeError,
  NoReviewOutputError,
  OutputTokenLimitError,
  type ReviewLimits,
} from "./limits.ts";
import { buildReviewPrompt, type ReviewInput } from "./prompts/review.ts";
import { SYSTEM_PROMPT } from "./prompts/system.ts";
import { REVIEW_SCHEMA, type Review, type Verdict } from "./review-schema.ts";
import { applyVerdictRule } from "./verdict.ts";

export interface ReviewerOptions {
  model: LanguageModel;
  // Partial overrides of DEFAULT_LIMITS.
  limits?: Partial<ReviewLimits>;
}

export interface RunUsage {
  modelId: string;
  steps: number;
  inputTokens?: number;
  outputTokens?: number;
  // undefined when the provider reported no cost.
  costUsd?: number;
}

export interface ReviewRun {
  // review.verdict comes from the verdict rule (src/verdict.ts), not from the model.
  review: Review;
  // What the model itself answered; differs from review.verdict when it broke the rule.
  modelVerdict: Verdict;
  usage: RunUsage;
}

function resolveLimits(limits: Partial<ReviewLimits> | undefined): ReviewLimits {
  return { ...DEFAULT_LIMITS, ...limits };
}

export function createReviewer({ model, limits }: ReviewerOptions) {
  const { maxOutputTokens, maxReasoningTokens, maxCostUsd } = resolveLimits(limits);
  return new ToolLoopAgent({
    model,
    instructions: SYSTEM_PROMPT,
    tools: {},
    output: Output.object({ schema: REVIEW_SCHEMA }),
    maxOutputTokens,
    // Sent as OpenRouter reasoning.max_tokens; other providers ignore the openrouter key.
    providerOptions: { openrouter: { reasoning: { max_tokens: maxReasoningTokens } } },
    stopWhen: [isStepCount(2), costBudget(maxCostUsd)],
  });
}

function modelIdOf(model: LanguageModel): string {
  return typeof model === "string" ? model : model.modelId;
}

export async function runReview(input: ReviewInput, { model, limits }: ReviewerOptions): Promise<ReviewRun> {
  const resolved = resolveLimits(limits);
  const { diff } = input;
  // Layer 1: refuse oversized input before spending anything.
  if (diff.length > resolved.maxDiffChars) throw new DiffTooLargeError(diff.length, resolved.maxDiffChars);

  let result;
  try {
    result = await createReviewer({ model, limits: resolved }).generate({ prompt: buildReviewPrompt(input) });
  } catch (error) {
    // The call finished ("stop") but its text did not parse as the schema; cost is not exposed here.
    // With finishReason "length" the JSON was cut off by maxOutputTokens: a limit, not a provider fault.
    if (NoObjectGeneratedError.isInstance(error)) {
      const usage: RunUsage = {
        modelId: modelIdOf(model),
        steps: 1,
        inputTokens: error.usage?.inputTokens,
        outputTokens: error.usage?.outputTokens,
      };
      if (error.finishReason === "length") throw new OutputTokenLimitError(resolved.maxOutputTokens, usage);
      throw new NoReviewOutputError(error.finishReason ?? "unknown", usage);
    }
    throw error;
  }
  const costUsd = totalCost(result.steps);
  // Layer 3 (after the fact): an over-budget run is not trusted, even if it produced output.
  if (costUsd !== undefined && costUsd > resolved.maxCostUsd)
    throw new BudgetExceededError(costUsd, resolved.maxCostUsd);

  const usage: RunUsage = {
    modelId: modelIdOf(model),
    steps: result.steps.length,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    costUsd,
  };

  let modelReview: Review;
  try {
    modelReview = result.output;
  } catch (error) {
    if (!NoOutputGeneratedError.isInstance(error)) throw error;
    // costBudget stopped the loop mid tool-calls, so there is no final answer.
    if (costUsd !== undefined && costUsd >= resolved.maxCostUsd) {
      throw new BudgetExceededError(costUsd, resolved.maxCostUsd);
    }
    // Layer 2: maxOutputTokens ran out (reasoning counts) before the JSON was written.
    if (result.finishReason === "length") throw new OutputTokenLimitError(resolved.maxOutputTokens, usage);
    throw new NoReviewOutputError(result.finishReason, usage);
  }

  const { review, modelVerdict } = applyVerdictRule(modelReview);
  return { review, modelVerdict, usage };
}
