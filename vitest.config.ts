import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Plain Vite config on purpose: Astro's getViteConfig would load the Cloudflare adapter (workerd).
// Tests live in tests/, never in src/pages/ (Astro turns every file there into a route).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "astro:env/server": fileURLToPath(new URL("./tests/stubs/astro-env-server.ts", import.meta.url)),
      "astro:middleware": fileURLToPath(new URL("./tests/stubs/astro-middleware.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests need a local Supabase; they run through vitest.integration.config.ts (npm run test:integration).
    exclude: [...configDefaults.exclude, "tests/integration/**"],
  },
});
