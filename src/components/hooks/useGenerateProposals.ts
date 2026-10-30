import { useCallback, useRef, useState } from "react";
import type { ApiError, CardProposal, GenerateProposalsResponse } from "@/types";

const NETWORK_ERROR = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";

// Response bodies are untrusted: read every field as optional before narrowing.
interface LooseBody {
  error?: { message?: unknown };
  proposals?: unknown;
  generationId?: unknown;
}

function isApiError(body: unknown): body is ApiError {
  return typeof (body as LooseBody | null)?.error?.message === "string";
}

// Proposals can only be accepted with the id of their saved generation; none is saved for 0 proposals.
function isProposalsResponse(body: unknown): body is GenerateProposalsResponse {
  const b = body as LooseBody | null;
  if (!Array.isArray(b?.proposals)) return false;
  return b.proposals.length === 0 ? b.generationId === null : typeof b.generationId === "string";
}

/** Calls POST /api/generate. Never touches the text in the form. */
export function useGenerateProposals() {
  const [proposals, setProposals] = useState<CardProposal[] | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // A ref, not state: two clicks in the same render must not both pass the guard.
  const inFlight = useRef(false);

  const generate = useCallback(async (text: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    setError(null);
    // Old cards belong to the previous text: never show them next to a new result or error.
    setProposals(null);
    setGenerationId(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.ok && isProposalsResponse(body)) {
        setProposals(body.proposals);
        setGenerationId(body.generationId);
      } else if (!response.ok && isApiError(body)) {
        setError(body.error.message);
      } else {
        setError(NETWORK_ERROR);
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  }, []);

  return { proposals, generationId, error, isLoading, generate };
}
