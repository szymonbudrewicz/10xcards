// risk: test-plan.md #1 — an accepted card is lost, saved with the wrong content, or the
//       acceptance counters do not match what the user did. Idempotency, index range and
//       counter limits are covered by tests/integration/accept-proposal.test.ts; this spec
//       covers the whole flow as the user clicks it, and confirms it by reading the database.
// seed: tests/e2e/seed.spec.ts
// Mocked: OpenRouter (server-side call) via scripts/mock-openrouter.mjs, which always returns
// MOCK_PROPOSALS (3 cards). Auth, middleware, /api/generate, /api/cards, accept_proposal()
// and the React views are real; the database is the local Supabase from .dev.vars.e2e.
// Cleanup: the cards of this generation are deleted. The generations row stays, because
// `authenticated` has no delete grant on it (local database only).
import { test, expect } from "@playwright/test";
import { MOCK_PROPOSALS } from "../../scripts/mock-openrouter.mjs";
import { signInWithPassword, waitForHydration, type SupabaseRest } from "./helpers";

interface GenerationRow {
  proposed_count: number;
  accepted_count: number;
}

interface CardRow {
  proposal_index: number;
  front: string;
  back: string;
}

test.describe("risk #1 — accepted proposals are saved and counted, removed ones are not", () => {
  let db: SupabaseRest | undefined;
  let generationId: string | undefined;

  test.afterEach(async () => {
    if (db && generationId) await db.remove(`cards?generation_id=eq.${generationId}`);
  });

  test("accept #1, edit and save #2, remove #3: two cards with that content and counters 3 / 2", async ({ page }) => {
    const username = process.env.E2E_USERNAME;
    const password = process.env.E2E_PASSWORD;
    if (!username || !password) {
      throw new Error("Set E2E_USERNAME and E2E_PASSWORD (see context/foundation/test-stack.md, ## E2E)");
    }
    db = await signInWithPassword(username, password);

    const token = `E2E-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    test.info().annotations.push({ type: "test-data", description: token });
    const editedFront = `${MOCK_PROPOSALS[1].front} (${token})`;
    const editedBack = `${MOCK_PROPOSALS[1].back} Poprawione w E2E.`;

    // Signed in through storageState: open the generator and wait until the form is interactive.
    await page.goto("/generate");
    const sourceText = page.getByRole("textbox", { name: "Tekst do nauki" });
    await expect(sourceText).toBeVisible();
    await waitForHydration(page);

    // Generate once and keep the generationId the cards will be linked to.
    await sourceText.fill(`${token} Fotosynteza zachodzi w chloroplastach.`);
    const generated = page.waitForResponse(
      (res) => res.url().endsWith("/api/generate") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Generuj" }).click();
    const generateResponse = await generated;
    expect(generateResponse.status()).toBe(200);
    ({ generationId } = (await generateResponse.json()) as { generationId: string });
    expect(generationId).toEqual(expect.any(String));

    const items = page.getByRole("listitem");
    await expect(items).toHaveCount(MOCK_PROPOSALS.length);
    const first = page.getByRole("listitem", { name: "Propozycja 1" });
    const second = page.getByRole("listitem", { name: "Propozycja 2" });
    const third = page.getByRole("listitem", { name: "Propozycja 3" });

    // Each save goes through auth and the database, which can take longer than an assertion
    // timeout locally, so wait for the save itself before looking at the UI.
    const cardSaved = () =>
      page.waitForResponse((res) => res.url().endsWith("/api/cards") && res.request().method() === "POST");

    // #1: accept as proposed.
    const firstSaved = cardSaved();
    await first.getByRole("button", { name: "Akceptuj" }).click();
    expect((await firstSaved).status()).toBe(201);
    await expect(first.getByText("Zapisano")).toBeVisible();

    // #2: edit both sides, then save (= accept with the corrected content).
    await second.getByRole("button", { name: "Popraw" }).click();
    await second.getByRole("textbox", { name: "Przód" }).fill(editedFront);
    await second.getByRole("textbox", { name: "Tył" }).fill(editedBack);
    const secondSaved = cardSaved();
    await second.getByRole("button", { name: "Zapisz fiszkę" }).click();
    expect((await secondSaved).status()).toBe(201);
    await expect(second.getByText("Zapisano")).toBeVisible();
    await expect(second.getByText(editedFront)).toBeVisible();

    // #3: remove — UI only, nothing is sent.
    await third.getByRole("button", { name: "Usuń" }).click();
    await expect(third).toBeHidden();

    // UI: two saved proposals are left and the removed one is gone.
    await expect(items).toHaveCount(2);
    await expect(page.getByText("Zapisano")).toHaveCount(2);

    // Database, read as the E2E user: proposed counts all three, accepted only the two saved,
    // still after the removal of #3.
    const generations = await db.select<GenerationRow>(
      `generations?id=eq.${generationId}&select=proposed_count,accepted_count`,
    );
    expect(generations).toEqual([{ proposed_count: MOCK_PROPOSALS.length, accepted_count: 2 }]);

    // The cards of this generation hold #1 as proposed and #2 as edited; #3 has no card.
    const cards = await db.select<CardRow>(
      `cards?generation_id=eq.${generationId}&select=proposal_index,front,back&order=proposal_index`,
    );
    expect(cards).toEqual([
      { proposal_index: 0, front: MOCK_PROPOSALS[0].front, back: MOCK_PROPOSALS[0].back },
      { proposal_index: 1, front: editedFront, back: editedBack },
    ]);
  });
});
