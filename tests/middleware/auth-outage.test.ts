// src/middleware.ts — what a Supabase failure looks like to the user and to the logs.
// Oracle: context/changes/auth-outage-visible/plan.md (decisions) and the observability audit
// context/audits/observability/2026-10-26_generowanie.md, finding G1. Not the implementation.
// Bug: getUser() returns (does not throw) AuthRetryableFetchError on a network/5xx failure,
// and the middleware used to drop it, so an outage looked like being signed out, with no log.

import type { APIContext } from "astro";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { onRequest } from "@/middleware";
import { SIGNED_IN_USER } from "../helpers/api-context";

// What the next supabase.auth.getUser() call resolves to.
interface GetUserResult {
  data: { user: unknown };
  error: unknown;
}
const auth = vi.hoisted((): { result: GetUserResult } => ({ result: { data: { user: null }, error: null } }));
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ auth: { getUser: () => Promise.resolve(auth.result) } }),
}));

const SESSION_COOKIE = "sb-test-auth-token=base64-SECRET-COOKIE-VALUE";

function getUserReturns(user: unknown, error: unknown) {
  auth.result = { data: { user }, error };
}

async function visit(path: string) {
  const locals = {} as App.Locals;
  const context = {
    url: new URL(`http://localhost${path}`),
    request: new Request(`http://localhost${path}`, { headers: { Cookie: SESSION_COOKIE } }),
    cookies: {},
    locals,
    redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
  } as unknown as APIContext;
  const next = vi.fn(() => Promise.resolve(new Response("page")));
  const response = (await onRequest(context, next)) as Response;
  return { response, next, locals };
}

let errorSpy: MockInstance<typeof console.error>;
let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Everything the middleware wrote to the console, as one string. */
function logged(): string {
  return JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls]);
}

describe("middleware — Supabase outage is not a sign-out (audit G1)", () => {
  it("answers a protected page with 503 instead of the sign-in redirect and logs the error name", async () => {
    getUserReturns(null, new AuthRetryableFetchError("fetch failed", 0));

    const { response, next } = await visit("/generate");

    expect(response.status).toBe(503);
    expect(response.headers.get("Location")).toBeNull();
    expect(await response.text()).toContain("Logowanie jest chwilowo niedostępne");
    expect(next).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logged()).toContain("AuthRetryableFetchError");
    expect(logged()).not.toContain("SECRET-COOKIE-VALUE");
  });

  it("treats a 5xx from Supabase Auth as an outage too", async () => {
    getUserReturns(null, new AuthApiError("upstream error", 500, "unexpected_failure"));

    const { response } = await visit("/dashboard");

    expect(response.status).toBe(503);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("lets an API request through with the outage flagged, so the endpoint can answer 503", async () => {
    getUserReturns(null, new AuthRetryableFetchError("fetch failed", 0));

    const { next, locals } = await visit("/api/generate");

    expect(next).toHaveBeenCalledTimes(1);
    expect(locals.user).toBeNull();
    expect(locals.authUnavailable).toBe(true);
  });
});

describe("middleware — signed-out visitors keep today's behaviour", () => {
  it("redirects a visitor without a session to sign-in and logs nothing", async () => {
    getUserReturns(null, new AuthSessionMissingError());

    const { response } = await visit("/generate");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("redirects a rejected (stale) session to sign-in and leaves one warning, not an error", async () => {
    getUserReturns(null, new AuthApiError("invalid JWT", 403, "bad_jwt"));

    const { response } = await visit("/generate");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logged()).toContain("bad_jwt");
  });

  it("lets a signed-in user through with no outage flag", async () => {
    getUserReturns(SIGNED_IN_USER, null);

    const { response, next, locals } = await visit("/generate");

    expect(await response.text()).toBe("page");
    expect(next).toHaveBeenCalledTimes(1);
    expect(locals.user).toEqual(SIGNED_IN_USER);
    expect(locals.authUnavailable).toBe(false);
  });
});
