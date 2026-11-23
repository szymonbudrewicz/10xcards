// Characterization tests for the reviewer CLI: exit code, stdout and stderr are asserted
// separately (gates are judged by exit code — context/foundation/lessons.md).
// No network: the model is a fake OpenRouter server on 127.0.0.1.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { REVIEW_SCHEMA } from "../src/review-schema.ts";
import {
  emptyCompletion,
  reviewCompletion,
  startFakeOpenRouter,
  VALID_REVIEW,
  type FakeOpenRouter,
} from "./helpers/fake-openrouter.ts";
import { runCli } from "./helpers/run-cli.ts";

const DIFF = "diff --git a/x.ts b/x.ts\n+const marker = 'CHARACTERIZATION_MARKER';\n";

let fake: FakeOpenRouter;

beforeAll(async () => {
  fake = await startFakeOpenRouter();
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.requests.length = 0;
  fake.respondWith(reviewCompletion(VALID_REVIEW, 0.00123));
});

const env = () => ({ OPENROUTER_API_KEY: "test-key", OPENROUTER_BASE_URL: fake.baseURL });

function expectReviewOnStdout(stdout: string) {
  const parsed = REVIEW_SCHEMA.parse(JSON.parse(stdout));
  expect(parsed).toEqual(VALID_REVIEW);
}

