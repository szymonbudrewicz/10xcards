import type { Page } from "@playwright/test";

// Astro React islands drop input typed before they hydrate. Wait for this once before the
// first input when the action is not idempotent (e.g. a paid AI call), instead of retrying it.
// Every island has hydrated when no `astro-island[ssr]` is left in the DOM.
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
}

// Database reads for E2E assertions go straight to Supabase REST as the E2E user, so RLS applies
// exactly as it does for the app. Specs also delete their own cards through it, so it refuses
// anything but a loopback Supabase (the values come from .dev.vars.e2e, never production).
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];

export interface SupabaseRest {
  /** GET /rest/v1/<pathAndQuery>; throws on a non-2xx answer. */
  select<T>(pathAndQuery: string): Promise<T[]>;
  /** POST /rest/v1/<table> with `return=representation`; returns the inserted rows, throws on a non-2xx answer. */
  insert<T>(table: string, row: Record<string, unknown>): Promise<T[]>;
  /** DELETE /rest/v1/<pathAndQuery>; throws on a non-2xx answer. */
  remove(pathAndQuery: string): Promise<void>;
}

function supabaseBase(): { base: string; key: string } {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!rawUrl || !key) {
    throw new Error("Set SUPABASE_URL and SUPABASE_KEY in .dev.vars.e2e (local Supabase from `npx supabase start`)");
  }
  const url = new URL(rawUrl);
  if (!LOOPBACK_HOSTS.includes(url.hostname)) {
    throw new Error(`E2E database helpers only run against local Supabase, not "${url.hostname}"`);
  }
  return { base: url.origin, key };
}

async function failure(what: string, response: Response): Promise<Error> {
  const body = (await response.text()).slice(0, 200);
  return new Error(`${what} failed: HTTP ${response.status} ${body}`);
}

/** Signs in with the password grant of local Supabase Auth and returns a REST client for that user. */
export async function signInWithPassword(email: string, password: string): Promise<SupabaseRest> {
  const { base, key } = supabaseBase();
  const signIn = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!signIn.ok) throw await failure("Supabase sign-in", signIn);
  const { access_token: token } = (await signIn.json()) as { access_token: string };
  const headers = { apikey: key, Authorization: `Bearer ${token}` };

  return {
    async select<T>(pathAndQuery: string) {
      const response = await fetch(`${base}/rest/v1/${pathAndQuery}`, { headers });
      if (!response.ok) throw await failure(`GET ${pathAndQuery}`, response);
      return (await response.json()) as T[];
    },
    async insert<T>(table: string, row: Record<string, unknown>) {
      const response = await fetch(`${base}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      if (!response.ok) throw await failure(`POST ${table}`, response);
      return (await response.json()) as T[];
    },
    async remove(pathAndQuery: string) {
      const response = await fetch(`${base}/rest/v1/${pathAndQuery}`, { method: "DELETE", headers });
      if (!response.ok) throw await failure(`DELETE ${pathAndQuery}`, response);
    },
  };
}
