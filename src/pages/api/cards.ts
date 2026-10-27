import type { APIRoute } from "astro";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api-response";
import { AUTH_UNAVAILABLE_MESSAGE } from "@/lib/auth-session";
import { CARD_BACK_BLANK_MESSAGE, CARD_FRONT_BLANK_MESSAGE, isBlankCardText } from "@/lib/card-content";
import { acceptProposal, CardSaveError } from "@/lib/services/cards";
import { createClient } from "@/lib/supabase";
import { MAX_PROPOSALS, type AcceptProposalRequest } from "@/types";

// POST /api/cards: save one accepted proposal (FR-005), idempotent per (generationId, proposalIndex).
// The owner always comes from the session (auth.uid() in public.accept_proposal), never from the body.
// Privacy: front/back are never logged; logs carry only our code and the database error code.

const requestSchema = z.object({
  generationId: z.uuid(),
  // 0..MAX_PROPOSALS-1, same range as the cards CHECK (proposal_index between 0 and 9).
  proposalIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_PROPOSALS - 1),
  front: z.string(),
  back: z.string(),
}) satisfies z.ZodType<AcceptProposalRequest>;

const NOT_SAVED_MESSAGE = "Nie udało się zapisać fiszki. Spróbuj ponownie.";

function blankMessage(field: "front" | "back"): string {
  return field === "front" ? CARD_FRONT_BLANK_MESSAGE : CARD_BACK_BLANK_MESSAGE;
}

function notSaved(code: string, cause: string | undefined): Response {
  // eslint-disable-next-line no-console
  console.error("cards: save failed", { code, cause });
  return jsonError(500, "card_not_saved", NOT_SAVED_MESSAGE);
}

export const POST: APIRoute = async (context) => {
  // Same order as /api/generate: auth outage (503), then session (401), then the body.
  if (context.locals.authUnavailable) {
    return jsonError(503, "auth_unavailable", AUTH_UNAVAILABLE_MESSAGE);
  }
  if (!context.locals.user) {
    return jsonError(401, "unauthorized", "Zaloguj się, aby zapisywać fiszki.");
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError(400, "invalid_request", "Nieprawidłowe żądanie.");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "invalid_request", "Nieprawidłowe żądanie.");
  }

  const input = parsed.data;
  if (isBlankCardText(input.front)) return jsonError(400, "card_blank", blankMessage("front"));
  if (isBlankCardText(input.back)) return jsonError(400, "card_blank", blankMessage("back"));

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return notSaved("card_not_saved", "supabase_not_configured");

  try {
    const result = await acceptProposal(supabase, input);
    return jsonOk(result, result.created ? 201 : 200);
  } catch (error) {
    if (!(error instanceof CardSaveError)) {
      return notSaved("card_not_saved", error instanceof Error ? error.name : typeof error);
    }
    switch (error.code) {
      case "generation_not_found":
        return jsonError(404, "generation_not_found", "Nie znaleziono generowania. Wygeneruj fiszki ponownie.");
      case "proposal_out_of_range":
        return jsonError(400, "proposal_out_of_range", "Nie ma takiej propozycji w tym generowaniu.");
      case "card_blank":
        return jsonError(400, "card_blank", blankMessage(error.blankField ?? "front"));
      default:
        return notSaved(error.code, error.cause);
    }
  }
};
