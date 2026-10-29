// PATCH and DELETE /api/cards/[id], called directly with a fake APIContext and a stubbed Supabase client.
// Oracle: endpoint contract in context/changes/manage-saved-cards/plan.md (Faza 1: check order, 2000-character limit,
// only front/back written, 404 for a missing card, status per SQLSTATE, no card content in logs), PRD FR-010,
// lessons.md (session → 401 JSON). Not the implementation.
// Risks: test-plan.md §2 #3 (isolation: the owner comes from the session) and #5 (privacy of content in logs).

import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "@/pages/api/cards/[id]";
import type { ApiError, UpdateCardResponse } from "@/types";
import { apiContext, SIGNED_IN_USER } from "../helpers/api-context";

interface DbResult {
  data: unknown;
  error: { code: string; message: string; details?: string } | null;
}

interface DbCall {
  table: string;
  op: "update" | "delete";
  values?: unknown;
  eq: [string, unknown][];
  select?: string;
}

const CARD_ID = "22222222-2222-4222-8222-222222222222";
const CARD_ROW = { id: CARD_ID, front: "Stolica Polski?", back: "Warszawa", created_at: "2026-10-26T12:00:00.000Z" };

// `configured: false` makes createClient return null; `result` is what the next update/delete chain resolves to.
const db = vi.hoisted((): { configured: boolean; result: DbResult; calls: DbCall[] } => ({
  configured: true,
  result: { data: null, error: null },
  calls: [],
}));
vi.mock("@/lib/supabase", () => ({
  createClient: () => {
    if (!db.configured) return null;
    const chain = (call: DbCall) => ({
      eq: (column: string, value: unknown) => {
        call.eq.push([column, value]);
        return {
          select: (columns: string) => {
            call.select = columns;
            return Promise.resolve(db.result);
          },
        };
      },
    });
    return {
      from: (table: string) => ({
        update: (values: unknown) => {
          const call: DbCall = { table, op: "update", values, eq: [] };
          db.calls.push(call);
          return chain(call);
        },
        delete: () => {
          const call: DbCall = { table, op: "delete", eq: [] };
          db.calls.push(call);
          return chain(call);
        },
      }),
    };
  },
}));

afterEach(() => {
  db.configured = true;
  db.result = { data: null, error: null };
  db.calls = [];
  vi.restoreAllMocks();
});

const MARKER = "ZNACZNIK-TRESCI-FISZKI";
const VALID = { front: "Stolica Niemiec?", back: "Berlin" };

interface CallOptions {
  id?: string | undefined;
  user?: typeof SIGNED_IN_USER | null;
  authUnavailable?: boolean;
}

function context(method: string, body: unknown, options: CallOptions = {}) {
  const id = "id" in options ? options.id : CARD_ID;
  return apiContext({
    user: options.user === undefined ? SIGNED_IN_USER : options.user,
    authUnavailable: options.authUnavailable,
    body,
    url: `http://localhost/api/cards/${id ?? ""}`,
    method,
    params: { id },
  });
}

function patch(body: unknown, options: CallOptions = {}) {
  return PATCH(context("PATCH", body, options));
}

function del(options: CallOptions = {}) {
  return DELETE(context("DELETE", undefined, options));
}

/** PostgREST error for a CHECK violation, with the failing row (the card content) in `details`, like the real one. */
function checkViolation(constraint: string, relation = "cards") {
  return {
    code: "23514",
    message: `new row for relation "${relation}" violates check constraint "${constraint}"`,
    details: `Failing row contains (${MARKER}, ${MARKER}).`,
  };
}

const LOG_METHODS = ["log", "info", "warn", "error", "debug"] as const;

function spyOnLogs() {
  return LOG_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
}

function loggedLines(spies: ReturnType<typeof spyOnLogs>): string[] {
  return spies.flatMap((spy): unknown[] => spy.mock.calls.flat()).map((arg) => inspect(arg, { depth: 10 }));
}

