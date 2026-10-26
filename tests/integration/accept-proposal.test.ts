// public.accept_proposal() against a local Supabase, every case checked by reading cards and generations back.
// Oracle: decisions in context/changes/accept-and-save-cards/plan.md (Faza 1: one card per proposal, first content
// wins, accepted never exceeds proposed, "not found" for a foreign generation, SQLSTATEs) + PRD FR-012.
// Not the implementation. Risks: test-plan.md §2 #1 (accepted cards never get lost or duplicated) and #3 (isolation).
// Needs SUPABASE_URL/SUPABASE_KEY from `npx supabase status -o env` (API_URL, ANON_KEY) and email confirmation
// disabled. Creates throwaway accounts, so it refuses any non-loopback host and never reads .dev.vars.

import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];

function localSupabase(): { url: string; key: string } {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!rawUrl || !key)
    throw new Error("SUPABASE_URL and SUPABASE_KEY must be set in the environment (local Supabase only).");
  if (/\s/.test(key)) throw new Error("SUPABASE_KEY must be a single key without whitespace.");
  const parsed = new URL(rawUrl);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("SUPABASE_URL must start with http:// or https://.");
  if (!LOOPBACK_HOSTS.includes(parsed.hostname)) {
    throw new Error(
      `refusing to run against host "${parsed.hostname}": these tests create accounts (local Supabase only).`,
    );
  }
  return { url: parsed.origin, key };
}

const { url, key } = localSupabase();

interface AcceptedCard {
  id: string;
  front: string;
  back: string;
  created_at: string;
  created: boolean;
}

interface GenerationState {
  proposedCount: number;
  acceptedCount: number;
  cards: { front: string; back: string; proposal_index: number }[];
}

async function signUp(label: string): Promise<SupabaseClient> {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signUp({
    email: `accept-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`,
    password: `Acc-${crypto.randomUUID()}`,
  });
  if (error || !data.session) {
    throw new Error(
      `sign up as ${label} returned no session (${error?.message ?? "no error"}); is email confirmation disabled?`,
    );
  }
  return client;
}

async function newGeneration(client: SupabaseClient, proposedCount: number): Promise<string> {
  const { data, error } = await client
    .from("generations")
    .insert({ proposed_count: proposedCount })
    .select("id")
    .single();
  if (error) throw new Error(`insert generation failed: ${error.message}`);
  const id: unknown = data.id;
  if (typeof id !== "string") throw new Error("insert generation returned no id");
  return id;
}

// No generated Database types in this project, so the RPC result is typed here.
async function accept(
  client: SupabaseClient,
  generationId: string,
  proposalIndex: number,
  front: string,
  back: string,
): Promise<{ data: AcceptedCard[] | null; error: PostgrestError | null }> {
  const result = await client.rpc("accept_proposal", {
    p_generation_id: generationId,
    p_proposal_index: proposalIndex,
    p_front: front,
    p_back: back,
  });
  return { data: result.data as AcceptedCard[] | null, error: result.error };
}

async function acceptOk(
  client: SupabaseClient,
  generationId: string,
  proposalIndex: number,
  front: string,
  back: string,
): Promise<AcceptedCard> {
  const { data, error } = await accept(client, generationId, proposalIndex, front, back);
  if (error) throw new Error(`accept_proposal failed: ${error.code} ${error.message}`);
  const rows = data ?? [];
  expect(rows).toHaveLength(1);
  return rows[0];
}

// Reads what the owner sees in the database: the generation's counters and the cards linked to it.
async function stateOf(client: SupabaseClient, generationId: string): Promise<GenerationState> {
  const generation = await client.from("generations").select("proposed_count, accepted_count").eq("id", generationId);
  if (generation.error) throw new Error(`select generation failed: ${generation.error.message}`);
  const rows = generation.data as { proposed_count: number; accepted_count: number }[];
  expect(rows).toHaveLength(1);
  const cards = await client
    .from("cards")
    .select("front, back, proposal_index")
    .eq("generation_id", generationId)
    .order("proposal_index");
  if (cards.error) throw new Error(`select cards failed: ${cards.error.message}`);
  return {
    proposedCount: rows[0].proposed_count,
    acceptedCount: rows[0].accepted_count,
    cards: cards.data,
  };
}

async function allCardsOf(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.from("cards").select("id");
  if (error) throw new Error(`select cards failed: ${error.message}`);
  return data.length;
}

let a: SupabaseClient;
let b: SupabaseClient;

beforeAll(async () => {
  a = await signUp("a");
  b = await signUp("b");
});