describe("reviewer CLI", () => {
  it("reviews a diff file passed as an argument", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reviewer-"));
    const file = join(dir, "change.diff");
    writeFileSync(file, DIFF);

    const result = await runCli({ args: [file], env: env() });

    expect(result.code).toBe(0);
    expectReviewOnStdout(result.stdout);
    expect(result.stderr).toMatch(
      /\[usage\] model=\S+ provider=\S+ steps=1 in=100 out=50 reasoning=\S+ cost=\$0\.001230/,
    );
    expect(JSON.stringify(fake.requests)).toContain("CHARACTERIZATION_MARKER");
  });

  it("reviews a diff piped on stdin", async () => {
    const result = await runCli({ stdin: DIFF, env: env() });

    expect(result.code).toBe(0);
    expectReviewOnStdout(result.stdout);
    expect(result.stderr).toContain("[usage]");
    expect(JSON.stringify(fake.requests)).toContain("CHARACTERIZATION_MARKER");
  });

  it("sends PR_TITLE/PR_BODY to the model and reports an overridden model verdict on stderr", async () => {
    fake.respondWith(reviewCompletion({ ...VALID_REVIEW, verdict: "pass" }, 0.001));

    const result = await runCli({ stdin: DIFF, env: { ...env(), PR_TITLE: "TITLE_MARKER", PR_BODY: "BODY_MARKER" } });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ verdict: "fail" });
    expect(result.stderr).toContain('[verdict] Model odpowiedział "pass"');
    expect(JSON.stringify(fake.requests)).toContain("TITLE_MARKER");
    expect(JSON.stringify(fake.requests)).toContain("BODY_MARKER");
  });

  it("falls back to data/sample.diff when there is no input", async () => {
    const result = await runCli({ env: env() });

    expect(result.code).toBe(0);
    expectReviewOnStdout(result.stdout);
    expect(result.stderr).toContain("sample.diff");
    expect(JSON.stringify(fake.requests)).toContain("bulk-delete.ts");
  });

  it("exits 1 without calling the model when the API key is empty", async () => {
    const result = await runCli({ stdin: DIFF, env: { ...env(), OPENROUTER_API_KEY: "" } });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("OPENROUTER_API_KEY");
    expect(fake.requests).toHaveLength(0);
  });

  it("exits non-zero with empty stdout when the provider fails", async () => {
    fake.respondWith({ status: 500, body: { error: { message: "boom", code: 500 } } });

    const result = await runCli({ stdin: DIFF, env: env() });

    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("reviewer CLI limits", () => {
  it("exits 2 with empty stdout when the run exceeds REVIEW_MAX_COST_USD", async () => {
    fake.respondWith(reviewCompletion(VALID_REVIEW, 0.5));

    const result = await runCli({ stdin: DIFF, env: { ...env(), REVIEW_MAX_COST_USD: "0.10" } });

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("[limit]");
  });

  it("exits 2 without calling the model when the diff exceeds REVIEW_MAX_DIFF_CHARS", async () => {
    const result = await runCli({ stdin: DIFF, env: { ...env(), REVIEW_MAX_DIFF_CHARS: "10" } });

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("[limit]");
    expect(fake.requests).toHaveLength(0);
  });

  it("exits 2 and still reports usage when the model runs out of output tokens", async () => {
    fake.respondWith(emptyCompletion("length", 0.0321));

    const result = await runCli({ stdin: DIFF, env: env() });

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(
      /\[usage\] model=\S+ provider=\S+ steps=1 in=100 out=50 reasoning=\S+ cost=\$0\.032100/,
    );
    expect(result.stderr).toContain("[limit]");
    expect(result.stderr).toContain("REVIEW_MAX_OUTPUT_TOKENS");
  });

  it("exits 2 when a JSON answer is cut off by the output limit (finish_reason length)", async () => {
    fake.respondWith(emptyCompletion("length", 0.03, '{"implementationCorrectness": {"score": 8, "rea'));

    const result = await runCli({ stdin: DIFF, env: env() });

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("[usage]");
    expect(result.stderr).toContain("REVIEW_MAX_OUTPUT_TOKENS");
  });

  it("sends the reasoning cap to OpenRouter: 8000 by default, REVIEW_MAX_REASONING_TOKENS overrides", async () => {
    await runCli({ stdin: DIFF, env: env() });
    await runCli({ stdin: DIFF, env: { ...env(), REVIEW_MAX_REASONING_TOKENS: "1234" } });

    const bodies = fake.requests as { reasoning?: { max_tokens?: number }; max_tokens?: number }[];
    expect(bodies[0]?.reasoning).toEqual({ max_tokens: 8000 });
    expect(bodies[0]?.max_tokens).toBe(16000);
    expect(bodies[1]?.reasoning).toEqual({ max_tokens: 1234 });
  });

  it("prints the upstream provider and reasoning tokens in [usage]", async () => {
    const result = await runCli({ stdin: DIFF, env: env() });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("provider=fake-upstream");
    expect(result.stderr).toContain("reasoning=30");
  });

  it("sends no reasoning cap when REVIEW_MAX_REASONING_TOKENS=0", async () => {
    const result = await runCli({ stdin: DIFF, env: { ...env(), REVIEW_MAX_REASONING_TOKENS: "0" } });

    expect(result.code).toBe(0);
    const body = fake.requests[0] as { reasoning?: unknown; max_tokens?: number };
    expect(body.reasoning).toBeUndefined();
    expect(body.max_tokens).toBe(16000);
  });

  it("exits 1 without calling the model when the reasoning cap is not below the output limit", async () => {
    const result = await runCli({
      stdin: DIFF,
      env: { ...env(), REVIEW_MAX_REASONING_TOKENS: "16000", REVIEW_MAX_OUTPUT_TOKENS: "16000" },
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("REVIEW_MAX_REASONING_TOKENS");
    expect(fake.requests).toHaveLength(0);
  });

  it("exits 1 and reports usage and finish reason when the model returns no review", async () => {
    fake.respondWith(emptyCompletion("stop", 0.002));

    const result = await runCli({ stdin: DIFF, env: env() });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/\[usage\] model=\S+ provider=\S+ steps=1 in=100 out=50 reasoning=\S+ cost=\?/);
    expect(result.stderr).toContain("[finish] Model nie zwrócił recenzji (finishReason=stop)");
  });

  it("exits 1 without calling the model when a limit is not a number", async () => {
    const result = await runCli({ stdin: DIFF, env: { ...env(), REVIEW_MAX_COST_USD: "abc" } });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("REVIEW_MAX_COST_USD");
    expect(fake.requests).toHaveLength(0);
  });

  it("warns on stderr but still prints the review when the provider reports no cost", async () => {
    fake.respondWith(reviewCompletion(VALID_REVIEW));

    const result = await runCli({ stdin: DIFF, env: env() });

    expect(result.code).toBe(0);
    expectReviewOnStdout(result.stdout);
    expect(result.stderr).toContain("cost=?");
    expect(result.stderr).toContain("nie zwrócił kosztu");
  });
});
