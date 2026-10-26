import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// E2E env lives in the gitignored .dev.vars.e2e: local Supabase (npx supabase start),
// the OpenRouter mock URL and E2E_USERNAME / E2E_PASSWORD. Never production values.
// .dev.vars (local dev) points at the hosted project, so E2E never reads it.
// In CI the file is absent and the variables come from the job.
const E2E_ENV_FILE = ".dev.vars.e2e";
if (existsSync(E2E_ENV_FILE)) process.loadEnvFile(E2E_ENV_FILE);

// 4321 is Astro's default preview port (no port set in astro.config.mjs or package.json).
// E2E_PORT overrides it when that port is taken on this machine.
const PORT = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Production-like build + preview on the Workers runtime, on the port above.
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // The Cloudflare adapter reads .dev.vars.<CLOUDFLARE_ENV> instead of .dev.vars,
      // at build time (copied into dist/server) and in preview.
      CLOUDFLARE_ENV: "e2e",
      // Astro 7 moves `astro preview` into a background daemon when it detects an agent;
      // keep it in the foreground so Playwright owns the server.
      ASTRO_PREVIEW_BACKGROUND: "1",
    },
  },
});
