---
date: 2026-10-20T20:28:09+02:00
researcher: Claude (Opus 5.5) z Szymonem Budrewiczem
git_commit: 0fee682e5266e4e17b2750f31b405cc196bb7701
branch: main
repository: 10x
topic: "Dwukierunkowy audyt UI widoku logowania (src/pages/auth/signin.astro) względem kontraktu tokenów i komponentów"
tags: [research, ui, design-system, tailwind, shadcn, auth, signin]
status: complete
last_updated: 2026-10-20
last_updated_by: Claude (Opus 5.5)
---

# Research: audyt UI widoku logowania

**Date**: 2026-10-20T20:28:09+02:00
**Researcher**: Claude (Opus 5.5) z Szymonem Budrewiczem
**Git Commit**: 0fee682e5266e4e17b2750f31b405cc196bb7701 (drzewo robocze z niezatwierdzonymi zmianami w `CLAUDE.md` i `.claude/`; pliki widoku bez zmian)
**Branch**: main
**Repository**: 10x

## Research Question

Brief z `/10x-ui`: dwukierunkowy audyt widoku `src/pages/auth/signin.astro` (z `SignInForm`, `FormField`, `PasswordToggle`, `ServerError`, `SubmitButton`).

- Źródło → widoki: gdzie są tokeny i komponenty współdzielone, kto ich używa, rola `bg-cosmic`.
- Widok → źródło: każdy literał zmapowany na token lub komponent `ui/`.
- Architektura: co widzi osoba wchodząca na widok zalogowana, wylogowana oraz z linku z `?error=`.
- Wynik: 3–5 zarzutów (plik:linia + wpływ na użytkownika) pod `## Charges`, reszta jako deferred z powodem.

## Summary

Repo ma kontrakt systemu projektowego w wariancie **Tailwind v4 + shadcn/ui** (`components.json`, `src/styles/global.css`), ale widok logowania go nie czyta. W 6 sprawdzonych plikach widoku skan literałów daje **13 trafień** i **0 użyć klas tokenów** (`bg-primary`, `text-muted-foreground` itd.). Tokeny w `global.css` to neutralna (szara) paleta startera, a ciemny „kosmiczny” wygląd żyje wyłącznie w klasach palety w widokach i w gradiencie hex `bg-cosmic` (`global.css:113-115`). Na sprawdzonych plikach `src/` nikt nie ustawia klasy `.dark`. Wariant kontraktu: **świeży starter z martwym plikiem tokenów**.

Z `src/components/ui/` widok importuje jeden komponent (`Button`, w `SubmitButton.tsx:3`), a jego wariant kolorystyczny nadpisuje klasami palety. Pole formularza, karta i komunikat błędu są złożone ręcznie. Strona nie reaguje na zalogowanego użytkownika i wyświetla dowolny tekst z `?error=`.

Moment jest właściwy, bo plan S-02 (`context/changes/generate-card-proposals/plan.md:227`) każe nowej stronie `/generate` przyjąć „styl zgodny z `dashboard.astro` (`bg-cosmic`)”, czyli skopiować te same literały.

## Charges

| # | Kategoria | Gdzie (plik:linia) | Wpływ na użytkownika | Status |
|---|---|---|---|---|
| C1 | Brakujące tokeny | `src/pages/auth/signin.astro:10,11,15,17`; `src/components/auth/FormField.tsx:6,37,41`; tło `src/styles/global.css:113-115` | Zmiana marki lub trybu ciemnego w `global.css` nie dotrze do ekranu logowania, a każdy nowy ekran (np. `/generate` z S-02) skopiuje fiolet z literałów, więc aplikacja zacznie wyglądać niespójnie. | do planu |
| C2 | Brakujące tokeny (stany) | `src/components/auth/FormField.tsx:6,53,59`; `src/components/auth/PasswordToggle.tsx:13`; `src/components/auth/ServerError.tsx:11` | Osoba używająca klawiatury widzi fiolet przy fokusie pola (`focus:` zamiast `focus-visible:`), a na przełączniku hasła tylko domyślny obrys przeglądarki w kolorze `--ring` 50%. Kolor błędu jest literałem `red-*` zamiast `destructive`, więc stany fokusu i błędu rozjadą się przy pierwszej zmianie palety. | do planu |
| C3 | Brakujący komponent współdzielony | `src/components/auth/FormField.tsx:37-55` (input + label), `src/pages/auth/signin.astro:10` (karta), `src/components/auth/ServerError.tsx:11` (alert) | Każdy kolejny formularz (rejestracja już to robi, fiszki zrobią) powiela ręczne pole, kartę i komunikat, więc odstępy, promienie i zachowanie pól różnią się między ekranami. | do planu |
| C4 | Obejście istniejącego komponentu | `src/components/auth/SubmitButton.tsx:18,22` | Główny przycisk ma inny kolor niż `--primary` z `Button` (`ui/button.tsx:11`), więc w aplikacji są dwa różne „primary”, a poprawki `Button` nie trafiają do najważniejszej akcji logowania. | do planu |
| C5 | Architektura z przypadku | `src/pages/auth/signin.astro:5` + `src/components/auth/ServerError.tsx:11`; brak sprawdzenia `Astro.locals.user` w `signin.astro:1-6`; `src/pages/api/auth/signin.ts:16,19` | Ktoś może wysłać link `/auth/signin?error=<dowolny tekst>`, który wyświetli się w czerwonej ramce aplikacji jak komunikat systemowy. Zalogowana osoba ponownie widzi formularz, a po zalogowaniu trafia na `/`, nie na `/dashboard`. | do planu (częściowo, patrz Open Questions) |

