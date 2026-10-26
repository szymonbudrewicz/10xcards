# E2E Quality Rules

These rules govern every E2E test the agent writes. They are **not** copied into
your agent's rules file (`CLAUDE.md`, `AGENTS.md`, …): they matter only while
you work on E2E tests, so they ship with the skills and load when one runs.
`/10x-e2e-setup` writes the seed to follow them; `/10x-e2e` reads this file
before it generates a test and reviews every test against it. The rules
constrain the agent's output so generated tests are stable by default — agents
apply known patterns far more reliably than they invent new ones.

## The rules (Playwright)

```
# E2E Testing Rules

- Use getByRole, getByLabel, getByText as primary locators.
  Fall back to getByTestId only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use page.waitForTimeout(). Wait for specific conditions:
  toBeVisible(), waitForURL(), waitForResponse().
- Assert the business outcome, not implementation details.
- Use unique identifiers (e.g., timestamp suffix) for test data
  to avoid collisions in parallel runs. Clean up in afterEach and
  assert every cleanup call succeeded (expect(res).toBeOK()) — a
  cleanup that fails silently leaves data behind while the test stays green.
- Use storageState for authentication — never log in through UI
  in individual tests.
```

## Governing rules (the reasoning behind the rules)

- **Don't generate E2E tests from scratch.** Start from `test-plan.md`: pick the
  2–3 highest risks that need browser-level coverage and feed them as input. A
  risk needs E2E when it crosses several system boundaries (auth, routing, API,
  DB) or exists only in the rendered UI; if an isolated function can prove it, a
  unit test is enough.
- **E2E ≠ zero mocking.** Internal boundaries (auth, routing, DB) stay real —
  that's where integration risk hides. Mock expensive/non-deterministic external
  APIs (LLMs, payment gateways) at the network layer.
- **Name the test after the risk:** `test('flashcard data persists after page
  reload', ...)`, not `test('test 1', ...)`.
- **The assertion must fail if the risk materializes.** Control question for
  every assertion: would this fail if the `test-plan.md` risk came true? If not,
  it's decorative.

## Why these rules (source authority)

Every rule traces to Playwright's official Best Practices and Test Assertions
docs:

- `getByRole` is the recommended default locator strategy; CSS selectors couple
  tests to implementation details.
- Each test must be completely isolated with its own storage, data, cookies.
- Web-first assertions wait until conditions are met; `waitForTimeout` is
  officially designated an anti-pattern ("Never wait for timeout in production.
  Tests that wait for time are inherently flaky").
- `storageState` is the standard pattern for authenticated tests.

## Other stacks

The rules above are Playwright syntax; the principles are tool-agnostic. Map
each to your tool's idiom:

| Principle | Playwright | Cypress | WebdriverIO / Selenium |
| --- | --- | --- | --- |
| Role-based locator | `getByRole` | `cy.findByRole` (Testing Library) | accessibility-name / role strategy |
| Wait for state | `expect().toBeVisible()`, `waitForResponse` | `cy.contains().should('be.visible')`, `cy.intercept` | explicit waits on conditions, never `sleep` |
| Test isolation | parallel workers, own data | `beforeEach` reset, no shared aliases | fresh session per test |
| Auth without UI | `storageState` | `cy.session` | saved cookies / token injection |
| Data cleanup | unique ids + `afterEach`, each call asserted | unique ids + `afterEach`, each call asserted | unique ids + teardown, each call asserted |

If you work on a non-Playwright stack, write these mappings into your seed test
and your E2E prompts so the agent produces idiomatic, stable tests for your tool.

## Project conventions (10xCards)

Local additions for this repo, on top of the rules above. Keep them when syncing the skill.

- **Env and backend.** E2E reads `.dev.vars.e2e` (local Supabase from `npx supabase start`,
  `E2E_USERNAME` / `E2E_PASSWORD`). The `webServer` sets `CLOUDFLARE_ENV=e2e`, so the
  Cloudflare adapter reads that file instead of `.dev.vars`, which points at production.
  Never point an E2E run at `.dev.vars`.
- **AI is mocked server-side** by `scripts/mock-openrouter.mjs` on `127.0.0.1:4399`
  (`OPENROUTER_BASE_URL` in `.dev.vars.e2e`). Import `MOCK_PROPOSALS` and
  `MOCK_AI_ERROR_MARKER` from it instead of copying the values; a source text containing
  the marker makes the AI call fail. `page.route()` cannot intercept this call.
- **Locator names come from the snapshot, in the view's language:** app views are Polish
  ("Generuj", "Tekst do nauki"), the auth views are English ("Sign in", "Email").
- **Requests from the test (`page.request`, cleanup) need an `Origin: <baseURL>` header**
  on POST/PATCH/DELETE: Astro's origin check answers 403 without it.
- **Never sign the shared test user out** in a spec: Supabase sign-out can revoke the
  session saved in `playwright/.auth/user.json` that every other spec loads.
- **Files:** specs are `tests/e2e/*.spec.ts` (Vitest only collects `tests/**/*.test.ts`);
  nothing under `src/pages/` (Astro turns every file there into a route).
- **Privacy:** pasted source text is never logged or stored — a mock or helper must not
  print request bodies.
