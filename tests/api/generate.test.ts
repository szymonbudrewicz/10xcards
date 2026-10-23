// POST /api/generate, called directly with a fake APIContext.
// Oracle: PRD US-01 + NFR (pasted text), lessons.md (AI endpoints need a session → 401 JSON),
// error-code contract in context/changes/generate-card-proposals/plan.md. Not the implementation.
// Risks: test-plan.md §2 #4 and #5.

import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/pages/api/generate";
import type { ApiError } from "@/types";
import { apiContext, openRouterCompletion, requestedUrl, SIGNED_IN_USER, stubFetch } from "../helpers/api-context";

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

const timeout = (): Response => {
  throw new DOMException("The operation was aborted.", "TimeoutError");
};

describe("POST /api/generate — AI failures (risk #4)", () => {
  it.each([
    {
      name: "an HTTP error from the AI",
      respond: () => Response.json({}, { status: 500 }),
      status: 502,
      code: "ai_failed",
    },
    {
      name: "an unreadable AI answer",
      respond: () => openRouterCompletion("To nie jest JSON"),
      status: 502,
      code: "ai_failed",
    },
    { name: "an AI timeout", respond: timeout, status: 504, code: "ai_timeout" },
  ])("answers $status $code for $name, as a readable JSON error", async ({ respond, status, code }) => {
    stubFetch(respond);

    const response = await POST(apiContext({ user: SIGNED_IN_USER, body: { text: "Fotosynteza." } }));
    const error = (await response.json()) as ApiError;

    expect(response.status).toBe(status);
    expect(error.error.code).toBe(code);
    expect(error.error.message.trim()).not.toBe("");
  });
});

describe("POST /api/generate — pasted text stays private (risk #5)", () => {
  const LOG_METHODS = ["log", "info", "warn", "error", "debug"] as const;

  function spyOnConsole() {
    return LOG_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
  }

  it.each([
    { name: "401 anonymous", user: null, body: { text: MARKER } },
    { name: "400 too long", user: SIGNED_IN_USER, body: { text: TOO_LONG } },
    { name: "400 not JSON", user: SIGNED_IN_USER, rawBody: `{"text": "${MARKER}` },
    { name: "503 no API key", user: SIGNED_IN_USER, body: { text: MARKER }, noKey: true },
    {
      name: "502 AI error",
      user: SIGNED_IN_USER,
      body: { text: MARKER },
      respond: () => Response.json({}, { status: 500 }),
      logs: true,
    },
    { name: "504 AI timeout", user: SIGNED_IN_USER, body: { text: MARKER }, respond: timeout, logs: true },
    { name: "200 success", user: SIGNED_IN_USER, body: { text: MARKER } },
  ])("$name: the pasted text is in no log line and not echoed in the response", async (testCase) => {
    if (testCase.noKey) env.openRouterApiKey = "";
    stubFetch(
      testCase.respond ?? (() => openRouterCompletion({ proposals: [{ front: "Pytanie", back: "Odpowiedź" }] })),
    );
    const spies = spyOnConsole();

    const response = await POST(apiContext({ user: testCase.user, body: testCase.body, rawBody: testCase.rawBody }));
    const responseText = await response.text();

    const logged = spies.flatMap((spy): unknown[] => spy.mock.calls.flat()).map((arg) => inspect(arg, { depth: 10 }));
    // Error branches do log: prove the spy saw that line, so "no marker" is not vacuous.
    if (testCase.logs) expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) expect(line).not.toContain(MARKER);
    expect(responseText).not.toContain(MARKER);
  });

  it("on success, the only outbound request is the single AI call", async () => {
    const fetchSpy = stubFetch(() => openRouterCompletion({ proposals: [{ front: "Pytanie", back: "Odpowiedź" }] }));

    const response = await POST(apiContext({ user: SIGNED_IN_USER, body: { text: MARKER } }));

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(requestedUrl(fetchSpy)).toBe("http://ai.test/api/v1/chat/completions");
  });
});
