import React, { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ServerError } from "@/components/auth/ServerError";
import { CARD_BACK_BLANK_MESSAGE, CARD_FRONT_BLANK_MESSAGE, isBlankCardText } from "@/lib/card-content";

interface CardEditorProps {
  initialFront: string;
  initialBack: string;
  /**
   * Saves the card. Resolves to `null` on success or to a Polish message to show.
   * The editor does not know the endpoint: S-03 accepts a proposal, S-04 will PATCH front/back.
   */
  onSave: (front: string, back: string) => Promise<string | null>;
  onCancel: () => void;
  saveLabel?: string;
}

/** Front/back editor shared by proposal review (S-03) and saved-card management (S-04). */
export function CardEditor({ initialFront, initialBack, onSave, onCancel, saveLabel = "Zapisz" }: CardEditorProps) {
  const id = useId();
  const [front, setFront] = useState(initialFront);
  const [back, setBack] = useState(initialBack);
  const [frontError, setFrontError] = useState<string | null>(null);
  const [backError, setBackError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSaving) return;

    // The database rejects blank text anyway; say so before sending anything.
    const nextFrontError = isBlankCardText(front) ? CARD_FRONT_BLANK_MESSAGE : null;
    const nextBackError = isBlankCardText(back) ? CARD_BACK_BLANK_MESSAGE : null;
    setFrontError(nextFrontError);
    setBackError(nextBackError);
    if (nextFrontError || nextBackError) return;

    setIsSaving(true);
    setSaveError(null);
    // On failure the editor stays open with what the user typed.
    const message = await onSave(front, back);
    setIsSaving(false);
    setSaveError(message);
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-front`}>Przód</Label>
        <Textarea
          id={`${id}-front`}
          value={front}
          onChange={(e) => {
            setFront(e.target.value);
            setFrontError(null);
          }}
          aria-invalid={frontError ? true : undefined}
          aria-describedby={frontError ? `${id}-front-error` : undefined}
          disabled={isSaving}
          autoFocus
        />
        {frontError && (
          <p id={`${id}-front-error`} className="text-destructive text-xs">
            {frontError}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-back`}>Tył</Label>
        <Textarea
          id={`${id}-back`}
          value={back}
          onChange={(e) => {
            setBack(e.target.value);
            setBackError(null);
          }}
          aria-invalid={backError ? true : undefined}
          aria-describedby={backError ? `${id}-back-error` : undefined}
          disabled={isSaving}
        />
        {backError && (
          <p id={`${id}-back-error`} className="text-destructive text-xs">
            {backError}
          </p>
        )}
      </div>

      <ServerError message={saveError} />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving && <Loader2 className="animate-spin" />}
          {isSaving ? "Zapisywanie…" : saveLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isSaving}>
          Anuluj
        </Button>
      </div>
    </form>
  );
}
