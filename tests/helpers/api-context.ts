import type { APIContext } from "astro";
import { vi } from "vitest";

/** A signed-in user as the middleware leaves it in `locals.user` (only `id` matters here). */
export const SIGNED_IN_USER = { id: "00000000-0000-4000-8000-000000000001", email: "test@example.com" };

interface ContextOptions {
  user: typeof SIGNED_IN_USER | null;
  /** Set by the middleware when Supabase Auth could not be reached (default false). */
  authUnavailable?: boolean;
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as-is (for malformed bodies). Wins over `body`. */
  rawBody?: string;
  /** Request URL (default the generate endpoint). */
  url?: string;
}

/**
 * Minimal APIContext for calling an endpoint handler directly: the handler reads only `locals`, `request`
 * and `cookies` (passed on to the — mocked — Supabase client).
 */
export function apiContext({
  user,
  authUnavailable = false,
  body,
  rawBody,
  url = "http://localhost/api/generate",
}: ContextOptions): APIContext {
  const request = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
  const cookies = { get: () => undefined, set: () => undefined, delete: () => undefined, has: () => false };
  return { locals: { user, authUnavailable }, request, cookies } as unknown as APIContext;
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
/** URL of the n-th request made through a stubFetch spy, whatever form fetch got it in. */
export function requestedUrl(fetchSpy: ReturnType<typeof stubFetch>, n = 0): string {
  const input = fetchSpy.mock.calls[n][0];
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

export function stubFetch(respond: () => Response | Promise<Response> = () => openRouterCompletion({ proposals: [] })) {
  const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve().then(respond));
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}
