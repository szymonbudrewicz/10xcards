import type { ApiError } from "@/types";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

/** `code` in snake_case, `message` in Polish and never containing user input. */
export function jsonError(status: number, code: string, message: string): Response {
  const body: ApiError = { error: { code, message } };
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
