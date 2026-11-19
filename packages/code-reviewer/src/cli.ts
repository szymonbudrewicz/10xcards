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
import { DEFAULT_LIMITS, ReviewLimitError, type ReviewLimits } from "./limits.ts";
import { createOpenRouterModel } from "./model.ts";

// Exit codes: 0 review printed, 1 setup/provider error, 2 a per-run limit stopped the review.
const EXIT_LIMIT = 2;

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

// Unset or empty -> default; anything else must be a positive number (integer where noted).
function readLimit(name: string, fallback: number, integer: boolean): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    console.error(`Niepoprawna wartość ${name}=${raw} — oczekiwana liczba ${integer ? "całkowita " : ""}większa od 0.`);
    process.exit(1);
  }
  return value;
}

const limits: ReviewLimits = {
  maxCostUsd: readLimit("REVIEW_MAX_COST_USD", DEFAULT_LIMITS.maxCostUsd, false),
  maxDiffChars: readLimit("REVIEW_MAX_DIFF_CHARS", DEFAULT_LIMITS.maxDiffChars, true),
  maxOutputTokens: readLimit("REVIEW_MAX_OUTPUT_TOKENS", DEFAULT_LIMITS.maxOutputTokens, true),
};

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error(`Brak OPENROUTER_API_KEY — skopiuj ${PACKAGE_DIR}.env.example do .env i wklej klucz.`);
  process.exit(1);
}

const diff = await readDiff();
// OPENROUTER_BASE_URL lets tests point the CLI at a local fake server.
const model = createOpenRouterModel({ apiKey, modelId: MODEL, baseURL: process.env.OPENROUTER_BASE_URL });

try {
  const { review, usage } = await runReview(diff, { model, limits });
  console.error(
    `[usage] model=${usage.modelId} steps=${usage.steps} in=${usage.inputTokens ?? "?"} out=${usage.outputTokens ?? "?"} ` +
      `cost=${usage.costUsd === undefined ? "?" : `$${usage.costUsd.toFixed(6)}`}`,
  );
  if (usage.costUsd === undefined) {
    console.error(
      "[usage] Provider nie zwrócił kosztu — budżet nie został sprawdzony (działają limity diffa i tokenów).",
    );
  }
  console.log(JSON.stringify(review, null, 2));
} catch (error) {
  if (error instanceof ReviewLimitError) {
    console.error(`[limit] ${error.message}`);
    process.exit(EXIT_LIMIT);
  }
  throw error;
}
