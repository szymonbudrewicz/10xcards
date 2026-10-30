// risk: test-plan.md #3 (cards edited or deleted through the new endpoints) / FR-010 — the owner's
//       edit or delete hits the wrong card, the edit is lost, or a card goes without confirmation.
//       Account B against account A's cards is covered by `npm run isolation` and the endpoint
//       tests; this spec covers the owner's flow as the user clicks it on /cards, and confirms it
//       by reading the database.
// seed: tests/e2e/seed.spec.ts
// Mocked: nothing. Two cards are inserted straight into the local Supabase (from .dev.vars.e2e)
// as the E2E user over REST; auth, middleware, /cards, PATCH/DELETE /api/cards/[id] and the
// React views are real.
// Cleanup: every card whose front contains this test's token is deleted (local database only).
import { test, expect } from "@playwright/test";
import { signInWithPassword, waitForHydration, type SupabaseRest } from "./helpers";

interface CardRow {
  id: string;
  front: string;
  back: string;
}

test.describe("risk #3 / FR-010 — the owner edits and deletes exactly the card they chose", () => {
  let db: SupabaseRest | undefined;
  let token: string | undefined;

  test.afterEach(async () => {
    if (db && token) await db.remove(`cards?front=like.*${token}*`);
  });

  test("edit the newer card, cancel then confirm deleting the older one", async ({ page }) => {
    const username = process.env.E2E_USERNAME;
    const password = process.env.E2E_PASSWORD;
    if (!username || !password) {
      throw new Error("Set E2E_USERNAME and E2E_PASSWORD (see context/foundation/test-stack.md, ## E2E)");
    }
    db = await signInWithPassword(username, password);

    token = `E2E-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    test.info().annotations.push({ type: "test-data", description: token });
    const olderFront = `${token} Pytanie starsze`;
    const newerFront = `${token} Pytanie nowsze`;
    const editedFront = `${token} Pytanie nowsze, poprawione`;
    const editedBack = "Odpowiedź poprawiona w E2E.";

    // Explicit created_at a minute apart, so "newer first" does not depend on insert timing.
    const now = Date.now();
    const [older] = await db.insert<CardRow>("cards", {
      front: olderFront,
      back: "Odpowiedź starsza.",
      created_at: new Date(now - 60_000).toISOString(),
    });
    const [newer] = await db.insert<CardRow>("cards", {
      front: newerFront,
      back: "Odpowiedź nowsza.",
      created_at: new Date(now).toISOString(),
    });

    // Signed in through storageState: open the list and wait until it is interactive.
    await page.goto("/cards");
    await expect(page.getByRole("heading", { name: /^Zapisane fiszki \(\d+\)$/, level: 2 })).toBeVisible();
    await waitForHydration(page);

    // Both cards are listed, the newer one above the older one. Other cards of the E2E user
    // may be on the list too, so only this test's cards (by token) are compared.
    const ours = page.getByRole("listitem").filter({ hasText: token });
    await expect(ours).toHaveCount(2);
    await expect(ours.nth(0)).toHaveAccessibleName(`Fiszka: ${newerFront}`);
    await expect(ours.nth(1)).toHaveAccessibleName(`Fiszka: ${olderFront}`);

    // Each request goes through auth and the database, which can take longer than an assertion
    // timeout locally, so wait for the request itself before looking at the UI.
    const cardRequest = (id: string, method: "PATCH" | "DELETE") =>
      page.waitForResponse((res) => res.url().endsWith(`/api/cards/${id}`) && res.request().method() === method);

    // Edit the newer card: both sides, then save.
    const newerItem = page.getByRole("listitem", { name: `Fiszka: ${newerFront}`, exact: true });
    await newerItem.getByRole("button", { name: "Edytuj" }).click();
    await newerItem.getByRole("textbox", { name: "Przód" }).fill(editedFront);
    await newerItem.getByRole("textbox", { name: "Tył" }).fill(editedBack);
    const patched = cardRequest(newer.id, "PATCH");
    await newerItem.getByRole("button", { name: "Zapisz zmiany" }).click();
    expect((await patched).status()).toBe(200);

    // The item is now labelled with the new front and shows both new sides.
    const editedItem = page.getByRole("listitem", { name: `Fiszka: ${editedFront}`, exact: true });
    await expect(editedItem.getByText(editedFront, { exact: true })).toBeVisible();
    await expect(editedItem.getByText(editedBack, { exact: true })).toBeVisible();
    await expect(editedItem.getByRole("textbox")).toHaveCount(0);

    // Delete the older card: "Anuluj" in the confirmation keeps it.
    const olderItem = page.getByRole("listitem", { name: `Fiszka: ${olderFront}`, exact: true });
    const confirm = page.getByRole("alertdialog", { name: "Usunąć tę fiszkę?" });
    await olderItem.getByRole("button", { name: "Usuń" }).click();
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText("Tej operacji nie można cofnąć.")).toBeVisible();
    await confirm.getByRole("button", { name: "Anuluj" }).click();
    await expect(confirm).toBeHidden();
    await expect(olderItem).toBeVisible();

    // "Usuń" in the confirmation deletes it.
    await olderItem.getByRole("button", { name: "Usuń" }).click();
    await expect(confirm).toBeVisible();
    const deleted = cardRequest(older.id, "DELETE");
    await confirm.getByRole("button", { name: "Usuń" }).click();
    expect((await deleted).status()).toBe(204);
    await expect(confirm).toBeHidden();
    await expect(olderItem).toBeHidden();
    await expect(ours).toHaveCount(1);

    // Database, read as the E2E user: the newer card holds the edit, the older card is gone.
    const edited = await db.select<CardRow>(`cards?id=eq.${newer.id}&select=id,front,back`);
    expect(edited).toEqual([{ id: newer.id, front: editedFront, back: editedBack }]);
    const removed = await db.select<CardRow>(`cards?id=eq.${older.id}&select=id`);
    expect(removed).toEqual([]);
  });
});
