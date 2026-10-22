// Local stand-in for OpenRouter, used by the smoke test in CI (and reusable by the S-03 E2E test).
// Zero dependencies. Run: node scripts/mock-openrouter.mjs   (port: MOCK_OPENROUTER_PORT, default 4399)
// Point the app at it with OPENROUTER_BASE_URL=http://127.0.0.1:4399/api/v1 and any OPENROUTER_API_KEY.
//
// Contract for tests (import these constants instead of copying them):
//   MOCK_AI_ERROR_MARKER — a request whose body contains this string gets HTTP 500 (app answers 502 ai_failed).
//   MOCK_PROPOSALS       — the fixed cards returned for every other request.
// Request bodies are never logged: they carry the user's pasted text.

import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export const MOCK_AI_ERROR_MARKER = "SMOKE_AI_ERROR";

export const MOCK_PROPOSALS = [
  { front: "Gdzie zachodzi fotosynteza?", back: "W chloroplastach." },
  { front: "Jaki gaz jest produktem ubocznym fotosyntezy?", back: "Tlen." },
  { front: "Jak nazywa się faza ciemna fotosyntezy?", back: "Cykl Calvina." },
];

const PORT = Number(process.env.MOCK_OPENROUTER_PORT ?? 4399);
const HOST = "127.0.0.1";

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function handle(req, res) {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && req.url === "/api/v1/chat/completions") {
    if (!/^Bearer \S+/.test(req.headers.authorization ?? "")) {
      return send(res, 401, { error: { message: "Missing bearer token", code: 401 } });
    }
    const body = await readBody(req);
    if (body.includes(MOCK_AI_ERROR_MARKER)) {
      return send(res, 500, { error: { message: "Mock provider error", code: 500 } });
    }
    return send(res, 200, {
      id: "mock-completion",
      model: "mock",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: JSON.stringify({ proposals: MOCK_PROPOSALS }) },
        },
      ],
    });
  }

  return send(res, 404, { error: { message: "Not found", code: 404 } });
}

// Start the server only when run directly, so tests can import the constants above.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  createServer((req, res) => {
    handle(req, res).catch(() => send(res, 500, { error: { message: "Mock failure", code: 500 } }));
  }).listen(PORT, HOST, () => {
    console.log(`mock-openrouter listening on http://${HOST}:${PORT}`);
  });
}
