import type { APIContext } from "astro";
import { vi } from "vitest";

/** A signed-in user as the middleware leaves it in `locals.user` (only `id` matters here). */
export const SIGNED_IN_USER = { id: "00000000-0000-4000-8000-000000000001", email: "test@example.com" };

interface ContextOptions {
  user: typeof SIGNED_IN_USER | null;
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as-is (for malformed bodies). Wins over `body`. */
  rawBody?: string;
}

/** Minimal APIContext for calling an endpoint handler directly: the handler reads only `locals` and `request`. */
export function apiContext({ user, body, rawBody }: ContextOptions): APIContext {
  const request = new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
  return { locals: { user }, request } as unknown as APIContext;
}

/** Response body OpenRouter sends for a chat completion whose content is `content`. */
export function openRouterCompletion(content: unknown): Response {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  return Response.json({ choices: [{ message: { role: "assistant", content: text } }] });
}

/**
 * Replaces global fetch — the only way the app reaches the AI provider — with a spy.
 * `respond` builds each response (or throws to simulate a network error / timeout).
 * Undo with vi.unstubAllGlobals() in afterEach.
 */
export function stubFetch(respond: () => Response | Promise<Response> = () => openRouterCompletion({ proposals: [] })) {
  const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve().then(respond));
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}
