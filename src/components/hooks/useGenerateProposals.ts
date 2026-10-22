import { useCallback, useRef, useState } from "react";
import type { ApiError, CardProposal, GenerateProposalsResponse } from "@/types";

const NETWORK_ERROR = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";

// Response bodies are untrusted: read every field as optional before narrowing.
interface LooseBody {
  error?: { message?: unknown };
  proposals?: unknown;
}

function isApiError(body: unknown): body is ApiError {
  return typeof (body as LooseBody | null)?.error?.message === "string";
}

function isProposalsResponse(body: unknown): body is GenerateProposalsResponse {
  return Array.isArray((body as LooseBody | null)?.proposals);
}

/** Calls POST /api/generate. Never touches the text in the form. */
export function useGenerateProposals() {
  const [proposals, setProposals] = useState<CardProposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // A ref, not state: two clicks in the same render must not both pass the guard.
  const inFlight = useRef(false);

  const generate = useCallback(async (text: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.ok && isProposalsResponse(body)) {
        setProposals(body.proposals);
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

  return { proposals, error, isLoading, generate };
}
