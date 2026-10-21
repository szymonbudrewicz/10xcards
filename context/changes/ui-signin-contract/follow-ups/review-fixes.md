# Follow-ups z przeglądu implementacji

Źródło: `reviews/impl-review.md`. Zadania poza zakresem tej zmiany, do osobnych zmian (`/10x-new`).

## F4 — Rejestracja: kody błędów zamiast tekstu w `?error=`

- `src/pages/api/auth/signup.ts:11,16` przekazuje stały angielski tekst i surowy `error.message` z Supabase w `?error=`, a `src/pages/auth/signup.astro:6` wyświetla go bez filtrowania. Każdy może linkiem pokazać dowolny tekst jako komunikat aplikacji (bez XSS).
- Zrobić to samo co dla logowania: kod w linku, mapowanie na polski komunikat (np. `signUpErrorMessage` obok `signInErrorMessage` w `src/lib/auth-errors.ts`), ogólny komunikat dla nieznanej wartości.

## F8 — Następny widok dla `/10x-ui`

- `src/pages/dashboard.astro` i `src/components/Welcome.astro` / `Topbar.astro` nadal używają klas palety. Po włączeniu `.dark` globalnie mieszają stare literały z nowymi tokenami. Dashboard to widok, na który użytkownik trafia po logowaniu, więc to dobry kandydat na kolejną zmianę `/10x-ui` (po dodaniu go do listy w `scripts/ui-literal-scan.mjs`).
- Język interfejsu (D1): polskie komunikaty błędów na stronie z `lang="en"` i angielskimi etykietami. Decyzja dla całej aplikacji.
