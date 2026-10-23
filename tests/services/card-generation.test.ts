// generateCardProposals with global fetch stubbed at the network boundary.
// Oracle: PRD US-01 (at most 10 proposals, front/back), service contract in
// context/changes/generate-card-proposals/plan.md:91 (error codes, default URL). Risk: test-plan.md §2 #4.

import { afterEach, describe, expect, it, vi } from "vitest";
import { CardGenerationError, generateCardProposals } from "@/lib/services/card-generation";
import { openRouterCompletion, requestedUrl, stubFetch } from "../helpers/api-context";

const config = { apiKey: "test-key", baseUrl: "http://ai.test/api/v1" };
const TEXT = "Fotosynteza zachodzi w chloroplastach.";

afterEach(() => {
  vi.unstubAllGlobals();
});

const card = (i: number) => ({ front: `Pytanie ${i}`, back: `Odpowiedź ${i}` });

describe("generateCardProposals — result shape (risk #4)", () => {
  it("returns at most 10 proposals, keeping the first ones in order, when the AI sends 12", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => card(i + 1));
    stubFetch(() => openRouterCompletion({ proposals: twelve }));

    const proposals = await generateCardProposals(TEXT, config);

    expect(proposals).toHaveLength(10);
    expect(proposals[0]).toEqual(card(1));
    expect(proposals[9]).toEqual(card(10));
  });

  it("drops cards with a blank front or back and trims the rest", async () => {
    stubFetch(() =>
      openRouterCompletion({
        proposals: [
          { front: "   ", back: "Odpowiedź bez pytania" },
          { front: "Pytanie bez odpowiedzi", back: "" },
          { front: "  Gdzie zachodzi fotosynteza?  ", back: "\nW chloroplastach.\t" },
        ],
      }),
    );

    const proposals = await generateCardProposals(TEXT, config);

    expect(proposals).toEqual([{ front: "Gdzie zachodzi fotosynteza?", back: "W chloroplastach." }]);
  });
});

describe("generateCardProposals — AI failures (risk #4)", () => {
  it("reports ai_failed with the provider status when the AI answers with an HTTP error", async () => {
    stubFetch(() => Response.json({ error: { message: "boom" } }, { status: 500 }));

    const result = generateCardProposals(TEXT, config);

    await expect(result).rejects.toBeInstanceOf(CardGenerationError);
    await expect(result).rejects.toMatchObject({ code: "ai_failed", providerStatus: 500 });
  });

  it.each([
    { name: "a body without choices", respond: () => Response.json({ id: "x" }) },
    { name: "content that is not JSON", respond: () => openRouterCompletion("To nie jest JSON") },
    { name: "JSON in the wrong shape", respond: () => openRouterCompletion({ cards: [card(1)] }) },
    {
      name: "a network error",
      respond: (): Response => {
        throw new TypeError("fetch failed");
      },
    },
  ])("reports ai_failed for $name", async ({ respond }) => {
    stubFetch(respond);

    await expect(generateCardProposals(TEXT, config)).rejects.toMatchObject({ code: "ai_failed" });
  });

  it.each(["TimeoutError", "AbortError"])("reports ai_timeout when the request ends with %s", async (name) => {
    stubFetch(() => {
      throw new DOMException("The operation was aborted.", name);
    });

    await expect(generateCardProposals(TEXT, config)).rejects.toMatchObject({ code: "ai_timeout" });
  });
});

describe("generateCardProposals — network egress (risk #5)", () => {
  it("sends exactly one request, to the configured chat-completions endpoint", async () => {
    const fetchSpy = stubFetch(() => openRouterCompletion({ proposals: [card(1)] }));

    await generateCardProposals(TEXT, config);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(requestedUrl(fetchSpy)).toBe("http://ai.test/api/v1/chat/completions");
  });

  it("falls back to the public OpenRouter URL when no base URL is configured", async () => {
    const fetchSpy = stubFetch(() => openRouterCompletion({ proposals: [card(1)] }));

    await generateCardProposals(TEXT, { ...config, baseUrl: "" });

    expect(requestedUrl(fetchSpy)).toBe("https://openrouter.ai/api/v1/chat/completions");
  });
});
