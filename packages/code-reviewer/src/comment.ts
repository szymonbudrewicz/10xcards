// PR comments rendered deterministically: from the review JSON (verdict, every criterion
// with its score and one-sentence reason, then the model's summary), or a short note when
// the run produced no verdict. Every comment ends with COMMENT_MARKER so the bot's comment
// can be found and edited in place by the CI workflow.
import { CRITERIA, CRITERION_KEYS, HARD_CRITERIA, type CriterionKey, type Review } from "./review-schema.ts";
import { ANY_FAIL_AT_OR_BELOW, HARD_FAIL_AT_OR_BELOW } from "./verdict.ts";

export const COMMENT_MARKER = "<!-- ai-cr -->";

// Why a CI run has no model verdict; empty_diff is the one case that still passes the gate.
export const NO_VERDICT_REASONS = ["missing_key", "provider_error", "limit", "invalid_output", "empty_diff"] as const;
export type NoVerdictReason = (typeof NO_VERDICT_REASONS)[number];

const NO_VERDICT_TEXT: Record<NoVerdictReason, string> = {
  missing_key:
    "Recenzja nie ruszyła: brak klucza OPENROUTER_API_KEY (sekret repozytorium; PR-y z forków go nie dostają). Dodaj sekret i dodaj etykietę `ai-cr:review`.",
  provider_error:
    "Recenzja nie powiodła się po stronie dostawcy modelu. Szczegóły są w logach joba; ponów ją etykietą `ai-cr:review`.",
  limit:
    "Recenzję zatrzymał limit przebiegu (rozmiar diffa, tokeny albo koszt — `REVIEW_MAX_*`). Podziel PR albo podnieś limit; szczegóły w logach joba.",
  invalid_output:
    "Model nie zwrócił poprawnego werdyktu (`pass`/`fail`). Szczegóły w logach joba; ponów recenzję etykietą `ai-cr:review`.",
  empty_diff: "Brak zmian do recenzji poza lockfile'ami (`package-lock.json`) — model nie był wywoływany.",
};

// Status per criterion, from the verdict-rule thresholds: ❌ this score alone fails the PR,
// ⚠️ below 7 (the reason must point at a file or line), ✅ otherwise.
function status(key: CriterionKey, score: number): string {
  const failAt = HARD_CRITERIA.includes(key) ? HARD_FAIL_AT_OR_BELOW : ANY_FAIL_AT_OR_BELOW;
  if (score <= failAt) return "❌";
  return score < 7 ? "⚠️" : "✅";
}

// A reason is one list item: newlines would end it early.
function oneLine(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, " ").trim();
}

// Long reasons stay out of the table so the scores remain scannable.
export function renderComment(review: Review): string {
  const name = (key: CriterionKey) => CRITERIA[key].description ?? key;
  const rows = CRITERION_KEYS.map(
    (key) => `| ${name(key)} | ${review[key].score}/10 | ${status(key, review[key].score)} |`,
  );
  const reasons = CRITERION_KEYS.map(
    (key) => `- **${name(key)} (${review[key].score}/10):** ${oneLine(review[key].reason)}`,
  );
  return [
    `## AI Code Review: ${review.verdict === "pass" ? "✅ pass" : "❌ fail"}`,
    "",
    "| Kryterium | Ocena | Status |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "❌ ocena sama oblewa PR (oś twarda ≤ 4, pozostałe ≤ 3) · ⚠️ poniżej 7 · ✅ 7 i więcej",
    "",
    "### Uzasadnienia",
    "",
    ...reasons,
    "",
    review.summary,
    "",
    COMMENT_MARKER,
    "",
  ].join("\n");
}

export function renderNoVerdictComment(reason: NoVerdictReason): string {
  const heading = reason === "empty_diff" ? "✅ pass" : "⚠️ brak werdyktu";
  return [`## AI Code Review: ${heading}`, "", NO_VERDICT_TEXT[reason], "", COMMENT_MARKER, ""].join("\n");
}
