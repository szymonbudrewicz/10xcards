// Maps the ?error= code on /auth/signin to a Polish message. Any other value
// (unknown code or free text pasted into a link) gets the generic message,
// so the page never echoes the query parameter back to the user.
const SIGN_IN_MESSAGES: Record<string, string> = {
  invalid_credentials: "Nieprawidłowy e-mail lub hasło.",
  email_not_confirmed: "Potwierdź adres e-mail, zanim się zalogujesz.",
  auth_unavailable: "Logowanie jest chwilowo niedostępne.",
};

const GENERIC_SIGN_IN_MESSAGE = "Nie udało się zalogować. Spróbuj ponownie.";

export function signInErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return Object.hasOwn(SIGN_IN_MESSAGES, code) ? SIGN_IN_MESSAGES[code] : GENERIC_SIGN_IN_MESSAGE;
}
