import type { APIRoute } from "astro";
import { z } from "zod";
import { OPENROUTER_API_KEY, OPENROUTER_BASE_URL } from "astro:env/server";
import { jsonError, jsonOk } from "@/lib/api-response";
import { CardGenerationError, generateCardProposals } from "@/lib/services/card-generation";
import { MAX_TEXT_LENGTH, type GenerateProposalsResponse } from "@/types";

// Privacy: the pasted text is never stored or logged; logs carry only the error code
// and the provider HTTP status.

const requestSchema = z.object({ text: z.string() });

export const POST: APIRoute = async (context) => {
  // Session first, before reading the body, so an anonymous request never reaches the AI.
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
    return jsonError(400, "text_too_long", "Tekst może mieć najwyżej 10 000 znaków.");
  }

  const apiKey = OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(503, "ai_not_configured", "Generowanie fiszek jest chwilowo niedostępne.");
  }

  try {
    const proposals = await generateCardProposals(text, {
      apiKey,
      // Empty means the default OpenRouter URL (resolved in the service).
      baseUrl: OPENROUTER_BASE_URL ?? "",
    });
    const response: GenerateProposalsResponse = { proposals };
    return jsonOk(response);
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
};
