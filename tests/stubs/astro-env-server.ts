// Stand-in for Astro's virtual module `astro:env/server` (aliased in vitest.config.ts).
// Values are test-only. A test that needs another value (e.g. an empty API key) overrides
// this module with vi.mock("astro:env/server", ...).

export const OPENROUTER_API_KEY: string | undefined = "test-openrouter-key";
export const OPENROUTER_BASE_URL: string | undefined = "http://ai.test/api/v1";
export const SUPABASE_URL: string | undefined = undefined;
export const SUPABASE_KEY: string | undefined = undefined;
