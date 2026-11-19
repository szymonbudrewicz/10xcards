// PR comment rendered deterministically from the review JSON: verdict, every criterion
// with its score and one-sentence reason, then the model's summary.
import { CRITERIA, CRITERION_KEYS, type Review } from "./review-schema.ts";

// Pipes and newlines would break a Markdown table row.
function cell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\|");
}

export function renderComment(review: Review): string {
  const rows = CRITERION_KEYS.map((key) => {
    const { score, reason } = review[key];
    return `| ${CRITERIA[key].description ?? key} | ${score}/10 | ${cell(reason)} |`;
  });
  return [
    `## AI Code Review: ${review.verdict === "pass" ? "✅ pass" : "❌ fail"}`,
    "",
    "| Kryterium | Ocena | Uzasadnienie |",
    "| --- | --- | --- |",
    ...rows,
    "",
    review.summary,
    "",
  ].join("\n");
}
