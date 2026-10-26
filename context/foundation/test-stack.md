# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.64.1
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/<name>.spec.ts
- full-suite command: npx playwright test
- base URL: http://localhost:4321
- port: 4321 (detected from the Astro preview default — no port in astro.config.mjs or package.json; detected default 4321, override with E2E_PORT)
- web server command: npm run build && npm run preview -- --port $E2E_PORT, with CLOUDFLARE_ENV=e2e (the adapter then reads .dev.vars.e2e instead of .dev.vars) and ASTRO_PREVIEW_BACKGROUND=1; reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in .dev.vars.e2e (gitignored; local Supabase from `npx supabase start`, never production)
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts — protects #6 (sign-in gate: a signed-out visit to a protected page lands on sign-in, and signing in opens the app)
- browser CLI: playwright-cli, command skill at .claude/skills/playwright-cli/SKILL.md
- updated: 2026-10-26
