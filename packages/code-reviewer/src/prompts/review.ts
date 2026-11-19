// User prompt for one review run: optional PR title and description, then the diff.
// Everything here is untrusted author input, fenced so the model reads it as data.
export interface ReviewInput {
  diff: string;
  title?: string;
  body?: string;
}

export function buildReviewPrompt({ diff, title, body }: ReviewInput): string {
  const parts: string[] = [];
  if (title?.trim()) parts.push(`<pr_title>\n${title.trim()}\n</pr_title>`);
  if (body?.trim()) parts.push(`<pr_description>\n${body.trim()}\n</pr_description>`);
  parts.push(`<diff>\n${diff}\n</diff>`);
  return `Zrecenzuj ten pull request.\n\n${parts.join("\n\n")}`;
}
