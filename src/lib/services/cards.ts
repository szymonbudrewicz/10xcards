import type { SupabaseClient } from "@supabase/supabase-js";
import type { AcceptProposalResponse } from "@/types";

// Database calls for cards and generations. Privacy: errors carry only our code and the
// SQLSTATE/PostgREST code as `cause` — never the card content, the error message or its details
// (PostgREST puts the failing row, i.e. the card content, into `details`).

export type CardSaveErrorCode =
  "generation_not_saved" | "generation_not_found" | "proposal_out_of_range" | "card_blank" | "card_not_saved";

export class CardSaveError extends Error {
  readonly code: CardSaveErrorCode;
  /** SQLSTATE/PostgREST code, or the error name for a thrown error. Safe to log. */
  override readonly cause: string | undefined;
  /** For `card_blank` from the database: which side violated its CHECK constraint. */
  readonly blankField?: "front" | "back";

  constructor(code: CardSaveErrorCode, cause: string | undefined, blankField?: "front" | "back") {
    super(code);
    this.name = "CardSaveError";
    this.code = code;
    this.cause = cause;
    this.blankField = blankField;
  }
}

interface DbError {
  code?: string;
  message?: string;
}

function thrownCause(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** Inserts a generation with its proposal count (the counter FR-012 divides by); returns its id. */
export async function recordGeneration(supabase: SupabaseClient, proposedCount: number): Promise<string> {
  let result: { data: unknown; error: DbError | null };
  try {
    result = await supabase.from("generations").insert({ proposed_count: proposedCount }).select("id").single();
  } catch (error) {
    throw new CardSaveError("generation_not_saved", thrownCause(error));
  }
  if (result.error) throw new CardSaveError("generation_not_saved", result.error.code);
  const id = (result.data as { id?: unknown } | null)?.id;
  if (typeof id !== "string") throw new CardSaveError("generation_not_saved", "no_id");
  return id;
}

export interface AcceptProposalInput {
  generationId: string;
  proposalIndex: number;
  front: string;
  back: string;
}

// PostgREST message for a CHECK violation: `new row for relation "cards" violates check constraint "<name>"`.
const BLANK_CONSTRAINT = /violates check constraint "cards_(front|back)_not_blank"/;

function mapAcceptError(error: DbError): CardSaveError {
  switch (error.code) {
    case "P0002":
      return new CardSaveError("generation_not_found", error.code);
    case "22023":
      return new CardSaveError("proposal_out_of_range", error.code);
    case "23514": {
      // Only the blank-content constraints mean "blank card"; any other CHECK (e.g.
      // generations_accepted_count_range) is a save failure.
      const match = BLANK_CONSTRAINT.exec(error.message ?? "");
      if (match) return new CardSaveError("card_blank", error.code, match[1] as "front" | "back");
      return new CardSaveError("card_not_saved", error.code);
    }
    default:
      return new CardSaveError("card_not_saved", error.code);
  }
}

interface AcceptedRow {
  id: string;
  front: string;
  back: string;
  created_at: string;
  created: boolean;
}

function isAcceptedRow(row: unknown): row is AcceptedRow {
  const r = row as Partial<AcceptedRow> | null;
  return (
    typeof r?.id === "string" &&
    typeof r.front === "string" &&
    typeof r.back === "string" &&
    typeof r.created_at === "string" &&
    typeof r.created === "boolean"
  );
}

/**
 * Saves an accepted proposal through public.accept_proposal (card insert + accepted_count in one
 * transaction). The owner is always the session user (`auth.uid()` in the function).
 */
export async function acceptProposal(
  supabase: SupabaseClient,
  input: AcceptProposalInput,
): Promise<AcceptProposalResponse> {
  let result: { data: unknown; error: DbError | null };
  try {
    result = await supabase.rpc("accept_proposal", {
      p_generation_id: input.generationId,
      p_proposal_index: input.proposalIndex,
      p_front: input.front,
      p_back: input.back,
    });
  } catch (error) {
    throw new CardSaveError("card_not_saved", thrownCause(error));
  }
  if (result.error) throw mapAcceptError(result.error);

  const rows = Array.isArray(result.data) ? (result.data as unknown[]) : [];
  const row = rows.length === 1 ? rows[0] : undefined;
  if (!isAcceptedRow(row)) throw new CardSaveError("card_not_saved", "unexpected_result");

  return {
    card: { id: row.id, front: row.front, back: row.back, createdAt: row.created_at },
    created: row.created,
  };
}
