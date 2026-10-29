import type { APIContext, APIRoute } from "astro";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api-response";
import { AUTH_UNAVAILABLE_MESSAGE } from "@/lib/auth-session";
import {
  CARD_BACK_BLANK_MESSAGE,
  CARD_FRONT_BLANK_MESSAGE,
  isBlankCardText,
  MAX_CARD_TEXT_LENGTH,
} from "@/lib/card-content";
import { CardSaveError, deleteCard, updateCard } from "@/lib/services/cards";
import { createClient } from "@/lib/supabase";
import type { UpdateCardRequest, UpdateCardResponse } from "@/types";

// PATCH /api/cards/[id]: edit a saved card's content; DELETE /api/cards/[id]: delete it (FR-010).
// The owner always comes from the session (RLS on cards), never from the body; a card that is missing or
// belongs to someone else is the same 404. Privacy: front/back are never logged; logs carry only our code
// and the database error code.

const idSchema = z.uuid();

// Only front and back: any other field (generation_id, user_id, …) is rejected, not ignored.
const updateSchema = z
  .object({
    front: z.string().max(MAX_CARD_TEXT_LENGTH),
    back: z.string().max(MAX_CARD_TEXT_LENGTH),
  })
  .strict() satisfies z.ZodType<UpdateCardRequest>;

const INVALID_REQUEST_MESSAGE = "Nieprawidłowe żądanie.";
const TOO_LONG_MESSAGE = `Przód i tył fiszki mogą mieć najwyżej ${MAX_CARD_TEXT_LENGTH} znaków.`;
const NOT_FOUND_MESSAGE = "Tej fiszki już nie ma. Mogła zostać usunięta w innej karcie.";
const NOT_SAVED_MESSAGE = "Nie udało się zapisać fiszki. Spróbuj ponownie.";
const NOT_DELETED_MESSAGE = "Nie udało się usunąć fiszki. Spróbuj ponownie.";

function blankMessage(field: "front" | "back"): string {
  return field === "front" ? CARD_FRONT_BLANK_MESSAGE : CARD_BACK_BLANK_MESSAGE;
}

function notSaved(code: string, cause: string | undefined): Response {
  // eslint-disable-next-line no-console
  console.error("cards: update failed", { code, cause });
  return jsonError(500, "card_not_saved", NOT_SAVED_MESSAGE);
}

function notDeleted(code: string, cause: string | undefined): Response {
  // eslint-disable-next-line no-console
  console.error("cards: delete failed", { code, cause });
  return jsonError(500, "card_not_deleted", NOT_DELETED_MESSAGE);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** Same order as POST /api/cards: auth outage (503), then session (401), then the id. Returns the id or a response. */
function checkRequest(context: APIContext): string | Response {
  if (context.locals.authUnavailable) {
    return jsonError(503, "auth_unavailable", AUTH_UNAVAILABLE_MESSAGE);
  }
  if (!context.locals.user) {
    return jsonError(401, "unauthorized", "Zaloguj się, aby zarządzać fiszkami.");
  }
  const id = idSchema.safeParse(context.params.id);
  if (!id.success) return jsonError(400, "invalid_request", INVALID_REQUEST_MESSAGE);
  return id.data;
}

export const PATCH: APIRoute = async (context) => {
  const id = checkRequest(context);
  if (id instanceof Response) return id;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError(400, "invalid_request", INVALID_REQUEST_MESSAGE);
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    // Only a body whose sole problem is length gets the limit message; anything else is a malformed request.
    const onlyTooLong = parsed.error.issues.every((issue) => issue.code === "too_big");
    return jsonError(400, "invalid_request", onlyTooLong ? TOO_LONG_MESSAGE : INVALID_REQUEST_MESSAGE);
  }

  const content = parsed.data;
  if (isBlankCardText(content.front)) return jsonError(400, "card_blank", blankMessage("front"));
  if (isBlankCardText(content.back)) return jsonError(400, "card_blank", blankMessage("back"));

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return notSaved("card_not_saved", "supabase_not_configured");

  try {
    const card = await updateCard(supabase, id, { front: content.front, back: content.back });
    const response: UpdateCardResponse = { card };
    return jsonOk(response);
  } catch (error) {
    if (!(error instanceof CardSaveError)) return notSaved("card_not_saved", errorName(error));
    switch (error.code) {
      case "card_not_found":
        return jsonError(404, "card_not_found", NOT_FOUND_MESSAGE);
      case "card_blank":
        return jsonError(400, "card_blank", blankMessage(error.blankField ?? "front"));
      default:
        return notSaved(error.code, error.cause);
    }
  }
};

export const DELETE: APIRoute = async (context) => {
  const id = checkRequest(context);
  if (id instanceof Response) return id;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return notDeleted("card_not_deleted", "supabase_not_configured");

  try {
    await deleteCard(supabase, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (!(error instanceof CardSaveError)) return notDeleted("card_not_deleted", errorName(error));
    if (error.code === "card_not_found") return jsonError(404, "card_not_found", NOT_FOUND_MESSAGE);
    return notDeleted(error.code, error.cause);
  }
};
