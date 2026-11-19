import type { RunUsage } from "./agent.ts";

// Hard per-run limits (CLAUDE.md: track and cap the cost of every run).
// StopCondition only runs after a step with tool results, so a one-step review is
// bounded up front: the diff size and maxOutputTokens cap what a single call can cost.
export interface ReviewLimits {
  // Diffs longer than this are rejected before the model is called.
  maxDiffChars: number;
  // Ceiling on tokens the model may generate per call (reasoning included).
  maxOutputTokens: number;
  // Total billed cost of one run (sum over steps) in USD.
  maxCostUsd: number;
}

// First paid run: ~7k output tokens (mostly reasoning), $0.014 — these leave headroom.
export const DEFAULT_LIMITS: ReviewLimits = {
  maxDiffChars: 200_000,
  maxOutputTokens: 16_000,
  maxCostUsd: 0.1,
};

// Base class: the CLI maps every limit error to exit code 2.
export class ReviewLimitError extends Error {
  override name = "ReviewLimitError";
}

export class DiffTooLargeError extends ReviewLimitError {
  override name = "DiffTooLargeError";
  constructor(
    readonly diffChars: number,
    readonly maxDiffChars: number,
  ) {
    super(`Diff ma ${diffChars} znaków, limit to ${maxDiffChars} — recenzja pominięta, model nie został wywołany.`);
  }
}

// The model hit maxOutputTokens (finishReason "length") before producing the review —
// typically reasoning that used up the whole budget on a large diff.
export class OutputTokenLimitError extends ReviewLimitError {
  override name = "OutputTokenLimitError";
  constructor(
    readonly maxOutputTokens: number,
    readonly usage: RunUsage,
  ) {
    super(
      `Model wyczerpał limit ${maxOutputTokens} tokenów wyjścia (z rozumowaniem) przed odpowiedzią — ` +
        "podnieś REVIEW_MAX_OUTPUT_TOKENS albo zmniejsz diff.",
    );
  }
}

// The model finished without a schema-valid review for another reason (not a limit).
export class NoReviewOutputError extends Error {
  override name = "NoReviewOutputError";
  constructor(
    readonly finishReason: string,
    readonly usage: RunUsage,
  ) {
    super(`Model nie zwrócił recenzji (finishReason=${finishReason}).`);
  }
}

export class BudgetExceededError extends ReviewLimitError {
  override name = "BudgetExceededError";
  constructor(
    readonly costUsd: number,
    readonly maxCostUsd: number,
  ) {
    super(`Koszt przebiegu $${costUsd.toFixed(6)} przekroczył budżet $${String(maxCostUsd)} — wynik odrzucony.`);
  }
}
