// Shared shapes for the card-generation endpoint, its service and the UI.

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
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