describe.each([
  { method: "PATCH", call: (options: CallOptions) => patch(VALID, options) },
  { method: "DELETE", call: (options: CallOptions) => del(options) },
])("$method /api/cards/[id] — session and id (lessons: 401 JSON)", ({ call }) => {
  it("answers 503 auth_unavailable during an auth outage and never calls the database", async () => {
    const response = await call({ user: null, authUnavailable: true });
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("auth_unavailable");
    expect(body.error.message.trim()).not.toBe("");
    expect(db.calls).toEqual([]);
  });

  it("rejects an anonymous request with 401 and never calls the database", async () => {
    const response = await call({ user: null });
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toBe("Zaloguj się, aby zarządzać fiszkami.");
    expect(db.calls).toEqual([]);
  });

  it.each([
    { name: "a non-uuid id", id: "abc" },
    { name: "a numeric id", id: "1" },
    { name: "a missing id", id: undefined },
  ])("rejects $name with 400 invalid_request and never calls the database", async ({ id }) => {
    const response = await call({ id });
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
    expect(db.calls).toEqual([]);
  });
});

describe("PATCH /api/cards/[id] — request validation", () => {
  it.each([
    { name: "an extra generation_id", body: { ...VALID, generation_id: "11111111-1111-4111-8111-111111111111" } },
    { name: "an extra proposal_index", body: { ...VALID, proposal_index: 0 } },
    { name: "an extra user_id", body: { ...VALID, user_id: "33333333-3333-4333-8333-333333333333" } },
    { name: "missing back", body: { front: "Przód" } },
    { name: "front that is not a string", body: { ...VALID, front: 1 } },
    { name: "a body that is not an object", body: ["Przód", "Tył"] },
  ])("rejects $name with 400 invalid_request and never calls the database", async ({ body }) => {
    const response = await patch(body);
    const error = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(error.error.code).toBe("invalid_request");
    expect(error.error.message).toBe("Nieprawidłowe żądanie.");
    expect(db.calls).toEqual([]);
  });

  it("rejects a body that is not JSON with 400 invalid_request", async () => {
    const response = await PATCH(
      apiContext({
        user: SIGNED_IN_USER,
        rawBody: `{"front": "${MARKER}`,
        url: `http://localhost/api/cards/${CARD_ID}`,
        method: "PATCH",
        params: { id: CARD_ID },
      }),
    );
    const error = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(error.error.code).toBe("invalid_request");
    expect(error.error.message).not.toContain(MARKER);
    expect(db.calls).toEqual([]);
  });

  // 2000 characters counted as String.prototype.length; literal on purpose (plan contract).
  it.each([
    { name: "front of 2001 characters", body: { front: "a".repeat(2001), back: "Tył" } },
    { name: "back of 2001 characters", body: { front: "Przód", back: "b".repeat(2001) } },
  ])("rejects $name with 400 invalid_request and the limit message, never calling the database", async ({ body }) => {
    const response = await patch(body);
    const error = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(error.error.code).toBe("invalid_request");
    expect(error.error.message).toBe("Przód i tył fiszki mogą mieć najwyżej 2000 znaków.");
    expect(db.calls).toEqual([]);
  });

  it("accepts front and back of exactly 2000 characters", async () => {
    const body = { front: "a".repeat(2000), back: "b".repeat(2000) };
    db.result = { data: [{ ...CARD_ROW, ...body }], error: null };

    const response = await patch(body);

    expect(response.status).toBe(200);
    expect(db.calls).toHaveLength(1);
  });

  it.each([
    { name: "empty front", front: "", back: "Tył" },
    { name: "spaces-only front", front: "   ", back: "Tył" },
    { name: "newline-and-tab back", front: "Przód", back: "\n\t" },
  ])("rejects $name with 400 card_blank and never calls the database", async ({ front, back }) => {
    const response = await patch({ front, back });
    const error = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(error.error.code).toBe("card_blank");
    expect(error.error.message.trim()).not.toBe("");
    expect(db.calls).toEqual([]);
  });
});

