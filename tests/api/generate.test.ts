// POST /api/generate, called directly with a fake APIContext.
// Oracle: PRD US-01 + NFR (pasted text), lessons.md (AI endpoints need a session → 401 JSON),
// error-code contract in context/changes/generate-card-proposals/plan.md. Not the implementation.
// Risks: test-plan.md §2 #4 and #5.

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/pages/api/generate";
import type { ApiError } from "@/types";
import { apiContext, SIGNED_IN_USER, stubFetch } from "../helpers/api-context";

// The API key is read per request, so a test can switch it off (503 case) through this getter.
const env = vi.hoisted((): { openRouterApiKey: string | undefined } => ({ openRouterApiKey: "test-openrouter-key" }));
vi.mock("astro:env/server", () => ({
  get OPENROUTER_API_KEY() {
    return env.openRouterApiKey;
  },
  OPENROUTER_BASE_URL: "http://ai.test/api/v1",
}));

afterEach(() => {
  env.openRouterApiKey = "test-openrouter-key";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// PRD US-01: limit is 10 000 characters. Literal on purpose — never MAX_TEXT_LENGTH from the code.
const MARKER = "ZNACZNIK-WKLEJONEGO-TEKSTU";
const TOO_LONG = MARKER + "a".repeat(10_001 - MARKER.length);

describe("POST /api/generate — session (risk #5)", () => {
  it("rejects an anonymous request with 401 and never calls the AI provider", async () => {
    const fetchSpy = stubFetch();

    // A valid text, so only the missing session can be the reason for the rejection.
    const response = await POST(apiContext({ user: null, body: { text: "Fotosynteza zachodzi w chloroplastach." } }));
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.message.trim()).not.toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/generate — input validation (risks #4, #5)", () => {
  it.each([
    { name: "empty text", body: { text: "" }, code: "text_empty" },
    { name: "whitespace-only text", body: { text: "  \n\t " }, code: "text_empty" },
    { name: "10 001 characters", body: { text: TOO_LONG }, code: "text_too_long" },
    { name: "text that is not a string", body: { text: 123 }, code: "invalid_request" },
    { name: "missing text field", body: {}, code: "invalid_request" },
  ])("rejects $name with 400 $code and never calls the AI provider", async ({ body, code }) => {
    const fetchSpy = stubFetch();

    const response = await POST(apiContext({ user: SIGNED_IN_USER, body }));
    const error = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(error.error.code).toBe(code);
    expect(error.error.message.trim()).not.toBe("");
    expect(error.error.message).not.toContain(MARKER);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON with 400 invalid_request and never calls the AI provider", async () => {
    const fetchSpy = stubFetch();

    const response = await POST(apiContext({ user: SIGNED_IN_USER, rawBody: `{"text": "${MARKER}` }));
    const error = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(error.error.code).toBe("invalid_request");
    expect(error.error.message).not.toContain(MARKER);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts exactly 10 000 characters (Polish letters count as one each) and calls the AI once", async () => {
    const fetchSpy = stubFetch();

    const response = await POST(apiContext({ user: SIGNED_IN_USER, body: { text: "ż".repeat(10_000) } }));

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("answers 503 ai_not_configured without calling the AI when the API key is missing", async () => {
    env.openRouterApiKey = "";
    const fetchSpy = stubFetch();

    const response = await POST(apiContext({ user: SIGNED_IN_USER, body: { text: "Fotosynteza." } }));
    const error = (await response.json()) as ApiError;

    expect(response.status).toBe(503);
    expect(error.error.code).toBe("ai_not_configured");
    expect(error.error.message.trim()).not.toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
