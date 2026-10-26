import { isAuthError, isAuthRetryableFetchError, isAuthSessionMissingError } from "@supabase/supabase-js";

/**
 * What the error from `supabase.auth.getUser()` means. The SDK returns (does not throw)
 * network and 5xx failures, so without this an outage looks exactly like being signed out.
 * - `ok`: no error.
 * - `signed_out`: no session cookie — an ordinary visitor.
 * - `rejected`: Supabase refused the session (e.g. stale cookie, wrong key) — a visitor, worth a warning.
 * - `unavailable`: Supabase Auth could not answer — an outage.
 */
export type GetUserOutcome = "ok" | "signed_out" | "rejected" | "unavailable";

export function classifyGetUserError(error: unknown): GetUserOutcome {
  if (error === null || error === undefined) return "ok";
  if (isAuthSessionMissingError(error)) return "signed_out";
  if (isAuthRetryableFetchError(error)) return "unavailable";
  if (isAuthError(error) && typeof error.status === "number" && error.status >= 500) return "unavailable";
  return "rejected";
}

/** Shown (page) and returned (API) when Supabase Auth is unavailable. */
export const AUTH_UNAVAILABLE_MESSAGE = "Logowanie jest chwilowo niedostępne. Spróbuj ponownie za chwilę.";

/** Log fields for an auth error: never the message, the user or the cookies. */
export function authErrorLogFields(error: unknown): { name: string; status?: number; code?: string } {
  if (isAuthError(error)) return { name: error.name, status: error.status, code: error.code };
  return { name: error instanceof Error ? error.name : typeof error };
}
