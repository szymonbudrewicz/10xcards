import { useEffect, useRef, useState } from "react";
import { SavedCardItem } from "@/components/cards/SavedCardItem";
import { useSavedCardActions } from "@/components/hooks/useSavedCardActions";
import type { SavedCard } from "@/types";

interface SavedCardListProps {
  /** Read on the server (newest first); the list is local state from then on. */
  initialCards: SavedCard[];
}

/** The user's saved cards with edit and delete (FR-010). */
export default function SavedCardList({ initialCards }: SavedCardListProps) {
  const [cards, setCards] = useState(initialCards);
  const [announcement, setAnnouncement] = useState("");
  // Bumped on every removal: focus moves to the heading once the card is out of the DOM.
  const [removals, setRemovals] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The live region is cleared first so a second deletion is announced again.
  const announceDeleted = useRef(false);
  const { updateCard, deleteCard } = useSavedCardActions();

  useEffect(() => {
    if (removals === 0) return;
    headingRef.current?.focus();
    if (announceDeleted.current) {
      announceDeleted.current = false;
      setAnnouncement("Usunięto fiszkę.");
    }
  }, [removals]);

  function handleUpdated(updated: SavedCard) {
    setCards((current) => current.map((card) => (card.id === updated.id ? updated : card)));
  }

  function handleRemoved(id: string, reason: "deleted" | "gone") {
    setCards((current) => current.filter((card) => card.id !== id));
    setAnnouncement("");
    announceDeleted.current = reason === "deleted";
    setRemovals((count) => count + 1);
  }

  return (
    <section className="space-y-4">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="focus-visible:ring-ring rounded-sm text-lg font-semibold outline-none focus-visible:ring-2"
      >
        Zapisane fiszki ({cards.length})
      </h2>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {cards.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nie masz jeszcze zapisanych fiszek.{" "}
          <a href="/generate" className="text-link hover:underline">
            Wygeneruj fiszki
          </a>
        </p>
      ) : (
        <ul className="space-y-3">
          {cards.map((card) => (
            <SavedCardItem
              key={card.id}
              card={card}
              updateCard={updateCard}
              deleteCard={deleteCard}
              onUpdated={handleUpdated}
              onRemoved={handleRemoved}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