Deferred (poza zakresem tej zmiany, z powodem):

- **D1 — język interfejsu.** Widok jest po angielsku (`signin.astro:8,12`, `SignInForm.tsx:21-26`), `Layout.astro:14` ma `lang="en"`, a `CLAUDE.md` wymaga komunikatów błędów API po polsku. Powód odroczenia: to decyzja produktowa dla całej aplikacji (wszystkie strony auth, `Topbar`, `dashboard`), a nie dla jednego widoku. Wyjątek: komunikaty błędów pokazywane przez ten widok wchodzą do C5.
- **D2 — `aria-invalid` / `aria-describedby`.** `FormField.tsx:44-54` nie łączy komunikatu błędu z polem. Komponent shadcn `input` ma style dla `aria-invalid`, więc to wpada do fazy stanów jako kryterium, a nie osobny zarzut.
- **D3 — pozostałe widoki z tymi samymi literałami.** `signup.astro:10-17`, `dashboard.astro:17-28`, `confirm-email.astro:22-29`, `Topbar.astro:24`, `Welcome.astro:5`. Powód: zasada „jeden widok na zmianę”. Wspólne komponenty `auth/` po poprawce zmienią też wygląd `signup` (patrz Architecture Insights). To efekt uboczny do odnotowania w planie, a nie cel.

## Detailed Findings

### Źródło → widoki: tokeny

- `components.json`: `style: new-york`, `baseColor: neutral`, `cssVariables: true`, CSS w `src/styles/global.css`, alias `ui` → `@/components/ui`.
- `src/styles/global.css:6-39` (`:root`) i `:41-75` (`.dark`): zestaw tokenów shadcn (`--primary`, `--muted-foreground`, `--destructive`, `--ring`, `--radius` itd.). Role bazowe (`--background` … `--ring`) poza `--destructive` mają w `:root` i `.dark` chromę 0, czyli są szare.
- `src/styles/global.css:77-111` (`@theme inline`) publikuje je jako `--color-*` przez `var(...)`. Surowych kolorów w `@theme inline` nie ma, więc warstwa tokenów nie ma klasycznego błędu trybu ciemnego.
- `src/styles/global.css:113-115`: `@utility bg-cosmic` to `linear-gradient` z trzema kolorami hex (`#0a0e1a`, `#0f1529`), poza systemem tokenów. Używają go `signin.astro:9`, `signup.astro:9`, `confirm-email.astro:22`, `dashboard.astro:16`, `Welcome.astro:5`.
- `src/styles/global.css:117-124` (`@layer base`): tokeny czyta `body` (`bg-background text-foreground`) i globalny `* { border-border outline-ring/50 }`.
- Klasy `.dark`: wyszukiwanie `class="dark` / `classList…dark` / `.dark` w `src/**/*.{astro,tsx,ts}` nie dało trafień. Tokeny `.dark` nie są więc aktywne na żadnej sprawdzonej stronie, a ciemny wygląd widoku pochodzi z literałów.

### Źródło → widoki: komponenty współdzielone

- `src/components/ui/` zawiera 2 pliki: `button.tsx`, `LibBadge.astro`. Nie ma `input`, `label`, `card`, `alert`.
- Importy z `@/components/ui` w `src/`: 1 plik, `src/components/auth/SubmitButton.tsx:3`.
- Komponenty `auth/` (`FormField`, `ServerError`, `SubmitButton`) są używane przez `SignInForm.tsx` i `SignUpForm.tsx` (wyszukiwanie po nazwach w `src/`).

### Widok → źródło: skan literałów

