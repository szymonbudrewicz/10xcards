import { defineConfig } from "vitest/config";

// CLI tests spawn tsx child processes; give them more than the 5 s default.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
