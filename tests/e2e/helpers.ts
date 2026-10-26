import type { Page } from "@playwright/test";

// Astro React islands drop input typed before they hydrate. Wait for this once before the
// first input when the action is not idempotent (e.g. a paid AI call), instead of retrying it.
// Every island has hydrated when no `astro-island[ssr]` is left in the DOM.
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
}
