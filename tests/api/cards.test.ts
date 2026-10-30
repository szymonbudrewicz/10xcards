// POST /api/cards, called directly with a fake APIContext and a stubbed Supabase client.
// Oracle: endpoint contract in context/changes/accept-and-save-cards/plan.md (Faza 2: check order, status per
// SQLSTATE, 201 vs 200, no card content in logs), PRD FR-005, lessons.md (session → 401 JSON). Not the implementation.
// Risks: test-plan.md §2 #1 (accepted cards never get lost) and #5 (privacy of content in logs).

import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/pages/api/cards";
import type { AcceptProposalResponse, ApiError } from "@/types";
import { apiContext, SIGNED_IN_USER } from "../helpers/api-context";

interface RpcResult {
  data: unknown;
  error: { code: string; message: string; details?: string } | null;
}

const CARD_ROW = {
  id: "22222222-2222-4222-8222-222222222222",
  front: "Stolica Polski?",
  back: "Warszawa",
  created_at: "2026-10-26T12:00:00.000Z",
};

// `configured: false` makes createClient return null; `rpcResult` is what the next rpc() call resolves to.
const db = vi.hoisted((): { configured: boolean; rpcResult: RpcResult; rpcCalls: [string, unknown][] } => ({
  configured: true,
  rpcResult: { data: null, error: null },
  rpcCalls: [],
}));
vi.mock("@/lib/supabase", () => ({
  createClient: () =>
    db.configured
      ? {
          rpc: (fn: string, args: unknown) => {
            db.rpcCalls.push([fn, args]);
            return Promise.resolve(db.rpcResult);
          },
        }
      : null,
}));

afterEach(() => {
  db.configured = true;
  db.rpcResult = { data: null, error: null };
  db.rpcCalls = [];
  vi.restoreAllMocks();
});

const CARDS_URL = "http://localhost/api/cards";
const GENERATION_ID = "11111111-1111-4111-8111-111111111111";
const MARKER = "ZNACZNIK-TRESCI-FISZKI";
const VALID = { generationId: GENERATION_ID, proposalIndex: 0, front: "Stolica Polski?", back: "Warszawa" };

function post(body: unknown, options: { user?: typeof SIGNED_IN_USER | null; authUnavailable?: boolean } = {}) {
  return POST(
    apiContext({
      user: options.user === undefined ? SIGNED_IN_USER : options.user,
      authUnavailable: options.authUnavailable,
      body,
      url: CARDS_URL,
    }),
  );
}

/** PostgREST error for a CHECK violation, with the failing row (the card content) in `details`, like the real one. */
function checkViolation(constraint: string, relation = "cards") {
  return {
    code: "23514",
    message: `new row for relation "${relation}" violates check constraint "${constraint}"`,
    details: `Failing row contains (${MARKER}, ${MARKER}).`,
  };
}

describe("POST /api/cards — session (lessons: 401 JSON, audit G1)", () => {
  it("answers 503 auth_unavailable during an auth outage and never calls the database", async () => {
    const response = await post(VALID, { user: null, authUnavailable: true });
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("auth_unavailable");
    expect(body.error.message.trim()).not.toBe("");
    expect(db.rpcCalls).toEqual([]);
  });

  it("rejects an anonymous request with 401 and never calls the database", async () => {
    const response = await post(VALID, { user: null });
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message.trim()).not.toBe("");
    expect(db.rpcCalls).toEqual([]);
  });
});

describe("POST /api/cards — request validation", () => {
  it.each([
    { name: "missing generationId", body: { ...VALID, generationId: undefined } },
    { name: "generationId that is not a uuid", body: { ...VALID, generationId: "abc" } },
    { name: "negative proposalIndex", body: { ...VALID, proposalIndex: -1 } },
    { name: "fractional proposalIndex", body: { ...VALID, proposalIndex: 1.5 } },
    { name: "proposalIndex as a string", body: { ...VALID, proposalIndex: "0" } },
    // Upper bound from the cards CHECK (proposal_index between 0 and 9) and MAX_PROPOSALS = 10. Literal on purpose.
    { name: "proposalIndex 10 (above the last possible proposal)", body: { ...VALID, proposalIndex: 10 } },
    { name: "proposalIndex beyond smallint (40000)", body: { ...VALID, proposalIndex: 40000 } },
    { name: "front that is not a string", body: { ...VALID, front: 1 } },
    { name: "missing back", body: { ...VALID, back: undefined } },
  ])("rejects $name with 400 invalid_request and never calls the database", async ({ body }) => {
    const response = await post(body);
    const error = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(error.error.code).toBe("invalid_request");
    expect(db.rpcCalls).toEqual([]);
  });

  it("rejects a body that is not JSON with 400 invalid_request", async () => {
    const response = await POST(apiContext({ user: SIGNED_IN_USER, rawBody: `{"front": "${MARKER}`, url: CARDS_URL }));
    const error = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(error.error.code).toBe("invalid_request");
    expect(error.error.message).not.toContain(MARKER);
    expect(db.rpcCalls).toEqual([]);
  });

  it.each([
    { name: "empty front", front: "", back: "Tył" },
    { name: "spaces-only front", front: "   ", back: "Tył" },
    { name: "empty back", front: "Przód", back: "" },
    { name: "newline-and-tab back", front: "Przód", back: "\n\t" },
  ])("rejects $name with 400 card_blank and never calls the database", async ({ front, back }) => {
    const response = await post({ ...VALID, front, back });
    const error = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(error.error.code).toBe("card_blank");
    expect(error.error.message.trim()).not.toBe("");
    expect(db.rpcCalls).toEqual([]);
  });
});

