// PR comment CLI for the CI workflow (M5L3): Markdown on stdout, errors on stderr.
//   npm run comment --silent --prefix packages/code-reviewer -- --review <review.json>
//   npm run comment --silent --prefix packages/code-reviewer -- --no-verdict <reason>
// <reason> is one of NO_VERDICT_REASONS. Exit 1 on bad arguments or an invalid review file.
/* eslint-disable no-console -- CLI: stdout is the comment body, stderr carries errors */
import { readFileSync } from "node:fs";
import { NO_VERDICT_REASONS, renderComment, renderNoVerdictComment, type NoVerdictReason } from "./comment.ts";
import { REVIEW_SCHEMA } from "./review-schema.ts";

const USAGE = `Użycie: comment --review <plik.json> | --no-verdict <${NO_VERDICT_REASONS.join("|")}>`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function isReason(value: string): value is NoVerdictReason {
  return (NO_VERDICT_REASONS as readonly string[]).includes(value);
}

const [flag, value, ...rest] = process.argv.slice(2);
if (!value || rest.length > 0) fail(USAGE);

if (flag === "--review") {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(value, "utf8"));
  } catch (error) {
    fail(`Nie można odczytać recenzji z ${value}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = REVIEW_SCHEMA.safeParse(raw);
  if (!parsed.success) fail(`Plik ${value} nie pasuje do REVIEW_SCHEMA: ${parsed.error.message}`);
  process.stdout.write(renderComment(parsed.data));
} else if (flag === "--no-verdict") {
  if (!isReason(value)) fail(`Nieznana przyczyna "${value}". ${USAGE}`);
  process.stdout.write(renderNoVerdictComment(value));
} else {
  fail(USAGE);
}
