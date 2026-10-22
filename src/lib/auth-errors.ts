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

// Same contract for the ?error= code on /auth/signup (Supabase signUp error codes).
const SIGN_UP_MESSAGES: Record<string, string> = {
  user_already_exists: "Konto z tym adresem e-mail już istnieje. Zaloguj się.",
  weak_password: "Hasło jest za słabe. Użyj co najmniej 6 znaków.",
  email_address_invalid: "Ten adres e-mail nie jest akceptowany. Użyj innego adresu.",
  over_email_send_rate_limit: "Zbyt wiele prób rejestracji. Spróbuj ponownie za chwilę.",
  signup_disabled: "Rejestracja jest chwilowo wyłączona.",
  auth_unavailable: "Rejestracja jest chwilowo niedostępna.",
};

const GENERIC_SIGN_UP_MESSAGE = "Nie udało się utworzyć konta. Spróbuj ponownie.";

export function signUpErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return Object.hasOwn(SIGN_UP_MESSAGES, code) ? SIGN_UP_MESSAGES[code] : GENERIC_SIGN_UP_MESSAGE;
}
