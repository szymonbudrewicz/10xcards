// The verdict rule from the review criteria, applied in code so the CI gate does not
// depend on the model doing arithmetic: fail when a hard criterion (account isolation,
// privacy/secrets/AI cost) scores <= 4 or any criterion scores <= 3; pass otherwise.
import { CRITERION_KEYS, HARD_CRITERIA, type CriterionKey, type Review, type Verdict } from "./review-schema.ts";

export const HARD_FAIL_AT_OR_BELOW = 4;
export const ANY_FAIL_AT_OR_BELOW = 3;

export function verdictFromScores(scores: Record<CriterionKey, number>): Verdict {
  const hardFail = HARD_CRITERIA.some((key) => scores[key] <= HARD_FAIL_AT_OR_BELOW);
  const anyFail = CRITERION_KEYS.some((key) => scores[key] <= ANY_FAIL_AT_OR_BELOW);
  return hardFail || anyFail ? "fail" : "pass";
}

export function scoresOf(review: Review): Record<CriterionKey, number> {
  return Object.fromEntries(CRITERION_KEYS.map((key) => [key, review[key].score])) as Record<CriterionKey, number>;
}

// Returns the review with the rule's verdict and the model's own verdict for reporting.
export function applyVerdictRule(review: Review): { review: Review; modelVerdict: Verdict } {
  return { review: { ...review, verdict: verdictFromScores(scoresOf(review)) }, modelVerdict: review.verdict };
}
