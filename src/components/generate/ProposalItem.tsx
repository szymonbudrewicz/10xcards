import { useState } from "react";
import { Check, CircleCheck, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { CardEditor } from "@/components/cards/CardEditor";
import { useAcceptProposal } from "@/components/hooks/useAcceptProposal";
import { cn } from "@/lib/utils";
import type { CardProposal } from "@/types";

interface ProposalItemProps {
  proposal: CardProposal;
  generationId: string;
  /** Position in the /api/generate response, not in the list after removals. */
  proposalIndex: number;
  /** "Usuń": UI only, nothing is sent; a removed proposal counts as not accepted. */
  onRemove: () => void;
}

function CardFace({ front, back }: CardProposal) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <p className="text-muted-foreground text-xs uppercase">Przód</p>
        <p className="text-sm whitespace-pre-wrap">{front}</p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs uppercase">Tył</p>
        <p className="text-sm whitespace-pre-wrap">{back}</p>
      </div>
    </div>
  );
}

/** One AI proposal with the three FR-004 actions: accept, edit (save = accept), remove. */
export function ProposalItem({ proposal, generationId, proposalIndex, onRemove }: ProposalItemProps) {
  const { accept, saved, isSaving } = useAcceptProposal(generationId, proposalIndex);
  const [isEditing, setIsEditing] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  async function handleAccept() {
    setAcceptError(null);
    setAcceptError(await accept(proposal.front, proposal.back));
  }

  const label = `Propozycja ${proposalIndex + 1}`;
  const itemClass = "border-border rounded-lg border p-4";

  if (saved) {
    // The server's copy: on a repeat it is the content saved first, not the local one.
    return (
      <li aria-label={label} className={cn(itemClass, "bg-muted/30 space-y-3")}>
        <CardFace front={saved.front} back={saved.back} />
        <p className="text-primary flex items-center gap-1.5 text-xs font-semibold">
          <CircleCheck className="size-4" />
          Zapisano
        </p>
      </li>
    );
  }

  if (isEditing) {
    return (
      <li aria-label={label} className={cn(itemClass, "bg-muted/30")}>
        <CardEditor
          initialFront={proposal.front}
          initialBack={proposal.back}
          onSave={accept}
          onCancel={() => {
            setIsEditing(false);
          }}
          saveLabel="Zapisz fiszkę"
        />
      </li>
    );
  }

  return (
    <li aria-label={label} className={cn(itemClass, "bg-muted/30 space-y-3")}>
      <CardFace front={proposal.front} back={proposal.back} />
      <ServerError message={acceptError} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void handleAccept()} disabled={isSaving}>
          {isSaving ? <Loader2 className="animate-spin" /> : <Check />}
          {isSaving ? "Zapisywanie…" : acceptError ? "Spróbuj ponownie" : "Akceptuj"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setAcceptError(null);
            setIsEditing(true);
          }}
          disabled={isSaving}
        >
          <Pencil />
          Popraw
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove} disabled={isSaving}>
          <Trash2 />
          Usuń
        </Button>
      </div>
    </li>
  );
}