describe("accept_proposal — saving a proposal (risk #1)", () => {
  it("saves one card with the given content and counts one acceptance", async () => {
    const generationId = await newGeneration(a, 3);

    const card = await acceptOk(a, generationId, 0, "Stolica Polski?", "Warszawa");

    expect(card.created).toBe(true);
    expect(card).toMatchObject({ front: "Stolica Polski?", back: "Warszawa" });
    expect(await stateOf(a, generationId)).toEqual({
      proposedCount: 3,
      acceptedCount: 1,
      cards: [{ front: "Stolica Polski?", back: "Warszawa", proposal_index: 0 }],
    });
  });

  it("saving the same proposal twice keeps one card with the first content and counts it once", async () => {
    const generationId = await newGeneration(a, 3);

    const first = await acceptOk(a, generationId, 1, "Pierwsza wersja", "Odpowiedź 1");
    const second = await acceptOk(a, generationId, 1, "Druga wersja", "Odpowiedź 2");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second).toMatchObject({ id: first.id, front: "Pierwsza wersja", back: "Odpowiedź 1" });
    expect(await stateOf(a, generationId)).toEqual({
      proposedCount: 3,
      acceptedCount: 1,
      cards: [{ front: "Pierwsza wersja", back: "Odpowiedź 1", proposal_index: 1 }],
    });
  });

  it("two different proposals give two cards and two acceptances", async () => {
    const generationId = await newGeneration(a, 3);

    await acceptOk(a, generationId, 0, "Przód 0", "Tył 0");
    await acceptOk(a, generationId, 2, "Przód 2", "Tył 2");

    expect(await stateOf(a, generationId)).toEqual({
      proposedCount: 3,
      acceptedCount: 2,
      cards: [
        { front: "Przód 0", back: "Tył 0", proposal_index: 0 },
        { front: "Przód 2", back: "Tył 2", proposal_index: 2 },
      ],
    });
  });

  it("accepting every proposal ends at accepted = proposed", async () => {
    const generationId = await newGeneration(a, 4);

    for (const index of [0, 1, 2, 3]) {
      await acceptOk(a, generationId, index, `Przód ${index}`, `Tył ${index}`);
    }
    // A repeat after the ceiling changes nothing.
    await acceptOk(a, generationId, 3, "Powtórka", "Powtórka");

    const state = await stateOf(a, generationId);
    expect(state.acceptedCount).toBe(4);
    expect(state.acceptedCount).toBe(state.proposedCount);
    expect(state.cards.map((card) => card.proposal_index)).toEqual([0, 1, 2, 3]);
  });
});

describe("accept_proposal — rejected calls leave the database unchanged", () => {
  it.each([
    { name: "index equal to proposed_count", index: 3 },
    { name: "negative index", index: -1 },
  ])("rejects $name as out of range (22023)", async ({ index }) => {
    const generationId = await newGeneration(a, 3);

    const { data, error } = await accept(a, generationId, index, "Przód", "Tył");

    expect(data).toBeNull();
    expect(error?.code).toBe("22023");
    expect(await stateOf(a, generationId)).toEqual({ proposedCount: 3, acceptedCount: 0, cards: [] });
  });

  it.each([
    { name: "spaces-only front", front: "   ", back: "Tył" },
    { name: "newline-and-tab back", front: "Przód", back: "\n\t" },
  ])("rejects $name with a CHECK violation (23514)", async ({ front, back }) => {
    const generationId = await newGeneration(a, 3);

    const { data, error } = await accept(a, generationId, 0, front, back);

    expect(data).toBeNull();
    expect(error?.code).toBe("23514");
    expect(await stateOf(a, generationId)).toEqual({ proposedCount: 3, acceptedCount: 0, cards: [] });
  });

  it("answers 'not found' (P0002) for someone else's generation and changes neither account (risk #3)", async () => {
    const generationId = await newGeneration(a, 3);
    const bCardsBefore = await allCardsOf(b);

    const { data, error } = await accept(b, generationId, 0, "Przód B", "Tył B");

    expect(data).toBeNull();
    expect(error?.code).toBe("P0002");
    expect(await stateOf(a, generationId)).toEqual({ proposedCount: 3, acceptedCount: 0, cards: [] });
    expect(await allCardsOf(b)).toBe(bCardsBefore);
  });

  it("answers the same 'not found' (P0002) for a generation that does not exist", async () => {
    const aCardsBefore = await allCardsOf(a);

    const { data, error } = await accept(a, crypto.randomUUID(), 0, "Przód", "Tył");

    expect(data).toBeNull();
    expect(error?.code).toBe("P0002");
    expect(await allCardsOf(a)).toBe(aCardsBefore);
  });
});
