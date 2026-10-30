import React, { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ServerError } from "@/components/auth/ServerError";
import { useGenerateProposals } from "@/components/hooks/useGenerateProposals";
import { ProposalItem } from "@/components/generate/ProposalItem";
import { cn } from "@/lib/utils";
import { MAX_TEXT_LENGTH, type CardProposal } from "@/types";

const EMPTY_MESSAGE = "Wklej tekst, z którego mają powstać fiszki.";
const TOO_LONG_MESSAGE = `Tekst może mieć najwyżej ${MAX_TEXT_LENGTH.toLocaleString("pl-PL")} znaków.`;
const NO_PROPOSALS_MESSAGE = "AI nie znalazło w tym tekście materiału na fiszki.";
const ALL_REMOVED_MESSAGE = "Usunięto wszystkie propozycje. Wygeneruj nowe z tego samego tekstu albo wklej inny.";

interface ProposalListProps {
  proposals: CardProposal[];
  generationId: string;
}

function ProposalList({ proposals, generationId }: ProposalListProps) {
  // Removing is UI only: nothing is sent and the proposal simply counts as not accepted.
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
  const visible = proposals.map((proposal, index) => ({ proposal, index })).filter(({ index }) => !removed.has(index));

  if (visible.length === 0) {
    return <p className="text-muted-foreground text-sm">{ALL_REMOVED_MESSAGE}</p>;
  }

  return (
    <ul className="space-y-3">
      {visible.map(({ proposal, index }) => (
        <ProposalItem
          key={index}
          proposal={proposal}
          generationId={generationId}
          proposalIndex={index}
          onRemove={() => {
            setRemoved((prev) => new Set(prev).add(index));
          }}
        />
      ))}
    </ul>
  );
}

export default function GenerateForm() {
  // The text stays in the field after both errors and success.
  const [text, setText] = useState("");
  const [emptyError, setEmptyError] = useState(false);
  const { proposals, generationId, error, isLoading, generate } = useGenerateProposals();

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
            {proposals.length === 0 || !generationId ? (
              <p className="text-muted-foreground text-sm">{NO_PROPOSALS_MESSAGE}</p>
            ) : (
              // Keyed by generation: a new result starts with no removed proposals.
              <ProposalList key={generationId} proposals={proposals} generationId={generationId} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
