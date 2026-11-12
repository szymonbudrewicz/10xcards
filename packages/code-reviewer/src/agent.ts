// The reviewer as a library: no env, no stdin/stdout. The caller supplies the model,
// so the CLI, tests and future promptfoo evals can each bring their own.
import { ToolLoopAgent, Output, isStepCount, type LanguageModel } from "ai";
import { totalCost } from "./cost.ts";
import { buildReviewPrompt } from "./prompts/review.ts";
import { SYSTEM_PROMPT } from "./prompts/system.ts";
import { REVIEW_SCHEMA, type Review } from "./review-schema.ts";

export interface ReviewerOptions {
  model: LanguageModel;
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
  review: Review;
  usage: RunUsage;
}

export function createReviewer({ model }: ReviewerOptions) {
  return new ToolLoopAgent({
    model,
    instructions: SYSTEM_PROMPT,
    tools: {},
    output: Output.object({ schema: REVIEW_SCHEMA }),
    stopWhen: isStepCount(2),
  });
}

function modelIdOf(model: LanguageModel): string {
  return typeof model === "string" ? model : model.modelId;
}

export async function runReview(diff: string, { model }: ReviewerOptions): Promise<ReviewRun> {
  const reviewer = createReviewer({ model });
  const { output, usage, steps } = await reviewer.generate({ prompt: buildReviewPrompt(diff) });
  return {
    review: output,
    usage: {
      modelId: modelIdOf(model),
      steps: steps.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: totalCost(steps),
    },
  };
}
