// Shared shapes for the card-generation and card-saving endpoints, their services and the UI.

/** Longest pasted text accepted, counted as `String.prototype.length` (same as the form). */
export const MAX_TEXT_LENGTH = 10_000;

/** Most proposals returned by a single generation. */
export const MAX_PROPOSALS = 10;

export interface CardProposal {
  front: string;
  back: string;
}

export interface GenerateProposalsRequest {
  text: string;
}

export interface GenerateProposalsResponse {
  proposals: CardProposal[];
  /** Id of the saved generation the proposals belong to; `null` when there are no proposals (nothing saved). */
  generationId: string | null;
}

/** POST /api/cards: accept proposal `proposalIndex` (its position in `proposals`), possibly edited. */
export interface AcceptProposalRequest {
  generationId: string;
  proposalIndex: number;
  front: string;
  back: string;
}

export interface SavedCard {
  id: string;
  front: string;
  back: string;
  createdAt: string;
}

/** `created: false` means the proposal was already saved; `card` is the existing card (first content wins). */
export interface AcceptProposalResponse {
  card: SavedCard;
  created: boolean;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
