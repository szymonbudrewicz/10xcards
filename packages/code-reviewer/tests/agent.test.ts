// Per-run limits of the reviewer library, on an in-memory model (ai/test): no network, no cost.
import type { StepResult, ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  BudgetExceededError,
  costBudget,
  DEFAULT_LIMITS,
  DiffTooLargeError,
  REVIEW_SCHEMA,
  runReview,
  totalCost,
} from "../src/index.ts";
import { VALID_REVIEW } from "./helpers/fake-openrouter.ts";

function mockModel(cost?: number, review: unknown = VALID_REVIEW, provider?: string) {
  return new MockLanguageModelV4({
    modelId: "mock/reviewer",
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify(review) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 50, text: 20, reasoning: 30 },
      },
      providerMetadata:
        cost === undefined && provider === undefined
          ? undefined
          : { openrouter: { ...(cost === undefined ? {} : { usage: { cost } }), ...(provider ? { provider } : {}) } },
      warnings: [],
    },
  });
}

// Minimal step shape: costBudget/totalCost only read providerMetadata.
function stepWithCost(cost?: number): StepResult<ToolSet> {
  return {
    providerMetadata: cost === undefined ? undefined : { openrouter: { usage: { cost } } },
  } as unknown as StepResult<ToolSet>;
}

describe("runReview", () => {
  it("returns a schema-valid review with summed usage and cost", async () => {
    const run = await runReview({ diff: "diff" }, { model: mockModel(0.0042) });

    expect(REVIEW_SCHEMA.parse(run.review)).toEqual(VALID_REVIEW);
    expect(run.usage).toEqual({
      modelId: "mock/reviewer",
      steps: 1,
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 30,
      costUsd: 0.0042,
    });
  });

  it("overrides a model 'pass' that breaks the verdict rule and reports what the model said", async () => {
    const model = mockModel(0.001, { ...VALID_REVIEW, verdict: "pass" });

    const run = await runReview({ diff: "diff" }, { model });

    expect(run.review.verdict).toBe("fail");
    expect(run.modelVerdict).toBe("pass");
  });

  it("sends the PR title and description to the model next to the diff", async () => {
    const model = mockModel(0.001);

    await runReview({ diff: "DIFF_MARKER", title: "TITLE_MARKER", body: "BODY_MARKER" }, { model });

    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    for (const marker of ["DIFF_MARKER", "TITLE_MARKER", "BODY_MARKER"]) expect(prompt).toContain(marker);
  });

  it("reports reasoning tokens and the OpenRouter upstream provider", async () => {
    const run = await runReview({ diff: "diff" }, { model: mockModel(0.001, VALID_REVIEW, "upstream-x") });

    expect(run.usage.reasoningTokens).toBe(30);
    expect(run.usage.provider).toBe("upstream-x");
  });

  it("caps reasoning at 8000 by default and sends no reasoning option when maxReasoningTokens is null", async () => {
    const model = mockModel(0.001);

    await runReview({ diff: "diff" }, { model });
    await runReview({ diff: "diff" }, { model, limits: { maxReasoningTokens: null } });

    expect(model.doGenerateCalls[0]?.providerOptions?.openrouter).toEqual({ reasoning: { max_tokens: 8000 } });
    expect(model.doGenerateCalls[1]?.providerOptions?.openrouter).toBeUndefined();
  });

  it("leaves costUsd undefined when the provider reports no cost", async () => {
    const run = await runReview({ diff: "diff" }, { model: mockModel() });

    expect(run.usage.costUsd).toBeUndefined();
  });

  it("rejects a diff one character over maxDiffChars without calling the model", async () => {
    const model = mockModel(0.001);

    await expect(runReview({ diff: "x".repeat(11) }, { model, limits: { maxDiffChars: 10 } })).rejects.toBeInstanceOf(
      DiffTooLargeError,
    );
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("accepts a diff of exactly maxDiffChars", async () => {
    const model = mockModel(0.001);

    await runReview({ diff: "x".repeat(10) }, { model, limits: { maxDiffChars: 10 } });

    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("passes maxOutputTokens to the model call", async () => {
    const model = mockModel(0.001);

    await runReview({ diff: "diff" }, { model, limits: { maxOutputTokens: 1234 } });
    await runReview({ diff: "diff" }, { model });

    expect(model.doGenerateCalls[0]?.maxOutputTokens).toBe(1234);
    expect(model.doGenerateCalls[1]?.maxOutputTokens).toBe(DEFAULT_LIMITS.maxOutputTokens);
  });

  it("throws BudgetExceededError when the run costs more than maxCostUsd", async () => {
    const run = runReview({ diff: "diff" }, { model: mockModel(0.11), limits: { maxCostUsd: 0.1 } });

    await expect(run).rejects.toBeInstanceOf(BudgetExceededError);
    await expect(run).rejects.toMatchObject({ costUsd: 0.11, maxCostUsd: 0.1 });
  });

  it("states a sub-cent budget exactly in the error message", async () => {
    const run = runReview({ diff: "diff" }, { model: mockModel(0.0047), limits: { maxCostUsd: 0.0001 } });

    await expect(run).rejects.toThrow("budżet $0.0001");
  });

  it("returns the review when the run costs exactly maxCostUsd", async () => {
    const run = await runReview({ diff: "diff" }, { model: mockModel(0.1), limits: { maxCostUsd: 0.1 } });

    expect(run.usage.costUsd).toBe(0.1);
  });
});

describe("costBudget", () => {
  const stop = costBudget(0.1);

  it("does not stop below the budget and stops from the threshold on", () => {
    expect(stop({ steps: [stepWithCost(0.04), stepWithCost(0.05)] })).toBe(false);
    expect(stop({ steps: [stepWithCost(0.04), stepWithCost(0.06)] })).toBe(true);
    expect(stop({ steps: [stepWithCost(0.2)] })).toBe(true);
  });

  it("ignores steps without a reported cost", () => {
    expect(stop({ steps: [stepWithCost(), stepWithCost()] })).toBe(false);
    expect(totalCost([stepWithCost(), stepWithCost(0.03)])).toBe(0.03);
    expect(totalCost([stepWithCost()])).toBeUndefined();
  });
});
