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
    expect(comment).toContain("| Izolacja kont i dostęp do danych (twarda reguła) | 2/10 | ❌ |");
    expect(comment).toContain(
      "- **Izolacja kont i dostęp do danych (twarda reguła) (2/10):** src/pages/api/x.ts:8 bierze user_id z body.",
    );
    for (const key of CRITERION_KEYS) expect(comment).toContain(VALID_REVIEW[key].reason);
    expect(comment).toContain(VALID_REVIEW.summary);
  });

  it("keeps reasons out of the table rows", () => {
    const tableRows = renderComment(VALID_REVIEW)
      .split("\n")
      .filter((line) => line.startsWith("| ") && line.includes("/10"));

    expect(tableRows).toHaveLength(CRITERION_KEYS.length);
    expect(renderComment(VALID_REVIEW)).toContain("| Kryterium | Ocena | Status |");
    for (const row of tableRows) expect(row).not.toContain("src/pages");
  });

  // Same thresholds as the verdict rule: hard criteria fail at <= 4, the rest at <= 3.
  it.each([
    ["accountIsolation", 4, "❌"],
    ["accountIsolation", 5, "⚠️"],
    ["testRiskCoverage", 3, "❌"],
    ["testRiskCoverage", 4, "⚠️"],
    ["testRiskCoverage", 6, "⚠️"],
    ["testRiskCoverage", 7, "✅"],
  ] as const)("marks %s scored %i as %s", (key, score, mark) => {
    const review = { ...VALID_REVIEW, [key]: { score, reason: "r" } };

    expect(renderComment(review)).toContain(`| ${score}/10 | ${mark} |`);
  });

  it("keeps a multi-line reason in one list item", () => {
    const review = { ...VALID_REVIEW, projectConventions: { score: 7, reason: "a\n  b\r\nc" } };

    expect(renderComment(review)).toContain("- **Zgodność z konwencjami 10xCards (7/10):** a b c");
  });
});
