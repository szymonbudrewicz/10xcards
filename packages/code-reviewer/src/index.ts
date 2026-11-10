// Code-review agent (M5L2): git diff on stdin -> structured JSON review on stdout.
// Usage and cost go to stderr, so stdout stays pure JSON for the CI gate (M5L3).
//   git diff | npm run review --prefix packages/code-reviewer
//   npm run review --prefix packages/code-reviewer -- path/to/file.diff
// Without stdin or a path it reviews data/sample.diff.
/* eslint-disable no-console -- CLI: stdout is the review JSON, stderr carries usage and errors */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { ToolLoopAgent, Output, isStepCount, type StepResult, type ToolSet } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { REVIEW_SCHEMA, SYSTEM_PROMPT, type Review } from "./review-schema.ts";

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

// OpenRouter reports the billed cost per step when usage accounting is on; sum it over steps.
function totalCost(steps: readonly StepResult<ToolSet>[]): number | undefined {
  let sum: number | undefined;
  for (const step of steps) {
    const openrouter = step.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined;
    const cost = openrouter?.usage?.cost;
    if (typeof cost === "number") sum = (sum ?? 0) + cost;
  }
  return sum;
}

async function review(diff: string, apiKey: string): Promise<Review> {
  const openrouter = createOpenRouter({ apiKey });
  const reviewer = new ToolLoopAgent({
    model: openrouter(MODEL, { usage: { include: true } }),
    instructions: SYSTEM_PROMPT,
    tools: {},
    output: Output.object({ schema: REVIEW_SCHEMA }),
    stopWhen: isStepCount(2),
  });

  const { output, usage, steps } = await reviewer.generate({
    prompt: `Zrecenzuj ten diff:\n\n${diff}`,
  });

  const cost = totalCost(steps);
  console.error(
    `[usage] model=${MODEL} steps=${steps.length} in=${usage.inputTokens ?? "?"} out=${usage.outputTokens ?? "?"} ` +
      `cost=${cost === undefined ? "?" : `$${cost.toFixed(6)}`}`,
  );
  return output;
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error(`Brak OPENROUTER_API_KEY — skopiuj ${PACKAGE_DIR}.env.example do .env i wklej klucz.`);
  process.exit(1);
}

const diff = await readDiff();
console.log(JSON.stringify(await review(diff, apiKey), null, 2));
