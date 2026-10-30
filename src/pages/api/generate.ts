import type { APIRoute } from "astro";
import { z } from "zod";
import { OPENROUTER_API_KEY, OPENROUTER_BASE_URL } from "astro:env/server";
import { jsonError, jsonOk } from "@/lib/api-response";
import { AUTH_UNAVAILABLE_MESSAGE } from "@/lib/auth-session";
import { CardGenerationError, generateCardProposals } from "@/lib/services/card-generation";
import { CardSaveError, recordGeneration } from "@/lib/services/cards";
import { createClient } from "@/lib/supabase";
import { MAX_TEXT_LENGTH, type CardProposal, type GenerateProposalsResponse } from "@/types";

// Privacy: the pasted text is never stored or logged; logs carry only the error code
// and the provider HTTP status (or the database error code). Only the proposal count is saved.

const requestSchema = z.object({ text: z.string() });

export const POST: APIRoute = async (context) => {
  // Session first, before reading the body, so an anonymous request never reaches the AI.
  // An auth outage is not a missing session: 503, not 401 (the middleware already logged it).
  if (context.locals.authUnavailable) {
    return jsonError(503, "auth_unavailable", AUTH_UNAVAILABLE_MESSAGE);
  }
  if (!context.locals.user) {
    return jsonError(401, "unauthorized", "Zaloguj się, aby generować fiszki.");
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

  const { text } = parsed.data;
  if (text.trim().length === 0) {
    return jsonError(400, "text_empty", "Wklej tekst, z którego mają powstać fiszki.");
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return jsonError(
      400,
      "text_too_long",
      `Tekst może mieć najwyżej ${MAX_TEXT_LENGTH.toLocaleString("pl-PL")} znaków.`,
    );
  }

  const apiKey = OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(503, "ai_not_configured", "Generowanie fiszek jest chwilowo niedostępne.");
  }

  let proposals: CardProposal[];
  try {
    proposals = await generateCardProposals(text, {
      apiKey,
      // Empty means the default OpenRouter URL (resolved in the service).
      baseUrl: OPENROUTER_BASE_URL ?? "",
    });
  } catch (error) {
    const code = error instanceof CardGenerationError ? error.code : "ai_failed";
    const providerStatus = error instanceof CardGenerationError ? error.providerStatus : undefined;
    // eslint-disable-next-line no-console
    console.error("generate failed", { code, providerStatus });

    if (code === "ai_timeout") {
      return jsonError(504, "ai_timeout", "Generowanie trwało zbyt długo. Spróbuj ponownie.");
    }
    return jsonError(502, "ai_failed", "Nie udało się wygenerować fiszek. Spróbuj ponownie.");
  }

  // No proposals, no generation row (proposed_count must be at least 1).
  if (proposals.length === 0) {
    const response: GenerateProposalsResponse = { proposals, generationId: null };
    return jsonOk(response);
  }

  // FR-012: `proposed` is recorded now. A failed save is visible (503 + log), never an unsaved 200.
  try {
    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) throw new CardSaveError("generation_not_saved", "supabase_not_configured");
    const generationId = await recordGeneration(supabase, proposals.length);
    const response: GenerateProposalsResponse = { proposals, generationId };
    return jsonOk(response);
  } catch (error) {
    const code = error instanceof CardSaveError ? error.code : "generation_not_saved";
    const cause = error instanceof CardSaveError ? error.cause : error instanceof Error ? error.name : typeof error;
    // eslint-disable-next-line no-console
    console.error("generate: generation not saved", { code, cause });
    return jsonError(503, "generation_not_saved", "Nie udało się zapisać wyniku generowania. Spróbuj ponownie.");
  }
};