describe("POST /api/cards — saving (risk #1)", () => {
  it("answers 201 with the saved card for a new card, passing the proposal to accept_proposal", async () => {
    db.rpcResult = { data: [{ ...CARD_ROW, created: true }], error: null };

    const response = await post({ ...VALID, proposalIndex: 2 });
    const body = (await response.json()) as AcceptProposalResponse;

    expect(response.status).toBe(201);
    expect(body).toEqual({
      card: { id: CARD_ROW.id, front: CARD_ROW.front, back: CARD_ROW.back, createdAt: CARD_ROW.created_at },
      created: true,
    });
    expect(db.rpcCalls).toEqual([
      [
        "accept_proposal",
        { p_generation_id: GENERATION_ID, p_proposal_index: 2, p_front: VALID.front, p_back: VALID.back },
      ],
    ]);
  });

  it("answers 200 with the existing card when the proposal was already saved", async () => {
    db.rpcResult = { data: [{ ...CARD_ROW, created: false }], error: null };

    const response = await post({ ...VALID, front: "Inna treść" });
    const body = (await response.json()) as AcceptProposalResponse;

    expect(response.status).toBe(200);
    expect(body.created).toBe(false);
    expect(body.card.front).toBe(CARD_ROW.front);
  });

  it("never takes the owner from the body", async () => {
    db.rpcResult = { data: [{ ...CARD_ROW, created: true }], error: null };

    await post({ ...VALID, userId: "33333333-3333-4333-8333-333333333333", user_id: "x" });

    expect(inspect(db.rpcCalls)).not.toContain("33333333");
    expect(inspect(db.rpcCalls)).not.toContain("user_id");
  });
});

describe("POST /api/cards — database errors are mapped by SQLSTATE", () => {
  it.each([
    {
      name: "P0002 generation not found",
      error: { code: "P0002", message: "generation not found" },
      status: 404,
      code: "generation_not_found",
    },
    {
      name: "22023 index out of range",
      error: { code: "22023", message: "proposal index out of range" },
      status: 400,
      code: "proposal_out_of_range",
    },
    {
      name: "23514 cards_front_not_blank",
      error: checkViolation("cards_front_not_blank"),
      status: 400,
      code: "card_blank",
    },
    {
      name: "23514 cards_back_not_blank",
      error: checkViolation("cards_back_not_blank"),
      status: 400,
      code: "card_blank",
    },
  ])("$name → $status $code", async ({ error, status, code }) => {
    db.rpcResult = { data: null, error };

    const response = await post(VALID);
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(status);
    expect(body.error.code).toBe(code);
    expect(body.error.message.trim()).not.toBe("");
  });

  it.each([
    {
      name: "23514 generations_accepted_count_range",
      error: checkViolation("generations_accepted_count_range", "generations"),
    },
    { name: "42501 no session in the function", error: { code: "42501", message: "not authenticated" } },
    { name: "P0001 internal inconsistency", error: { code: "P0001", message: "accepted card not found" } },
    { name: "an unknown database error", error: { code: "08006", message: "connection failure" } },
  ])("$name → 500 card_not_saved, logged with its code", async ({ error }) => {
    db.rpcResult = { data: null, error };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await post(VALID);
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("card_not_saved");
    expect(body.error.message.trim()).not.toBe("");
    expect(errorSpy).toHaveBeenCalled();
    expect(inspect(errorSpy.mock.calls, { depth: 10 })).toContain(error.code);
  });

  it.each([
    { name: "Supabase is not configured", setup: () => (db.configured = false) },
    { name: "an empty result", setup: () => (db.rpcResult = { data: [], error: null }) },
  ])("answers 500 card_not_saved and logs it when $name", async ({ setup }) => {
    setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await post(VALID);
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("card_not_saved");
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("POST /api/cards — card content stays out of logs and error messages (risk #5)", () => {
  const LOG_METHODS = ["log", "info", "warn", "error", "debug"] as const;

  it.each([
    {
      name: "500 card_not_saved",
      error: checkViolation("generations_accepted_count_range", "generations"),
      logs: true,
    },
    { name: "400 card_blank from the database", error: checkViolation("cards_back_not_blank") },
    { name: "404 generation_not_found", error: { code: "P0002", message: "generation not found" } },
  ])("$name: the card content is in no log line and no error message", async ({ error, logs }) => {
    db.rpcResult = { data: null, error };
    const spies = LOG_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));

    const response = await post({ ...VALID, front: `${MARKER} przód`, back: `${MARKER} tył` });
    const responseText = await response.text();

    const logged = spies.flatMap((spy): unknown[] => spy.mock.calls.flat()).map((arg) => inspect(arg, { depth: 10 }));
    // The 500 branch does log: prove the spy saw that line, so "no marker" is not vacuous.
    if (logs) expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) expect(line).not.toContain(MARKER);
    expect(responseText).not.toContain(MARKER);
  });
});
