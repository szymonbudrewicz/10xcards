// Shared by the integration tests against a local Supabase. Creates throwaway accounts, so it refuses any
// non-loopback host and never reads .dev.vars.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];

export function localSupabase(): { url: string; key: string } {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!rawUrl || !key)
    throw new Error("SUPABASE_URL and SUPABASE_KEY must be set in the environment (local Supabase only).");
  if (/\s/.test(key)) throw new Error("SUPABASE_KEY must be a single key without whitespace.");
  const parsed = new URL(rawUrl);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("SUPABASE_URL must start with http:// or https://.");
  if (!LOOPBACK_HOSTS.includes(parsed.hostname)) {
    throw new Error(
      `refusing to run against host "${parsed.hostname}": these tests create accounts (local Supabase only).`,
    );
  }
  return { url: parsed.origin, key };
}

/** Signs up a fresh account and returns a client holding its session (email confirmation must be disabled). */
export async function signUp(label: string): Promise<SupabaseClient> {
  const { url, key } = localSupabase();
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signUp({
    email: `accept-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`,
    password: `Acc-${crypto.randomUUID()}`,
  });
  if (error || !data.session) {
    throw new Error(
      `sign up as ${label} returned no session (${error?.message ?? "no error"}); is email confirmation disabled?`,
    );
  }
  return client;
}

/** Inserts a generation as the client's user (accepted_count 0); returns its id. */
export async function newGeneration(client: SupabaseClient, proposedCount: number): Promise<string> {
  const { data, error } = await client
    .from("generations")
    .insert({ proposed_count: proposedCount })
    .select("id")
    .single();
  if (error) throw new Error(`insert generation failed: ${error.message}`);
  const id: unknown = data.id;
  if (typeof id !== "string") throw new Error("insert generation returned no id");
  return id;
}
