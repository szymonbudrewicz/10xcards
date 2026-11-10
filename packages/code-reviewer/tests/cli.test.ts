// Characterization tests for the reviewer CLI: exit code, stdout and stderr are asserted
// separately (gates are judged by exit code — context/foundation/lessons.md).
// No network: the model is a fake OpenRouter server on 127.0.0.1.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { REVIEW_SCHEMA } from "../src/review-schema.ts";
import { reviewCompletion, startFakeOpenRouter, VALID_REVIEW, type FakeOpenRouter } from "./helpers/fake-openrouter.ts";
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
    expect(result.stderr).toMatch(/\[usage\] model=\S+ steps=1 in=100 out=50 cost=\$0\.001230/);
    expect(JSON.stringify(fake.requests)).toContain("CHARACTERIZATION_MARKER");
  });

  it("reviews a diff piped on stdin", async () => {
    const result = await runCli({ stdin: DIFF, env: env() });

    expect(result.code).toBe(0);
    expectReviewOnStdout(result.stdout);
    expect(result.stderr).toContain("[usage]");
    expect(JSON.stringify(fake.requests)).toContain("CHARACTERIZATION_MARKER");
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
