import React, { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ServerError } from "@/components/auth/ServerError";
import { useGenerateProposals } from "@/components/hooks/useGenerateProposals";
import { cn } from "@/lib/utils";
import { MAX_TEXT_LENGTH } from "@/types";

const EMPTY_MESSAGE = "Wklej tekst, z którego mają powstać fiszki.";
const TOO_LONG_MESSAGE = `Tekst może mieć najwyżej ${MAX_TEXT_LENGTH.toLocaleString("pl-PL")} znaków.`;
const NO_PROPOSALS_MESSAGE = "AI nie znalazło w tym tekście materiału na fiszki.";

export default function GenerateForm() {
  // The text stays in the field after both errors and success.
  const [text, setText] = useState("");
  const [emptyError, setEmptyError] = useState(false);
  const { proposals, error, isLoading, generate } = useGenerateProposals();

  const tooLong = text.length > MAX_TEXT_LENGTH;
  const fieldError = tooLong ? TOO_LONG_MESSAGE : emptyError ? EMPTY_MESSAGE : null;

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (text.trim().length === 0) {
      setEmptyError(true);
      return;
    }
    if (tooLong || isLoading) return;
    void generate(text);
  }

  return (
    <div className="space-y-6">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-2">
          <Label htmlFor="source-text">Tekst do nauki</Label>
          <Textarea
            id="source-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setEmptyError(false);
            }}
            placeholder="Wklej artykuł lub notatki…"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby="source-text-meta"
            className="min-h-48"
          />
          <div id="source-text-meta" className="flex items-start justify-between gap-4 text-xs">
            <p className="text-destructive">{fieldError}</p>
            <p
              className={cn(
                "shrink-0 tabular-nums",
                tooLong ? "text-destructive font-semibold" : "text-muted-foreground",
              )}
            >
              {text.length.toLocaleString("pl-PL")} / {MAX_TEXT_LENGTH.toLocaleString("pl-PL")}
            </p>
          </div>
        </div>

        <ServerError message={error} />

        <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {isLoading ? "Generowanie…" : "Generuj"}
        </Button>
      </form>

      {/* Always mounted, so screen readers announce results inserted later. */}
      <div aria-live="polite">
        {proposals && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Propozycje fiszek</h2>
            {proposals.length === 0 ? (
              <p className="text-muted-foreground text-sm">{NO_PROPOSALS_MESSAGE}</p>
            ) : (
              <ul className="space-y-3">
                {proposals.map((p, i) => (
                  <li key={i} className="border-border bg-muted/30 grid gap-2 rounded-lg border p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground text-xs uppercase">Przód</p>
                      <p className="text-sm">{p.front}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase">Tył</p>
                      <p className="text-sm">{p.back}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
