// Contract of the promptfoo provider (evals/reviewProvider.ts) without promptfoo and without
// the network: the model is the fake OpenRouter on loopback. The paid eval itself (npm run eval)
// is never part of npm test.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import ReviewProvider from "../evals/reviewProvider.ts";
import { SCHEMA_FILE, schemaFileContent } from "../evals/write-schema.ts";
import { REVIEW_SCHEMA } from "../src/index.ts";
import {
  emptyCompletion,
  reviewCompletion,
  startFakeOpenRouter,
  VALID_REVIEW,
  type FakeOpenRouter,
} from "./helpers/fake-openrouter.ts";

let fake: FakeOpenRouter;
const saved = { key: process.env.OPENROUTER_API_KEY, url: process.env.OPENROUTER_BASE_URL };

beforeAll(async () => {
  fake = await startFakeOpenRouter();
  // Explicit values: the provider would otherwise load the real key from the package .env.
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_BASE_URL = fake.baseURL;
});

afterAll(async () => {
  await fake.close();
  for (const [name, value] of [
    ["OPENROUTER_API_KEY", saved.key],
    ["OPENROUTER_BASE_URL", saved.url],
  ] as const) {
    if (value === undefined) Reflect.deleteProperty(process.env, name);
    else process.env[name] = value;
  }
});

beforeEach(() => {
  fake.requests.length = 0;
  fake.respondWith(reviewCompletion(VALID_REVIEW, 0.00123));
});

const vars = { diff: "diff --git a/x.ts b/x.ts\n+const marker = 'EVAL_MARKER';\n" };

describe("eval provider", () => {
  it("returns the schema-valid review with token usage, cost and run metadata", async () => {
    const provider = new ReviewProvider({ config: { model: "test/model" } });

    const response = await provider.callApi("ignored prompt", { vars });

    expect(response.error).toBeUndefined();
    expect(REVIEW_SCHEMA.parse(response.output)).toEqual(VALID_REVIEW);
    expect(response.tokenUsage).toEqual({ total: 150, prompt: 100, completion: 50 });
    expect(response.cost).toBe(0.00123);
    expect(response.metadata).toMatchObject({
      modelVerdict: "fail",
      provider: "fake-upstream",
      reasoningTokens: 30,
      costUsd: 0.00123,
    });
    expect(typeof response.metadata?.latencyMs).toBe("number");
    expect(JSON.stringify(fake.requests)).toContain("EVAL_MARKER");
  });

  it("forwards the PR title and description from vars to the model, like the CI workflow", async () => {
    const provider = new ReviewProvider({ config: { model: "test/model" } });

    await provider.callApi("", { vars: { ...vars, title: "TITLE_MARKER", body: "BODY_MARKER" } });

    const request = JSON.stringify(fake.requests);
    expect(request).toContain("TITLE_MARKER");
    expect(request).toContain("BODY_MARKER");
  });

  it("sends the reasoning cap by default and none with maxReasoningTokens: null", async () => {
    await new ReviewProvider({ config: { model: "test/model" } }).callApi("", { vars });
    await new ReviewProvider({ config: { model: "test/model", maxReasoningTokens: null } }).callApi("", { vars });

    const bodies = fake.requests as { reasoning?: unknown }[];
    expect(bodies[0]?.reasoning).toEqual({ max_tokens: 8000 });
    expect(bodies[1]?.reasoning).toBeUndefined();
  });

  it("reports a cut-off answer as an error with the limit flag and the paid usage", async () => {
    fake.respondWith(emptyCompletion("length", 0.02));

    const response = await new ReviewProvider({ config: { model: "test/model" } }).callApi("", { vars });

    expect(response.output).toBeUndefined();
    expect(response.error).toMatch(/^OutputTokenLimitError: /);
    expect(response.error).not.toContain("EVAL_MARKER");
    expect(response.cost).toBe(0.02);
    expect(response.metadata).toMatchObject({ limit: true, provider: "fake-upstream" });
  });

  it("returns an error without calling the model when the diff var is missing", async () => {
    const response = await new ReviewProvider({ config: { model: "test/model" } }).callApi("", { vars: {} });

    expect(response.error).toContain("diff");
    expect(fake.requests).toHaveLength(0);
  });

  it("requires config.model", () => {
    expect(() => new ReviewProvider({ config: {} })).toThrow("config.model");
  });

  it("keeps evals/review.schema.json equal to REVIEW_JSON_SCHEMA (regenerate: npm run eval:schema)", () => {
    expect(readFileSync(SCHEMA_FILE, "utf8")).toBe(schemaFileContent());
  });
});
