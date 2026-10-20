# Kontrakt UI widoku logowania: plan brief

> Full plan: `context/changes/ui-signin-contract/plan.md`
> Research: `context/changes/ui-signin-contract/research.md`

## What & Why

Ekran logowania jest zbudowany z kolorów wpisanych na sztywno (13 trafionych linii skanu, 0 tokenów), choć repo ma tokeny i komponenty shadcn. Dzięki tej zmianie zmiana motywu dotrze do logowania, kolejne ekrany (np. `/generate` z S-02) nie skopiują literałów, a link z `?error=` przestanie wyświetlać dowolny tekst jako komunikat aplikacji.

## Starting Point

`global.css` ma szarą paletę startera, a kosmiczny wygląd żyje w klasach widoku i w hex w `bg-cosmic`. W `src/components/ui/` jest tylko `Button`, a `SubmitButton` nadpisuje jego kolor. Pole, karta i alert są złożone ręcznie i współdzielone z rejestracją.

## Desired End State

`/auth/signin` wygląda prawie tak samo, ale każdy kolor pochodzi z tokenu w `.dark`, a karta, pola, alert i przycisk to `ui/*`. Zalogowany trafia na `/dashboard`, a błędy w linku to kody z polskimi komunikatami. `/dev/kitchen-sink` (tylko dev) pokazuje 7 stanów. `CLAUDE.md` i pre-commit pilnują kontraktu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wariant kontraktu | Świeży starter z martwym plikiem tokenów | Tokeny istnieją, widok ich nie czyta, więc najpierw je podpinamy, zamiast wybierać motyw. | Research |
| Gdzie żyje ciemny wygląd | `class="dark"` na `<html>`, wartości w `.dark` | Style `dark:` w shadcn działają tylko z tą klasą, a jasna paleta zostaje na przyszły przełącznik. | Plan |
| Gradient `bg-cosmic` | Ta sama nazwa, gradient z `var(--background)` i nowego `--background-accent` | 4 inne strony zmieniają się bez edycji, a hex znika. | Plan |
| Zakres C5 | Przekierowanie zalogowanego, kody błędów → PL, `/dashboard` po logowaniu + smoke | Zamyka zarzut w całości, koszt to kilka linii w API i smoke. | Plan |
| `/auth/signup` | Tylko obudowa (karta, nagłówek, link) jako jawny efekt uboczny | Komponenty pól są wspólne, więc bez tego rejestracja miałaby nowe pola w starej karcie. | Plan |
| Kitchen-sink | `/dev/kitchen-sink`, 404 poza `import.meta.env.DEV` | Strona testowa myli użytkowników i nie daje im nic, a bramka działa lokalnie. | Plan |
| Język | Etykiety po angielsku, nowe komunikaty błędów po polsku | Zmiana języka to decyzja dla całej aplikacji (D1), a błędy podlegają regule z `CLAUDE.md`. | Research |

## Scope

**In scope:** `signin.astro`, `FormField`, `PasswordToggle`, `ServerError`, `SubmitButton`, `SignInForm`; `.dark` i `bg-cosmic` w `global.css`; `Layout.astro` (klasa `dark`); `ui/{input,label,card,alert}`; `api/auth/signin.ts`, `src/lib/auth-errors.ts`, `scripts/smoke.mjs`; obudowa `signup.astro` i podpowiedź w `SignUpForm.tsx`; kitchen-sink; reguła w `CLAUDE.md`; skan w `lint-staged`.

**Out of scope:** `dashboard`, `confirm-email`, `Topbar`, `Welcome` (poza tym, co dziedziczą przez `bg-cosmic`); `api/auth/signup.ts` i surowy `?error=` na rejestracji; przełącznik motywu; tłumaczenie UI; Playwright `toHaveScreenshot`.

## Architecture / Approach

Kolejność z `/10x-ui`: biblioteka → wartości tokenów → widok → stany. Faza 2 przenosi dzisiejszy wygląd do `.dark`, zanim widok zacznie czytać tokeny, więc podmiana klas w fazie 3 nie zmienia wyglądu, a każdą różnicę na zrzucie da się przypisać jednej fazie. Skan literałów po każdej fazie wizualnej ma spadać do 0.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Biblioteka | `ui/{input,label,card,alert}` | CLI shadcn chce nadpisać `button.tsx` |
| 2. Wartości tokenów | `.dark` na `<html>`, kosmos w tokenach, `bg-cosmic` z `var()` | Półprzezroczyste tokeny (`--card`, `--input`) wyglądają inaczej niż `white/10` |
| 3. Jeden widok | Widok + obudowa signup na `ui/*`, skan = 0 | Zmiana wyglądu rejestracji przez współdzielone komponenty |
| 4. Punkty wejścia | Przekierowania, kody błędów PL, smoke | `error.code` Supabase pusty dla części błędów → komunikat ogólny |
| 5. Stany i bramka | Kitchen-sink z 7 stanami, 4 zrzuty | `useFormStatus` nie do wymuszenia → prop `pending` |
| 6. Utrwalenie | Reguła w `CLAUDE.md`, skan w pre-commit, liczby przed/po | Reguła za długa albo zbyt ogólna, by agent jej użył |

**Prerequisites:** `npm run dev` działa; lokalny Supabase (`npx supabase start`) do `npm run smoke` w fazie 4; `playwright-cli` (opcjonalnie) do zrzutów.
**Estimated effort:** ~2 sesje: fazy 1–3 w pierwszej, 4–6 w drugiej.

## Open Risks & Assumptions

- Zakładamy, że `npx shadcn@latest add` działa z Tailwind 4.2 i `components.json` w stylu `new-york` bez `init`.
- Tło `body` zmienia się na ciemne na wszystkich stronach. Dziś przykrywa je `bg-cosmic`, ale strona bez tej klasy dostanie ciemne tło.
- Rejestracja nadal pokazuje surowy `?error=` (poza zakresem). Zarzut zostaje do osobnej zmiany.

## Success Criteria (Summary)

- Logowanie wygląda jak dziś, ale skan literałów daje 0, a zmiana `--primary` w `.dark` zmienia przycisk.
- Link z dowolnym `?error=` nie pokazuje tego tekstu, a zalogowany nie widzi formularza.
- Nowa sesja agenta, poproszona o zmianę w tym widoku, sięga po tokeny i `ui/*`.
