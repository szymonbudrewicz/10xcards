// Local stand-in for the OpenRouter chat-completions API, bound to loopback only.
// Response shape follows OpenRouterNonStreamChatCompletionResponseSchema in
// @openrouter/ai-sdk-provider (choices[].message.content + usage incl. cost).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeResponse {
  status: number;
  body: unknown;
}

export interface FakeOpenRouter {
  baseURL: string;
  requests: unknown[];
  respondWith(response: FakeResponse): void;
  close(): Promise<void>;
}

// Consistent with the verdict rule: accountIsolation 2 <= 4 on a hard criterion -> fail.
export const VALID_REVIEW = {
  implementationCorrectness: { score: 6, reason: "src/pages/api/x.ts:12 nie obsługuje pustego wejścia." },
  accountIsolation: { score: 2, reason: "src/pages/api/x.ts:8 bierze user_id z body." },
  privacySecretsAiCost: { score: 8, reason: "Brak logowania wklejonego tekstu." },
  projectConventions: { score: 7, reason: "Zgodne z konwencjami." },
  simplicityAndScope: { score: 8, reason: "Jedna spójna zmiana." },
  testRiskCoverage: { score: 3, reason: "Brak testu dla src/pages/api/x.ts." },
  verdict: "fail" as const,
  summary: "**FAIL** — fake review from the test server.",
};

export function reviewCompletion(review: unknown = VALID_REVIEW, cost?: number): FakeResponse {
  return {
    status: 200,
    body: {
      id: "gen-test",
      model: "test/model",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(review) } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        ...(cost === undefined ? {} : { cost }),
      },
    },
  };
}

// A paid call that produced no answer, e.g. reasoning used up max_tokens (finish_reason "length").
export function emptyCompletion(finishReason: string, cost?: number): FakeResponse {
  const response = reviewCompletion(VALID_REVIEW, cost);
  const body = response.body as { choices: { finish_reason: string; message: { content: string } }[] };
  body.choices[0] = {
    ...body.choices[0],
    finish_reason: finishReason,
    message: { role: "assistant", content: "" },
  } as never;
  return response;
}

export async function startFakeOpenRouter(): Promise<FakeOpenRouter> {
  const requests: unknown[] = [];
  let response: FakeResponse = reviewCompletion(VALID_REVIEW, 0.00123);

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      requests.push(raw ? (JSON.parse(raw) as unknown) : null);
      res.writeHead(response.status, { "content-type": "application/json" });
      res.end(JSON.stringify(response.body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseURL: `http://127.0.0.1:${port}/api/v1`,
    requests,
    respondWith(next) {
      response = next;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        }),
      ),
  };
}
