// Seed test — the pattern every generated E2E test copies.
// risk: test-plan.md #6 — sign-in or redirects break: a signed-out visitor reaches a
//       protected page, or a signed-in user cannot get into the app.
// Built today: the gate redirects to /auth/signin and signing in always lands on /dashboard
// (there is no return to the originally requested page, so this test does not assert one).
import { test, expect } from "@playwright/test";

// The risk is the signed-out path, so this test opts out of the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test("signed-out visit to /generate is gated by sign-in, and signing in opens the app", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD (see context/foundation/test-stack.md, ## E2E)");
  }

  // Setup: a visitor without a session opens a protected product route.
  await page.goto("/generate");

  // The gate sends them to sign-in, and the generator is not rendered.
  await page.waitForURL("**/auth/signin");
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Generuj fiszki" })).toBeHidden();

  // Action: sign in through the real form. Signing in is idempotent, so retry until the
  // React island has hydrated and the submit leaves the sign-in page.
  await expect(async () => {
    await page.getByLabel("Email").fill("");
    await page.getByLabel("Email").fill(username);
    await page.getByLabel("Password", { exact: true }).fill("");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard", { timeout: 5_000 });
  }).toPass();

  // Assertion: the middleware accepts the new session cookie — the dashboard greets this
  // user and the protected generator now opens instead of bouncing back to sign-in.
  await expect(page.getByText(`Welcome, ${username}`)).toBeVisible();
  await page.goto("/generate");
  await expect(page.getByRole("heading", { name: "Generuj fiszki", level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/generate$/);

  // Cleanup: none — this test creates no data. It does not sign out either: Supabase sign-out
  // can revoke every session of the user, including the saved one other specs load.
});
