// User prompt for one review run: the diff to judge.
export function buildReviewPrompt(diff: string): string {
  return `Zrecenzuj ten diff:\n\n${diff}`;
}
