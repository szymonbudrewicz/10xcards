import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests against a local Supabase (npm run test:integration); kept out of `npm test`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Every case signs up and talks to the database over HTTP.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
