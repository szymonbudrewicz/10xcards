// Code-review agent CLI (M5L2): git diff on stdin -> structured JSON review on stdout.
// Usage and cost go to stderr, so stdout stays pure JSON for the CI gate (M5L3).
//   git diff | npm run review --prefix packages/code-reviewer
//   npm run review --prefix packages/code-reviewer -- path/to/file.diff
// Without stdin or a path it reviews data/sample.diff.
/* eslint-disable no-console -- CLI: stdout is the review JSON, stderr carries usage and errors */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { runReview } from "./agent.ts";
import { createOpenRouterModel } from "./model.ts";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
// Load this package's .env only, never the app's .env/.dev.vars, whatever the cwd.
config({ path: `${PACKAGE_DIR}.env`, quiet: true });

const MODEL = process.env.REVIEW_MODEL ?? "z-ai/glm-5.3";
const SAMPLE_DIFF = `${PACKAGE_DIR}data/sample.diff`;

async function readDiff(): Promise<string> {
  const path = process.argv[2];
  if (path) return readFileSync(path, "utf8");
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const diff = Buffer.concat(chunks).toString("utf8");
    if (diff.trim()) return diff;
  }
  console.error(`Brak diffa na wejściu — recenzuję ${SAMPLE_DIFF}`);
  return readFileSync(SAMPLE_DIFF, "utf8");
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error(`Brak OPENROUTER_API_KEY — skopiuj ${PACKAGE_DIR}.env.example do .env i wklej klucz.`);
  process.exit(1);
}

const diff = await readDiff();
// OPENROUTER_BASE_URL lets tests point the CLI at a local fake server.
const model = createOpenRouterModel({ apiKey, modelId: MODEL, baseURL: process.env.OPENROUTER_BASE_URL });
const { review, usage } = await runReview(diff, { model });

console.error(
  `[usage] model=${usage.modelId} steps=${usage.steps} in=${usage.inputTokens ?? "?"} out=${usage.outputTokens ?? "?"} ` +
    `cost=${usage.costUsd === undefined ? "?" : `$${usage.costUsd.toFixed(6)}`}`,
);
console.log(JSON.stringify(review, null, 2));
