import { useRef, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ServerError } from "@/components/auth/ServerError";
import { CardEditor } from "@/components/cards/CardEditor";
import type { SavedCardActionResult } from "@/components/hooks/useSavedCardActions";
import { cn } from "@/lib/utils";
import type { SavedCard } from "@/types";

interface SavedCardItemProps {
  card: SavedCard;
  updateCard: (id: string, front: string, back: string) => Promise<SavedCardActionResult>;
  deleteCard: (id: string) => Promise<SavedCardActionResult>;
  /** The server's copy after a successful edit. */
  onUpdated: (card: SavedCard) => void;
  /** The card is gone: deleted here (`deleted`) or found missing while editing (`gone`). */
  onRemoved: (id: string, reason: "deleted" | "gone") => void;
}

/** One saved card (FR-010): preview, edit through CardEditor, delete after confirmation. */
export function SavedCardItem({ card, updateCard, deleteCard, onUpdated, onRemoved }: SavedCardItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Set when a save answered 404: "Anuluj" then removes the card instead of showing a stale preview.
  const goneWhileEditing = useRef(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The trigger button disappears with the card, so the dialog must not try to return focus to it.
  const removed = useRef(false);

  async function handleSave(front: string, back: string): Promise<string | null> {
    const result = await updateCard(card.id, front, back);
    if (result.ok) {
      if (result.card) onUpdated(result.card);
      setIsEditing(false);
      return null;
    }
    if (result.gone) goneWhileEditing.current = true;
    return result.message;
  }

  function handleCancelEdit() {
    if (goneWhileEditing.current) {
      onRemoved(card.id, "gone");
      return;
    }
    setIsEditing(false);
  }

  async function handleDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    const result = await deleteCard(card.id);
    // Already deleted elsewhere (404) ends the same way: the card is not there any more.
    if (result.ok || result.gone) {
      removed.current = true;
      onRemoved(card.id, "deleted");
      return;
    }
    setIsDeleting(false);
    setDeleteError(result.message);
  }

  const label = `Fiszka: ${card.front}`;
  const itemClass = "border-border bg-muted/30 rounded-lg border p-4";

  if (isEditing) {
    return (
      <li aria-label={label} className={itemClass}>
        <CardEditor
          initialFront={card.front}
          initialBack={card.back}
          onSave={handleSave}
          onCancel={handleCancelEdit}
          saveLabel="Zapisz zmiany"
        />
      </li>
    );
  }

  return (
    <li aria-label={label} className={cn(itemClass, "space-y-3")}>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground text-xs uppercase">Przód</p>
          <p className="text-sm whitespace-pre-wrap">{card.front}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase">Tył</p>
          <p className="text-sm whitespace-pre-wrap">{card.back}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setIsEditing(true);
          }}
        >
          <Pencil />
          Edytuj
        </Button>
        <AlertDialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            // Escape or "Anuluj" while the request runs would hide its result.
            if (isDeleting) return;
            setIsDialogOpen(open);
            if (open) setDeleteError(null);
          }}
        >
          <AlertDialogTrigger asChild>
            <Button type="button" size="sm" variant="ghost">
              <Trash2 />
              Usuń
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent
            onCloseAutoFocus={(e) => {
              if (removed.current) e.preventDefault();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Usunąć tę fiszkę?</AlertDialogTitle>
              <AlertDialogDescription>Tej operacji nie można cofnąć.</AlertDialogDescription>
            </AlertDialogHeader>
            <ServerError message={deleteError} />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeleting}
                onClick={(e) => {
                  // Keep the dialog open until the server answers; it closes with the card on success.
                  e.preventDefault();
                  void handleDelete();
                }}
              >
                {isDeleting && <Loader2 className="animate-spin" />}
                {isDeleting ? "Usuwanie…" : "Usuń"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