Skan z `/10x-ui` na plikach `signin.astro`, `SignInForm.tsx`, `FormField.tsx`, `PasswordToggle.tsx`, `ServerError.tsx`, `SubmitButton.tsx`: **13 trafień** (linie). Mapowanie:

| Plik:linia | Literał | Powinien pokryć |
|---|---|---|
| `signin.astro:10` | `border-white/10 bg-white/10 text-white` | `ui/card` (`bg-card text-card-foreground border`) |
| `signin.astro:11` | `from-blue-200 to-purple-200 … text-transparent` | `text-foreground` (lub token akcentu, jeśli plan go doda) |
| `signin.astro:15` | `text-blue-100/60` | `text-muted-foreground` |
| `signin.astro:17` | `text-purple-300` | `text-primary` / `Button variant="link"` |
| `FormField.tsx:6` | `bg-white/10 text-white placeholder-white/40` | `ui/input` (`bg-transparent border-input placeholder:text-muted-foreground`) |
| `FormField.tsx:37` | `text-blue-100/80` | `ui/label` |
| `FormField.tsx:41` | `text-white/40` | `text-muted-foreground` |
| `FormField.tsx:53` | `border-red-400/60 focus:ring-red-400` / `border-white/20 focus:ring-purple-400` | `aria-invalid` → `border-destructive`; `focus-visible:ring-ring/50` z `ui/input` |
| `FormField.tsx:59` | `text-red-300` | `text-destructive` |
| `PasswordToggle.tsx:13` | `text-white/40 hover:text-white/70` | `text-muted-foreground hover:text-foreground` / `Button variant="ghost" size="icon"` |
| `ServerError.tsx:11` | `border-red-500/30 bg-red-900/30 text-red-300` | `ui/alert variant="destructive"` |
| `SubmitButton.tsx:18` | `bg-purple-600 hover:bg-purple-500 text-white rounded-lg` | domyślny wariant `Button` (`bg-primary hover:bg-primary/90`) |
| `SubmitButton.tsx:22` | `border-white/30 border-t-white` (spinner) | `Loader2` z lucide + `animate-spin`, kolor z `currentColor` |

(`SignInForm.tsx` ma 0 trafień. Ten sam wzorzec ma `SignUpForm.tsx:59`, poza zakresem.)

### Architektura: wejścia do widoku

- **Wylogowany, bez parametrów**: formularz renderuje się poprawnie. `signin.astro` nie jest w `PROTECTED_ROUTES` (`src/middleware.ts:4`), więc to oczekiwane.
- **Zalogowany**: `signin.astro:1-6` nie czyta `Astro.locals.user`, które middleware ustawia na każdym żądaniu (`src/middleware.ts:9-16`). Zalogowana osoba widzi pusty formularz logowania. `dashboard.astro:3` pokazuje, że wzorzec czytania `Astro.locals` już jest w repo.
- **Z linku z `?error=`**: `signin.astro:5` czyta `error` z query stringu i przekazuje go do `ServerError` bez filtrowania. React escapuje tekst (`ServerError.tsx:14`), więc nie ma XSS, ale dowolny tekst wyświetla się w stylu komunikatu aplikacji (podmiana treści). Legalne źródła parametru na tej ścieżce to 2 przekierowania: `api/auth/signin.ts:11` (stały angielski tekst) i `:16` (surowy `error.message` z Supabase).
- **Po udanym logowaniu**: `api/auth/signin.ts:19` przekierowuje na `/`. `index.astro` renderuje `Welcome` (strona startera), a nie dashboard.
- **Brak konfiguracji Supabase**: `Layout.astro:21-33` pokazuje `Banner` z `missingConfigs`, a wysłanie formularza wraca z `?error=Supabase is not configured` (`signin.ts:11`). Zachowanie poprawne, komunikat po angielsku (D1).

### Plik zasad agenta

- `CLAUDE.md` (sekcja Conventions) mówi o `cn()` i Astro vs React, ale nie ma reguły o tokenach, katalogu `ui/` ani `npx shadcn add`. Nie znaleziono reguły zachęcającej do wartości arbitralnych. Brak reguły UI to luka do uzupełnienia w kroku „Utrwal to”, a nie zarzut przypadkowej architektury.
- `AGENTS.md` tylko wskazuje na `CLAUDE.md` (według `CLAUDE.md`). Nie sprawdzano `.cursor/rules`, `.windsurfrules` ani `copilot-instructions.md` (projekt pracuje w Claude Code).

## Code References

