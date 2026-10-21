import { Mail, Lock, LogIn } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInErrorMessage } from "@/lib/auth-errors";

// Dev-only: the sign-in form in every state of the /10x-ui matrix, built from the same
// components as the real view. Rendered statically by src/pages/dev/kitchen-sink.astro.
const STATES = [
  { id: "default", title: "default", note: "Pusty formularz z tokenów i komponentów ui/*." },
  { id: "hover", title: "hover", note: "Najedź na przycisk (bg-primary/90) i ikonę oka (text-foreground)." },
  { id: "focus", title: "focus-visible", note: "Tab: pierścień --ring na polu, przełączniku i przycisku." },
  { id: "disabled", title: "disabled", note: "Input disabled i przycisk w trakcie wysyłki." },
  { id: "error", title: "error", note: "Błąd pola (aria-invalid) i komunikat serwera z auth-errors.ts." },
  { id: "loading", title: "loading", note: "Spinner + tekst, przycisk tej samej wielkości." },
] as const;

const noop = () => undefined;

export default function SignInStates() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {STATES.map((state) => (
        <Card key={state.id} data-state={state.id} className="rounded-2xl backdrop-blur-xl">
          <CardHeader>
            <CardTitle>{state.title}</CardTitle>
            <CardDescription>{state.note}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" noValidate>
              {state.id === "disabled" ? (
                <div className="grid gap-2">
                  <Label htmlFor={`${state.id}-email`}>Email</Label>
                  <Input id={`${state.id}-email`} disabled readOnly value="you@example.com" className="h-10" />
                </div>
              ) : (
                <FormField
                  id={`${state.id}-email`}
                  type="email"
                  label="Email"
                  value={state.id === "error" ? "not-an-email" : ""}
                  onChange={noop}
                  placeholder="you@example.com"
                  error={state.id === "error" ? "Enter a valid email address" : undefined}
                  icon={<Mail className="size-4" />}
                />
              )}
              <FormField
                id={`${state.id}-password`}
                type="password"
                label="Password"
                value=""
                onChange={noop}
                placeholder="Your password"
                icon={<Lock className="size-4" />}
                endContent={<PasswordToggle visible={false} onToggle={noop} />}
              />
              {state.id === "error" && <ServerError message={signInErrorMessage("invalid_credentials")} />}
              <SubmitButton
                pendingText="Signing in..."
                icon={<LogIn className="size-4" />}
                pending={state.id === "disabled" || state.id === "loading"}
              >
                Sign in
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
