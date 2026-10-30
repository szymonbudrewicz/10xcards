// One rule for "blank card text", shared by the API and the card editor.
// Mirrors the cards CHECK constraints (`front !~ '^\s*$'`, `back !~ '^\s*$'`): empty or whitespace only.

export function isBlankCardText(value: string): boolean {
  return /^\s*$/.test(value);
}

export const CARD_FRONT_BLANK_MESSAGE = "Przód fiszki nie może być pusty.";
export const CARD_BACK_BLANK_MESSAGE = "Tył fiszki nie może być pusty.";

/** Longest front or back accepted when editing a saved card, counted as `String.prototype.length`. */
export const MAX_CARD_TEXT_LENGTH = 2000;