- `src/pages/auth/signin.astro:5` — `error` z query stringu bez filtrowania
- `src/pages/auth/signin.astro:9-20` — tło `bg-cosmic`, ręczna karta, gradient nagłówka, link z literałami
- `src/components/auth/FormField.tsx:5-6` — `inputBase` z literałami i `focus:ring-2`
- `src/components/auth/FormField.tsx:50-54` — kolory błędu/fokusu jako literały
- `src/components/auth/PasswordToggle.tsx:13` — brak własnego stylu fokusu
- `src/components/auth/ServerError.tsx:11` — ręczny alert z `red-*`
- `src/components/auth/SubmitButton.tsx:18-22` — nadpisanie wariantu `Button`, ręczny spinner
- `src/components/ui/button.tsx:7-11` — `buttonVariants` z `focus-visible:ring-ring/50` i `bg-primary`
- `src/styles/global.css:6-124` — tokeny, `@theme inline`, `bg-cosmic`, warstwa bazowa
- `src/middleware.ts:4,9-16` — `PROTECTED_ROUTES`, `locals.user`
- `src/pages/api/auth/signin.ts:11,16,19` — źródła `?error=` i przekierowanie po sukcesie
- `components.json` — konfiguracja shadcn (`new-york`, `neutral`, alias `ui`)

## Architecture Insights

- **Promień rażenia poprawki komponentów `auth/`.** `FormField`, `ServerError` i `SubmitButton` są współdzielone z `SignUpForm.tsx`. Przestawienie ich na tokeny i `ui/*` zmieni też wygląd `/auth/signup`, choć `signup.astro` (karta, nagłówek, link) zostanie z literałami. Plan musi to nazwać: zaakceptować rozjazd na `signup` do czasu osobnej zmiany albo objąć `signup.astro` tą samą kartą jako efekt uboczny.
- **Kosmiczny wygląd a tokeny.** Żeby widok wyglądał tak samo na tokenach, ciemne wartości muszą trafić do warstwy tokenów (np. aktywacja `.dark` na `<html>` w `Layout.astro` i wartości w `.dark` z fioletowym `--primary`), a nie zostać w klasach. Aktywacja `.dark` globalnie zmieni `body` na wszystkich stronach (`global.css:121-123`). Jest to wybór do planu (Open Questions).
- **Dryf się propaguje.** Plan S-02 (`generate-card-proposals/plan.md:227`) przepisuje literały `dashboard.astro` na nowy widok. Reguła UI w `CLAUDE.md` po tej zmianie powinna to zatrzymać.

## Historical Context (from prior changes)

- `context/changes/srs-review-session/research.md:63` — wcześniej odnotowano, że `signin.ts:11,16` przekazuje angielski i surowy komunikat Supabase w query stringu, niezgodnie z regułą błędów z `CLAUDE.md`. **Aktualne** na tym commicie (`signin.ts:11,16`).
- `context/changes/srs-review-session/research.md:66` — „komponenty UI z shadcn: tylko `button.tsx`”. **Częściowo aktualne**: w `ui/` jest też `LibBadge.astro` (komponent startera, nie z shadcn).
- `context/changes/generate-card-proposals/plan.md:227` — nowa strona `/generate` ma mieć „styl zgodny z `dashboard.astro` (`bg-cosmic`)”. Ryzyko propagacji literałów (patrz Architecture Insights).
- `context/foundation/lessons.md` — 3 wpisy (401 w API AI, sekret `SUPABASE_URL`, `revoke all`). Żaden nie dotyczy UI.

## Related Research

- `context/changes/srs-review-session/research.md` — endpointy auth i `PROTECTED_ROUTES`.

## Open Questions

1. **Gdzie żyje ciemny wygląd?** (a) `.dark` na `<html>` w `Layout.astro` i ciemne wartości w `.dark` (zmienia wszystkie strony), (b) ciemne wartości w `:root` (aplikacja jest tylko ciemna), (c) zostawić jasny motyw startera i porzucić „kosmos”. Decyzja produktowa dla `/10x-plan`.
2. **Gradient `bg-cosmic`**: przenieść do tokenów (np. `--background` + gradient budowany z tokenów) czy zastąpić płaskim `bg-background`?
3. **C5, zakres**: czy w tej zmianie (a) przekierować zalogowanego z `/auth/signin` na `/dashboard`, (b) zastąpić surowe `?error=<tekst>` kodem (`?error=invalid_credentials`) mapowanym na polski komunikat w widoku, (c) zmienić przekierowanie po sukcesie na `/dashboard`? Punkt (b) dotyka `api/auth/signin.ts`, więc wychodzi poza sam widok. Do decyzji w planie.
4. **`signup` jako efekt uboczny**: zaakceptować rozjazd czy objąć `signup.astro` tą samą kartą (patrz Architecture Insights)?
