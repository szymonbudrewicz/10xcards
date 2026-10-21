import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
  /** Forces the loading state (kitchen-sink only); app forms rely on useFormStatus. */
  pending?: boolean;
}

export function SubmitButton({ pendingText, icon, children, pending }: SubmitButtonProps) {
  const status = useFormStatus();
  const isPending = pending ?? status.pending;

  return (
    <Button type="submit" size="lg" disabled={isPending} className="w-full">
      {isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {pendingText}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Button>
  );
}
