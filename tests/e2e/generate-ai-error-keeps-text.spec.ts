// risk: test-plan.md #4 — facet: when the AI fails, the user loses the pasted text or gets no
//       readable message. Validation, the 10 000-character limit and the error shape are covered
//       by tests/api/generate.test.ts; this spec covers what only the rendered UI can show.
// seed: tests/e2e/seed.spec.ts
// Mocked: OpenRouter (server-side call) via scripts/mock-openrouter.mjs; auth, middleware,
// /api/generate and the React form are real. The flow stores nothing, so there is no cleanup.
import { test, expect } from "@playwright/test";
import { MOCK_AI_ERROR_MARKER, MOCK_PROPOSALS } from "../../scripts/mock-openrouter.mjs";
import { waitForHydration } from "./helpers";

test.describe("risk #4 — an AI failure keeps the pasted text and the user can retry", () => {
  test("after an AI error the pasted text stays in the field with a Polish message, and a retry shows proposals", async ({
    page,
  }) => {
    const token = `E2E-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    test.info().annotations.push({ type: "test-data", description: token });
    const failingText = `${token} ${MOCK_AI_ERROR_MARKER} Fotosynteza zachodzi w chloroplastach.`;
    const retryText = `${token} Fotosynteza zachodzi w chloroplastach.`;

    // Signed in through storageState: open the generator and wait until the form is interactive.
    await page.goto("/generate");
    const sourceText = page.getByRole("textbox", { name: "Tekst do nauki" });
    const generateButton = page.getByRole("button", { name: "Generuj" });
    await expect(sourceText).toBeVisible();
    await waitForHydration(page);

    // Paste a text the AI fails on and generate once.
    await sourceText.fill(failingText);
    const failed = page.waitForResponse(
      (res) => res.url().endsWith("/api/generate") && res.request().method() === "POST",
    );
    await generateButton.click();
    expect((await failed).status()).toBe(502);

    // The failure is explained in Polish and the pasted text is still in the field, untouched.
    await expect(page.getByRole("alert")).toHaveText("Nie udało się wygenerować fiszek. Spróbuj ponownie.");
    await expect(sourceText).toHaveValue(failingText);
    await expect(page.getByRole("heading", { name: "Propozycje fiszek" })).toBeHidden();

    // Retry with a corrected text: the user did not have to paste everything again.
    await sourceText.fill(retryText);
    const succeeded = page.waitForResponse(
      (res) => res.url().endsWith("/api/generate") && res.request().method() === "POST",
    );
    await generateButton.click();
    expect((await succeeded).status()).toBe(200);

    // Proposals replace the error, and the text still stays in the field after success.
    await expect(page.getByRole("heading", { name: "Propozycje fiszek", level: 2 })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(MOCK_PROPOSALS.length);
    await expect(page.getByText(MOCK_PROPOSALS[0].front)).toBeVisible();
    await expect(page.getByRole("alert")).toBeHidden();
    await expect(sourceText).toHaveValue(retryText);
  });
});
