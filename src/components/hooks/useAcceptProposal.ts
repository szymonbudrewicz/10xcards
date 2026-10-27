import { useCallback, useRef, useState } from "react";
import type { AcceptProposalRequest, AcceptProposalResponse, ApiError, SavedCard } from "@/types";

const NETWORK_ERROR = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";

// Response bodies are untrusted: read every field as optional before narrowing.
interface LooseBody {
  error?: { message?: unknown };
  card?: { id?: unknown; front?: unknown; back?: unknown; createdAt?: unknown };
  created?: unknown;
}

function isApiError(body: unknown): body is ApiError {
  return typeof (body as LooseBody | null)?.error?.message === "string";
}

function isAcceptResponse(body: unknown): body is AcceptProposalResponse {
  const b = body as LooseBody | null;
  return (
    typeof b?.card?.id === "string" &&
    typeof b.card.front === "string" &&
    typeof b.card.back === "string" &&
    typeof b.card.createdAt === "string" &&
    typeof b.created === "boolean"
  );
}

/**
 * Saves one proposal through POST /api/cards (accept, possibly after an edit).
 * `accept` resolves to `null` on success or to a Polish message. A repeat of an already saved
 * proposal is a success too: the server returns the card saved first, and `saved` shows it.
 */
export function useAcceptProposal(generationId: string, proposalIndex: number) {
  const [saved, setSaved] = useState<SavedCard | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // A ref, not state: two clicks in the same render must not both send a request.
  const inFlight = useRef(false);

  const accept = useCallback(
    async (front: string, back: string): Promise<string | null> => {
      // A second click while saving is ignored; the first request decides the result.
      if (inFlight.current) return null;
      inFlight.current = true;
      setIsSaving(true);

      try {
        const request: AcceptProposalRequest = { generationId, proposalIndex, front, back };
        const response = await fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        const body: unknown = await response.json().catch(() => null);

        if (response.ok && isAcceptResponse(body)) {
          setSaved(body.card);
          return null;
        }
        if (!response.ok && isApiError(body)) return body.error.message;
        // Unexpected body (proxy page, truncated JSON): keep the status as evidence, never the card text.
        // eslint-disable-next-line no-console
        console.error("cards: unexpected response", { status: response.status });
        return NETWORK_ERROR;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("cards: request failed", { name: error instanceof Error ? error.name : typeof error });
        return NETWORK_ERROR;
      } finally {
        inFlight.current = false;
        setIsSaving(false);
      }
    },
    [generationId, proposalIndex],
  );

  return { accept, saved, isSaving };
}
