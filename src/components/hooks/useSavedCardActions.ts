import { useCallback, useRef } from "react";
import type { ApiError, SavedCard, UpdateCardRequest, UpdateCardResponse } from "@/types";

const NETWORK_ERROR = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";
const BUSY_MESSAGE = "Poczekaj, poprzednia operacja na tej fiszce jeszcze trwa.";

export type SavedCardActionResult = { ok: true; card?: SavedCard } | { ok: false; message: string; gone: boolean };

// Response bodies are untrusted: read every field as optional before narrowing.
interface LooseBody {
  error?: { message?: unknown };
  card?: { id?: unknown; front?: unknown; back?: unknown; createdAt?: unknown };
}

function isApiError(body: unknown): body is ApiError {
  return typeof (body as LooseBody | null)?.error?.message === "string";
}

function isUpdateResponse(body: unknown): body is UpdateCardResponse {
  const b = body as LooseBody | null;
  return (
    typeof b?.card?.id === "string" &&
    typeof b.card.front === "string" &&
    typeof b.card.back === "string" &&
    typeof b.card.createdAt === "string"
  );
}

/** A failed response: the server's Polish message, or the network message for an unreadable body. 404 = `gone`. */
function failure(response: Response, body: unknown, action: "update" | "delete"): SavedCardActionResult {
  const gone = response.status === 404;
  if (isApiError(body)) return { ok: false, message: body.error.message, gone };
  // Unexpected body (proxy page, truncated JSON): keep the status as evidence, never the card text.
  // eslint-disable-next-line no-console
  console.error(`cards: unexpected ${action} response`, { status: response.status });
  return { ok: false, message: NETWORK_ERROR, gone };
}

function networkFailure(error: unknown, action: "update" | "delete"): SavedCardActionResult {
  // eslint-disable-next-line no-console
  console.error(`cards: ${action} request failed`, { name: error instanceof Error ? error.name : typeof error });
  return { ok: false, message: NETWORK_ERROR, gone: false };
}

/**
 * PATCH/DELETE /api/cards/[id] for the saved-card list. One request per card at a time:
 * a second call for a card already in flight is refused without sending anything.
 */
export function useSavedCardActions() {
  // A ref, not state: two clicks in the same render must not both send a request.
  const inFlight = useRef(new Set<string>());

  const run = useCallback(
    async (id: string, request: () => Promise<SavedCardActionResult>): Promise<SavedCardActionResult> => {
      if (inFlight.current.has(id)) return { ok: false, message: BUSY_MESSAGE, gone: false };
      inFlight.current.add(id);
      try {
        return await request();
      } finally {
        inFlight.current.delete(id);
      }
    },
    [],
  );

  const updateCard = useCallback(
    (id: string, front: string, back: string): Promise<SavedCardActionResult> =>
      run(id, async () => {
        try {
          const request: UpdateCardRequest = { front, back };
          const response = await fetch(`/api/cards/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          });
          const body: unknown = await response.json().catch(() => null);
          if (response.ok && isUpdateResponse(body)) return { ok: true, card: body.card };
          if (response.ok) return failure(response, null, "update");
          return failure(response, body, "update");
        } catch (error) {
          return networkFailure(error, "update");
        }
      }),
    [run],
  );

  const deleteCard = useCallback(
    (id: string): Promise<SavedCardActionResult> =>
      run(id, async () => {
        try {
          const response = await fetch(`/api/cards/${encodeURIComponent(id)}`, { method: "DELETE" });
          if (response.ok) return { ok: true };
          const body: unknown = await response.json().catch(() => null);
          return failure(response, body, "delete");
        } catch (error) {
          return networkFailure(error, "delete");
        }
      }),
    [run],
  );

  return { updateCard, deleteCard };
}
