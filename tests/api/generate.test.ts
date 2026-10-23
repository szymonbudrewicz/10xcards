// POST /api/generate, called directly with a fake APIContext.
// Oracle: PRD US-01 + NFR (pasted text), lessons.md (AI endpoints need a session → 401 JSON),
// error-code contract in context/changes/generate-card-proposals/plan.md. Not the implementation.
// Risks: test-plan.md §2 #4 and #5.

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/pages/api/generate";
import type { ApiError } from "@/types";
import { apiContext, stubFetch } from "../helpers/api-context";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
