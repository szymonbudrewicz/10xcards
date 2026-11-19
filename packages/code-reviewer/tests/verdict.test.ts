// The verdict rule decides the CI gate, so its thresholds are pinned at the boundaries.
import { describe, expect, it } from "vitest";
import { applyVerdictRule, CRITERION_KEYS, renderComment, verdictFromScores, type CriterionKey } from "../src/index.ts";
import { VALID_REVIEW } from "./helpers/fake-openrouter.ts";

function scores(overrides: Partial<Record<CriterionKey, number>> = {}): Record<CriterionKey, number> {
  return { ...Object.fromEntries(CRITERION_KEYS.map((key) => [key, 8])), ...overrides } as Record<CriterionKey, number>;
}

describe("verdictFromScores", () => {
  it("passes when every criterion is above its threshold", () => {
    expect(verdictFromScores(scores())).toBe("pass");
  });

  it.each(["accountIsolation", "privacySecretsAiCost"] as const)(
    "fails at 4 on hard criterion %s, passes at 5",
    (key) => {
      expect(verdictFromScores(scores({ [key]: 4 }))).toBe("fail");
      expect(verdictFromScores(scores({ [key]: 5 }))).toBe("pass");
    },
  );

  it.each(["implementationCorrectness", "projectConventions", "simplicityAndScope", "testRiskCoverage"] as const)(
    "fails at 3 on %s, passes at 4",
    (key) => {
      expect(verdictFromScores(scores({ [key]: 3 }))).toBe("fail");
      expect(verdictFromScores(scores({ [key]: 4 }))).toBe("pass");
    },
  );
});

describe("applyVerdictRule", () => {
  it("can turn a model 'fail' into 'pass' when no score breaks the rule", () => {
    const review = {
      ...VALID_REVIEW,
      accountIsolation: { score: 9, reason: "ok" },
      testRiskCoverage: { score: 6, reason: "ok" },
    };

    const result = applyVerdictRule(review);

    expect(result.review.verdict).toBe("pass");
    expect(result.modelVerdict).toBe("fail");
  });
});

describe("renderComment", () => {
  it("shows the verdict, every criterion with score and reason, and the summary", () => {
    const comment = renderComment(VALID_REVIEW);

    expect(comment).toContain("AI Code Review: ❌ fail");
    expect(comment).toContain(
      "| Izolacja kont i dostęp do danych (twarda reguła) | 2/10 | src/pages/api/x.ts:8 bierze user_id z body. |",
    );
    for (const key of CRITERION_KEYS) expect(comment).toContain(`${VALID_REVIEW[key].score}/10`);
    expect(comment).toContain(VALID_REVIEW.summary);
  });

  it("keeps a reason with a pipe or newline inside one table row", () => {
    const review = { ...VALID_REVIEW, projectConventions: { score: 7, reason: "a | b\nc" } };

    expect(renderComment(review)).toContain("| 7/10 | a \\| b c |");
  });
});
