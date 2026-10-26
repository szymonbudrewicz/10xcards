// Stand-in for Astro's virtual module `astro:middleware` (aliased in vitest.config.ts).
// defineMiddleware only types the handler, so the identity function is enough.
import type { MiddlewareHandler } from "astro";

export const defineMiddleware = (handler: MiddlewareHandler): MiddlewareHandler => handler;
