// Writes evals/review.schema.json from REVIEW_JSON_SCHEMA (the is-json assertion's schema).
// Run after changing src/review-schema.ts: npm run eval:schema --prefix packages/code-reviewer
// tests/eval-provider.test.ts fails while the file and the schema disagree.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REVIEW_JSON_SCHEMA } from "../src/index.ts";

export const SCHEMA_FILE = fileURLToPath(new URL("review.schema.json", import.meta.url));

export function schemaFileContent(): string {
  return `${JSON.stringify(REVIEW_JSON_SCHEMA, null, 2)}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(SCHEMA_FILE, schemaFileContent());
}
