// Listing, editing and deleting saved cards against a local Supabase, through the real service functions
// (src/lib/services/cards.ts) and directly over REST; every case is checked by reading the rows back.
// Oracle: decisions in context/changes/manage-saved-cards/plan.md (Faza 1: update grant only on front/back, missing
// and someone else's card are the same "not found", deleting leaves the counters alone) + PRD FR-010, FR-012.
// Not the implementation. Risks: test-plan.md §2 #3 (isolation) and #1 (counters stay true).
// Needs SUPABASE_URL/SUPABASE_KEY from `npx supabase status -o env` (API_URL, ANON_KEY) and email confirmation
// disabled. Creates throwaway accounts, so it refuses any non-loopback host and never reads .dev.vars.

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { CardSaveError, deleteCard, listCards, updateCard } from "@/lib/services/cards";
import { localSupabase, newGeneration, signUp } from "./helpers";

// Fails fast (before any sign up) when the environment is missing or not local.
localSupabase();

interface CardRow {
  id: string;
  user_id: string;
  front: string;
  back: string;
  generation_id: string | null;
  proposal_index: number | null;
  created_at: string;
}

interface Counters {
  proposed_count: number;
  accepted_count: number;
}

let a: SupabaseClient;
let b: SupabaseClient;

beforeAll(async () => {
  a = await signUp("manage-a");
  b = await signUp("manage-b");
});

/** Saves a card through accept_proposal so it is linked to a generation slot, like a real accepted card. */
async function acceptedCard(
  client: SupabaseClient,
  front = "Stolica Polski?",
  back = "Warszawa",
): Promise<{ id: string; generationId: string }> {
  const generationId = await newGeneration(client, 3);
  // No generated Database types in this project, so the RPC result is typed here.
  const result = await client.rpc("accept_proposal", {
    p_generation_id: generationId,
    p_proposal_index: 1,
    p_front: front,
    p_back: back,
  });
  if (result.error) throw new Error(`accept_proposal failed: ${result.error.code} ${result.error.message}`);
  const rows = result.data as { id: string }[];
  expect(rows).toHaveLength(1);
  return { id: rows[0].id, generationId };
}

async function rowOf(client: SupabaseClient, id: string): Promise<CardRow | undefined> {
  const { data, error } = await client
    .from("cards")
    .select("id, user_id, front, back, generation_id, proposal_index, created_at")
    .eq("id", id);
  if (error) throw new Error(`select card failed: ${error.message}`);
  const rows = data as CardRow[];
  expect(rows.length).toBeLessThanOrEqual(1);
  return rows[0];
}

async function countersOf(client: SupabaseClient, generationId: string): Promise<Counters> {
  const { data, error } = await client
    .from("generations")
    .select("proposed_count, accepted_count")
    .eq("id", generationId);
  if (error) throw new Error(`select generation failed: ${error.message}`);
  const rows = data as Counters[];
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function cardSaveErrorOf(promise: Promise<unknown>): Promise<CardSaveError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(CardSaveError);
  return error as CardSaveError;
}

describe("updateCard — only the content changes (FR-010, FR-012)", () => {
  it("changes front and back and leaves generation_id, proposal_index, created_at and user_id alone", async () => {
    const { id } = await acceptedCard(a);
    const before = await rowOf(a, id);

    const card = await updateCard(a, id, { front: "Stolica Niemiec?", back: "Berlin" });

    expect(card).toEqual({ id, front: "Stolica Niemiec?", back: "Berlin", createdAt: card.createdAt });
    const after = await rowOf(a, id);
    expect(after).toEqual({ ...before, front: "Stolica Niemiec?", back: "Berlin" });
    expect(after?.generation_id).not.toBeNull();
  });

  it.each([
    { column: "generation_id", value: () => crypto.randomUUID() },
    { column: "proposal_index", value: () => 2 },
    { column: "created_at", value: () => "2000-01-01T00:00:00.000Z" },
    { column: "user_id", value: () => crypto.randomUUID() },
  ])(
    "an owner's direct update of $column is refused by the grant (42501), row unchanged",
    async ({ column, value }) => {
      const { id } = await acceptedCard(a);
      const before = await rowOf(a, id);

      const { data, error } = await a
        .from("cards")
        .update({ [column]: value() })
        .eq("id", id)
        .select("id");

      expect(data).toBeNull();
      expect(error?.code).toBe("42501");
      expect(await rowOf(a, id)).toEqual(before);
    },
  );

  it("a blank front sent past the endpoint's validation is card_blank from the CHECK, row unchanged", async () => {
    const { id } = await acceptedCard(a);
    const before = await rowOf(a, id);

    const error = await cardSaveErrorOf(updateCard(a, id, { front: "  \n", back: "Tył" }));

    expect(error.code).toBe("card_blank");
    expect(error.blankField).toBe("front");
    expect(await rowOf(a, id)).toEqual(before);
  });

  it("answers card_not_found for a uuid that does not exist", async () => {
    const error = await cardSaveErrorOf(updateCard(a, crypto.randomUUID(), { front: "Przód", back: "Tył" }));

    expect(error.code).toBe("card_not_found");
  });
});

describe("deleteCard — removes the card, not the counters (FR-012)", () => {
  it("deletes A's card and leaves accepted_count and proposed_count of its generation unchanged", async () => {
    const { id, generationId } = await acceptedCard(a);
    const countersBefore = await countersOf(a, generationId);
    expect(countersBefore).toEqual({ proposed_count: 3, accepted_count: 1 });

    await deleteCard(a, id);

    expect(await rowOf(a, id)).toBeUndefined();
    expect(await countersOf(a, generationId)).toEqual(countersBefore);
  });

  it("answers card_not_found for a uuid that does not exist", async () => {
    const error = await cardSaveErrorOf(deleteCard(a, crypto.randomUUID()));

    expect(error.code).toBe("card_not_found");
  });
});

describe("another account cannot edit or delete A's card (risk #3)", () => {
  it("updateCard as B on A's card is card_not_found and A's card is unchanged", async () => {
    const { id } = await acceptedCard(a);
    const before = await rowOf(a, id);

    const error = await cardSaveErrorOf(updateCard(b, id, { front: "Zmienione przez B", back: "B" }));

    expect(error.code).toBe("card_not_found");
    expect(await rowOf(a, id)).toEqual(before);
  });

  it("deleteCard as B on A's card is card_not_found and A's card is still there", async () => {
    const { id } = await acceptedCard(a);
    const before = await rowOf(a, id);

    const error = await cardSaveErrorOf(deleteCard(b, id));

    expect(error.code).toBe("card_not_found");
    expect(await rowOf(a, id)).toEqual(before);
  });
});

describe("listCards — the owner's cards, newest first", () => {
  it("returns only the owner's cards, from the newest", async () => {
    const owner = await signUp("manage-list");
    const first = await acceptedCard(owner, "Pierwsza", "1");
    const second = await acceptedCard(owner, "Druga", "2");
    const third = await acceptedCard(owner, "Trzecia", "3");
    const foreign = await acceptedCard(b, "Cudza", "B");

    const cards = await listCards(owner);

    expect(cards.map((card) => card.id)).toEqual([third.id, second.id, first.id]);
    expect(cards.map((card) => card.front)).toEqual(["Trzecia", "Druga", "Pierwsza"]);
    expect(cards.map((card) => card.id)).not.toContain(foreign.id);
  });
});