describe("PATCH /api/cards/[id] — saving", () => {
  it("answers 200 with the updated card and writes exactly { front, back } to that id", async () => {
    db.result = { data: [{ ...CARD_ROW, ...VALID }], error: null };

    const response = await patch(VALID);
    const body = (await response.json()) as UpdateCardResponse;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      card: { id: CARD_ID, front: VALID.front, back: VALID.back, createdAt: CARD_ROW.created_at },
    });
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].table).toBe("cards");
    expect(db.calls[0].op).toBe("update");
    expect(db.calls[0].values).toStrictEqual({ front: VALID.front, back: VALID.back });
    expect(db.calls[0].eq).toEqual([["id", CARD_ID]]);
  });

  it("answers 404 card_not_found when no row was updated (missing or someone else's card)", async () => {
    db.result = { data: [], error: null };

    const response = await patch(VALID);
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("card_not_found");
    expect(body.error.message).toBe("Tej fiszki już nie ma. Mogła zostać usunięta w innej karcie.");
  });

  it.each([
    { name: "cards_front_not_blank", constraint: "cards_front_not_blank" },
    { name: "cards_back_not_blank", constraint: "cards_back_not_blank" },
  ])("23514 $name from the database → 400 card_blank", async ({ constraint }) => {
    db.result = { data: null, error: checkViolation(constraint) };

    const response = await patch(VALID);
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("card_blank");
    expect(body.error.message.trim()).not.toBe("");
  });

  it.each([
    { name: "another 23514 (cards_proposal_index_range)", error: checkViolation("cards_proposal_index_range") },
    { name: "42501 column privilege", error: { code: "42501", message: "permission denied for table cards" } },
    { name: "an unknown database error", error: { code: "08006", message: "connection failure" } },
  ])("$name → 500 card_not_saved, logged with its code", async ({ error }) => {
    db.result = { data: null, error };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await patch(VALID);
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("card_not_saved");
    expect(body.error.message).toBe("Nie udało się zapisać fiszki. Spróbuj ponownie.");
    expect(errorSpy).toHaveBeenCalled();
    expect(inspect(errorSpy.mock.calls, { depth: 10 })).toContain("cards: update failed");
    expect(inspect(errorSpy.mock.calls, { depth: 10 })).toContain(error.code);
  });

  it("answers 500 card_not_saved and logs it when Supabase is not configured", async () => {
    db.configured = false;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await patch(VALID);
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("card_not_saved");
    expect(errorSpy).toHaveBeenCalled();
  });

  it.each([
    { name: "500 card_not_saved", error: checkViolation("cards_proposal_index_range"), logs: true },
    { name: "400 card_blank from the database", error: checkViolation("cards_back_not_blank") },
  ])("$name: the card content is in no log line and no response (risk #5)", async ({ error, logs }) => {
    db.result = { data: null, error };
    const spies = spyOnLogs();

    const response = await patch({ front: `${MARKER} przód`, back: `${MARKER} tył` });
    const responseText = await response.text();

    const logged = loggedLines(spies);
    // The 500 branch does log: prove the spy saw that line, so "no marker" is not vacuous.
    if (logs) expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) expect(line).not.toContain(MARKER);
    expect(responseText).not.toContain(MARKER);
  });
});

describe("DELETE /api/cards/[id]", () => {
  it("answers 204 with no body when the card was deleted", async () => {
    db.result = { data: [{ id: CARD_ID }], error: null };

    const response = await del();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]).toMatchObject({ table: "cards", op: "delete", eq: [["id", CARD_ID]] });
  });

  it("answers 404 card_not_found when no row was deleted", async () => {
    db.result = { data: [], error: null };

    const response = await del();
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("card_not_found");
    expect(body.error.message).toBe("Tej fiszki już nie ma. Mogła zostać usunięta w innej karcie.");
  });

  it.each([
    { name: "a database error", setup: () => (db.result = { data: null, error: { code: "08006", message: "x" } }) },
    { name: "Supabase is not configured", setup: () => (db.configured = false) },
  ])("answers 500 card_not_deleted and logs it on $name", async ({ setup }) => {
    setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await del();
    const body = (await response.json()) as ApiError;

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("card_not_deleted");
    expect(body.error.message).toBe("Nie udało się usunąć fiszki. Spróbuj ponownie.");
    expect(errorSpy).toHaveBeenCalled();
    expect(inspect(errorSpy.mock.calls, { depth: 10 })).toContain("cards: delete failed");
  });

  it("logs the database error code and no card content", async () => {
    db.result = { data: null, error: { code: "08006", message: `connection failure ${MARKER}`, details: MARKER } };
    const spies = spyOnLogs();

    await del();

    const logged = loggedLines(spies);
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join("\n")).toContain("08006");
    for (const line of logged) expect(line).not.toContain(MARKER);
  });
});
