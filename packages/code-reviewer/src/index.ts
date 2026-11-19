// Public API of the code reviewer. Importing this module has no side effects;
// the command-line entry point is src/cli.ts.
export { createReviewer, runReview, type ReviewerOptions, type ReviewRun, type RunUsage } from "./agent.ts";
export { costBudget, totalCost } from "./cost.ts";
export {
  BudgetExceededError,
  DEFAULT_LIMITS,
  DiffTooLargeError,
  ReviewLimitError,
  type ReviewLimits,
} from "./limits.ts";
export { createOpenRouterModel, type OpenRouterModelOptions } from "./model.ts";
export {
  COMMENT_MARKER,
  NO_VERDICT_REASONS,
  renderComment,
  renderNoVerdictComment,
  type NoVerdictReason,
} from "./comment.ts";
export { buildReviewPrompt, type ReviewInput } from "./prompts/review.ts";
export { SYSTEM_PROMPT } from "./prompts/system.ts";
export {
  CRITERIA,
  CRITERION_KEYS,
  HARD_CRITERIA,
  REVIEW_JSON_SCHEMA,
  REVIEW_SCHEMA,
  type CriterionKey,
  type Review,
  type Verdict,
} from "./review-schema.ts";
export { ANY_FAIL_AT_OR_BELOW, applyVerdictRule, HARD_FAIL_AT_OR_BELOW, verdictFromScores } from "./verdict.ts";
