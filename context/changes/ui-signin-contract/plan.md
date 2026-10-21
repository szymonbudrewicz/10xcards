# Kontrakt UI widoku logowania: plan implementacji

## Overview

Widok logowania (`src/pages/auth/signin.astro` i 5 komponentów z `src/components/auth/`) przechodzi z literałów palety Tailwind na tokeny shadcn z `src/styles/global.css` i komponenty z `src/components/ui/`. Przy okazji zamykamy zarzut C5 (punkty wejścia), pokrywamy 7 stanów stroną kitchen-sink i zostawiamy regułę oraz kontrolę w pre-commit, żeby kolejny agent nie wrócił do literałów. Zarzuty C1–C5 i odroczenia D1–D3: `research.md` → `## Charges`.

## Current State Analysis

- Repo ma kontrakt shadcn (`components.json`: `new-york`, `neutral`, `cssVariables: true`), ale widok go nie czyta: 13 trafionych linii skanu literałów w 6 plikach widoku, 0 klas tokenów (`research.md`, „Widok → źródło”).
- Tokeny w `global.css:6-75` to szara paleta startera. Ciemny „kosmiczny” wygląd żyje w klasach palety i w `@utility bg-cosmic` z hex (`global.css:113-115`). Nikt nie ustawia klasy `.dark`.
- `src/components/ui/` ma tylko `button.tsx` i `LibBadge.astro`. `SubmitButton.tsx:18` nadpisuje kolor `Button` fioletem.
- `FormField`, `ServerError` i `SubmitButton` są współdzielone z `SignUpForm.tsx`.
- `signin.astro:5` wyświetla dowolny tekst z `?error=`. Strona nie sprawdza `Astro.locals.user`. `api/auth/signin.ts:19` przekierowuje po sukcesie na `/`.
- `scripts/smoke.mjs:93-96` oczekuje po udanym logowaniu przekierowania dokładnie na `/` (`exact: true`). `:88-91` sprawdza przy złym haśle tylko prefiks `/auth/signin?error=`.
- `.husky/pre-commit` → `npx lint-staged` (`package.json:59-66`: `eslint --fix` na `*.{ts,tsx,astro}`, `prettier` na `*.{json,css,md}`).

## Desired End State

- `/auth/signin` wygląda jak dziś (ciemne tło z gradientem, półprzezroczysta karta, fioletowa akcja), ale każdy kolor pochodzi z tokenu w bloku `.dark` w `global.css`, a karta, pola, etykiety, alert i przycisk to komponenty z `src/components/ui/`.
- Skan literałów z `/10x-ui` na plikach widoku daje 0 trafień (przed: 13).
- Zalogowana osoba wchodząca na `/auth/signin` trafia na `/dashboard`. Po udanym logowaniu trafia na `/dashboard`. `?error=` niesie kod, a widok pokazuje polski komunikat. Nieznany kod lub dowolny tekst w linku daje jeden ogólny komunikat.
- `/dev/kitchen-sink` (tylko w trybie dev) pokazuje 7 stanów, a zrzuty desktop i 390 px leżą w folderze zmiany.
- `CLAUDE.md` ma blok UI, a pre-commit odrzuca literał w oczyszczonych plikach.

### Key Discoveries:

- `src/components/ui/button.tsx:7` ma już `focus-visible:ring-ring/50` i `disabled:opacity-50`. Domyślny wariant (`:11`) daje `bg-primary`, więc wystarczy usunąć nadpisanie w `SubmitButton.tsx:18`.
- Style `dark:` w komponentach shadcn (`button.tsx:15`, przyszły `input`) działają tylko przy `.dark` na przodku. To przesądziło o `class="dark"` na `<html>` (decyzja planu).
- Paleta Tailwind v4 jest w oklch, więc obecne literały mapują się 1:1 na wartości tokenów (np. `red-400` = `oklch(0.704 0.191 22.216)`, czyli dokładnie dzisiejsze `--destructive` w `.dark`, `global.css:56`).
- `Banner.astro` ma własne kolory w `<style>` i nie zależy od tokenów, więc `.dark` go nie zmieni.

## What We're NOT Doing

- Język interfejsu (D1): etykiety i nagłówki zostają po angielsku. Po polsku są tylko nowe komunikaty błędów logowania, zgodnie z regułą błędów z `CLAUDE.md`.
- Pozostałe widoki z literałami (D3): `dashboard.astro`, `confirm-email.astro`, `Topbar.astro`, `Welcome.astro`, `index.astro`. Zmienia się tylko to, co dziedziczą przez `bg-cosmic` i tło `body`.
- `signup.astro` poza obudową (karta, nagłówek, link) oraz `api/auth/signup.ts`. Rejestracja nadal pokazuje surowy `?error=` (ten sam problem co C5). Do osobnej zmiany.
- Przełącznik jasny/ciemny motyw. Jasna paleta w `:root` zostaje nietknięta.
- Playwright `toHaveScreenshot` i nowe zależności testowe (moduł 3).
- `shadcn init`: repo ma już `components.json`.

## Implementation Approach

Kolejność z `/10x-ui`: biblioteka → wartości tokenów → jeden widok → stany. Faza 2 przenosi dzisiejszy wygląd do warstwy tokenów bez dotykania widoku. Dzięki temu w fazie 3 podmiana klas nie zmienia wyglądu, a każdą różnicę na zrzucie da się przypisać jednej fazie. C5 (faza 4) jest niezależna od wyglądu i idzie po widoku, żeby nowe komunikaty od razu trafiły do `Alert`. Stany (faza 5) ocenia się na widoku zbudowanym już z tokenów.

Skan literałów (wzorzec z `/10x-ui`) uruchamiamy po każdej fazie wizualnej na plikach widoku:
`src/pages/auth/signin.astro src/components/auth/{SignInForm,FormField,PasswordToggle,ServerError,SubmitButton}.tsx`.

## Critical Implementation Details

- **Kolejność w `global.css`.** Nowe tokeny tła gradientu muszą być zdefiniowane w `.dark` i użyte w `@utility bg-cosmic` przez `var(...)`. Surowe kolory nie mogą trafić do `@theme inline`, bo to klasyczny błąd trybu ciemnego.
- **`SubmitButton` i `useFormStatus`.** Stan ładowania pochodzi z `useFormStatus()`, którego nie da się wymusić poza wysłaniem formularza. Kitchen-sink potrzebuje opcjonalnego propa `pending?: boolean`, który ma pierwszeństwo przed `useFormStatus().pending`. Formularze w aplikacji go nie przekazują.

## Phase 1: Biblioteka komponentów

### Overview

Dodajemy brakujące komponenty shadcn, z których skorzysta widok. Ekran się nie zmienia.

### Changes Required:

#### 1. Komponenty shadcn

**File**: `src/components/ui/{input,label,card,alert}.tsx` (nowe), ewentualnie `package.json` / `package-lock.json`

**Intent**: Dać widokowi gotowe pole, etykietę, kartę i alert zamiast ręcznych kopii (C3).

**Contract**: `npx shadcn@latest add input label card alert` w istniejącej konfiguracji `components.json`. Bez `init` i bez nadpisywania `button.tsx` (jeśli CLI zapyta o nadpisanie, odpowiedź „nie”). Jedyna dopuszczalna nowa zależność to ta, której wymagają te komponenty (`@radix-ui/react-label`).

### Success Criteria:

#### Automated Verification:

- 4 nowe pliki istnieją w `src/components/ui/`, a `git diff --stat src/components/ui/button.tsx` jest pusty
- `npx astro check` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- `/auth/signin` wygląda tak samo jak przed fazą (nic go jeszcze nie importuje)

**Implementation Note**: Po fazie i przejściu automatycznych kontroli zatrzymaj się na ręczne potwierdzenie przed następną fazą.

---

## Phase 2: Wartości tokenów

### Overview

Przenosimy kosmiczny wygląd do warstwy tokenów: `.dark` na `<html>`, wartości z dzisiejszych literałów w bloku `.dark`, `bg-cosmic` z tokenów. Widok jeszcze ich nie czyta, więc zmienić się może najwyżej tło `body` pod `bg-cosmic`.

### Changes Required:

#### 1. Aktywacja motywu ciemnego

**File**: `src/layouts/Layout.astro`

**Intent**: Włączyć tokeny `.dark` i warianty `dark:` shadcn na wszystkich stronach.

**Contract**: `<html lang="en" class="dark">`. Nic więcej w layoucie.

#### 2. Wartości `.dark`

**File**: `src/styles/global.css` (blok `.dark`, `:41-75`)

**Intent**: Wpisać do ról wartości, które dziś żyją w klasach widoku, żeby faza 3 mogła je podmienić bez zmiany wyglądu.

**Contract**: Mapowanie literał → rola (wartości oklch z palety Tailwind v4 lub ich odpowiednik z kanałem alfa):

| Dzisiejszy literał | Rola w `.dark` |
|---|---|
| `#0a0e1a` (tło `bg-cosmic`) | `--background` |
| `#0f1529` (środek gradientu) | nowy `--background-accent` |
| `text-white` | `--foreground`, `--card-foreground` |
| `bg-white/10`, `border-white/10` (karta) | `--card`, `--border` |
| `bg-white/10`, `border-white/20` (pole) | `--input` |
| `text-blue-100/60`, `text-white/40` | `--muted-foreground` |
| `bg-purple-600`, `hover:bg-purple-500` | `--primary` (hover zostaje `bg-primary/90` z `Button`), `--primary-foreground` = biały |
| `focus:ring-purple-400` | `--ring` |
| `text-purple-300` (link) | `--accent-foreground` lub `--primary` — wybór implementującego, zapisany w `tokens.md` |
| `red-400` / `red-300` | `--destructive` (zostaje `oklch(0.704 0.191 22.216)`) |

Role spoza tabeli (`--chart-*`, `--sidebar-*`, `--popover`, `--secondary`, `--muted`, `--accent`) zostają bez zmian, chyba że kontrast na kitchen-sink tego wymaga. Obok bloku `.dark` krótki komentarz: wartości pochodzą z literałów widoku logowania, szczegóły w `context/changes/ui-signin-contract/tokens.md`.

#### 3. `bg-cosmic` z tokenów

**File**: `src/styles/global.css` (`:113-115`)

**Intent**: Usunąć hex z utility, zachowując nazwę i wygląd 5 stron, które jej używają.

**Contract**: `linear-gradient(to bottom, var(--background), var(--background-accent), var(--background))`. Bez nowych wpisów w `@theme inline`.

#### 4. Zapis wartości

**File**: `context/changes/ui-signin-contract/tokens.md` (nowy)

**Intent**: Zapisać wartości w repo, żeby kolejna sesja ich nie wymyślała.

**Contract**: Tabela rola → wartość → źródło (literał i plik:linia sprzed zmiany).

### Success Criteria:

#### Automated Verification:

- `grep -nE '#[0-9a-fA-F]{3,8}' src/styles/global.css` nie zwraca linii z `bg-cosmic`
- `npx astro check` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Zrzuty `/auth/signin`, `/`, `/dashboard` (desktop) wyglądają jak przed fazą, a gradient jest widoczny
- Banner braku konfiguracji (jeśli występuje) wygląda bez zmian

**Implementation Note**: Po fazie i przejściu automatycznych kontroli zatrzymaj się na ręczne potwierdzenie przed następną fazą.

---

## Phase 3: Jeden widok

### Overview

Widok logowania i współdzielone komponenty `auth/` przechodzą na tokeny i `ui/*` (C1, C3, C4). Obudowa `signup.astro` dostaje tę samą kartę jako jawny efekt uboczny.

### Changes Required:

#### 1. Strona logowania

**File**: `src/pages/auth/signin.astro`

**Intent**: Karta z `ui/card`, nagłówek i link na tokenach (C1, C3).

**Contract**: `bg-cosmic` zostaje na wrapperze. Karta = `Card` (z `CardHeader`/`CardTitle`/`CardContent`/`CardFooter` według potrzeb) z `backdrop-blur-xl`, jeśli efekt szkła ma zostać. Nagłówek bez gradientu tekstu: `text-foreground`. Tekst pomocniczy: `text-muted-foreground`. Link: token wybrany w fazie 2. Komponenty React w pliku `.astro` renderują się statycznie (bez `client:*`).

#### 2. Pole formularza

**File**: `src/components/auth/FormField.tsx`

**Intent**: Zastąpić ręczne pole i etykietę komponentami `Input` i `Label` (C3), błąd na `destructive` (C2).

**Contract**: Props bez zmian (`SignUpForm` też ich używa). Ikona `text-muted-foreground`. Błąd: `aria-invalid={!!error}` na `Input` oraz `aria-describedby` wskazujące `id` komunikatu. Komunikat `text-destructive`. Lewy padding pod ikonę przez `className` na `Input` (`pl-10`, a nie wartość arbitralna). Usunięty `inputBase`.

#### 3. Przełącznik hasła

**File**: `src/components/auth/PasswordToggle.tsx`

**Intent**: Kontrolka z fokusem z tokenu zamiast gołego `<button>` (C2).

**Contract**: `Button variant="ghost" size="icon"` (wariant może dostać mniejszy rozmiar przez `className`), pozycjonowany absolutnie jak dziś. `aria-label` bez zmian. Kolor ikony `text-muted-foreground hover:text-foreground`.

#### 4. Błąd serwera

**File**: `src/components/auth/ServerError.tsx`

**Intent**: `Alert variant="destructive"` zamiast ręcznego alertu (C3).

**Contract**: Props bez zmian. `role="alert"` (shadcn `Alert` go ustawia). Ikona `CircleAlert`.

#### 5. Przycisk wysyłania

**File**: `src/components/auth/SubmitButton.tsx`

**Intent**: Domyślny wariant `Button` bez nadpisywania koloru (C4), spinner z lucide, `pending` do wymuszenia w kitchen-sink.

**Contract**: `className="w-full"` i nic kolorystycznego. Spinner: `Loader2` z `animate-spin`. Nowy opcjonalny prop `pending?: boolean`, który ma pierwszeństwo przed `useFormStatus().pending`.

#### 6. Obudowa rejestracji (efekt uboczny)

**File**: `src/pages/auth/signup.astro`, `src/components/auth/SignUpForm.tsx:59`

**Intent**: Ta sama karta, nagłówek i link co w logowaniu, żeby nowe pola nie siedziały w starej szklanej karcie. Podpowiedź długości hasła na `text-muted-foreground`.

**Contract**: Te same klasy i komponenty co w `signin.astro`. Logika i teksty `SignUpForm` bez zmian.

### Success Criteria:

#### Automated Verification:

- Skan literałów `/10x-ui` na plikach widoku daje 0 trafień
- Ten sam skan na `src/pages/auth/signup.astro src/components/auth/SignUpForm.tsx` daje 0 trafień
- `npx astro check` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Zrzut `/auth/signin` (desktop i 390 px) jest bliski zrzutowi sprzed zmiany, a różnice są wymienione w `tokens.md`
- `/auth/signup` wygląda spójnie z logowaniem
- Logowanie i rejestracja działają tak jak przed fazą (walidacja klienta, pokazywanie hasła, wysyłka)

**Implementation Note**: Po fazie i przejściu automatycznych kontroli zatrzymaj się na ręczne potwierdzenie przed następną fazą.

---

## Phase 4: Punkty wejścia

### Overview

Zamykamy C5: zalogowany nie widzi formularza, link z dowolnym tekstem nie podrabia komunikatu, a po zalogowaniu trafia się do aplikacji.

### Changes Required:

#### 1. Mapowanie kodów błędów

**File**: `src/lib/auth-errors.ts` (nowy)

**Intent**: Jedno miejsce, które zamienia kod z linku na polski komunikat i odrzuca wszystko inne.

**Contract**: `signInErrorMessage(code: string | null): string | null`. Dla `null`/pustego zwraca `null`. Znane kody: `invalid_credentials` („Nieprawidłowy e-mail lub hasło.”), `email_not_confirmed` („Potwierdź adres e-mail, zanim się zalogujesz.”), `auth_unavailable` („Logowanie jest chwilowo niedostępne.”). Każda inna wartość zwraca ogólny komunikat („Nie udało się zalogować. Spróbuj ponownie.”), nigdy samą wartość parametru.

#### 2. Endpoint logowania

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Do linku trafia kod, a nie tekst. Po sukcesie przekierowanie na `/dashboard`.

**Contract**: Brak klienta Supabase (`:11`) → `?error=auth_unavailable`. Błąd Supabase (`:16`) → `?error=<error.code>`, a przy braku kodu `?error=unknown`. Sukces (`:19`) → `/dashboard`.

#### 3. Strona logowania

**File**: `src/pages/auth/signin.astro`

**Intent**: Zalogowany trafia na `/dashboard`, a `ServerError` dostaje komunikat z mapowania.

**Contract**: Na początku frontmattera: `Astro.locals.user` → `Astro.redirect("/dashboard")`. `serverError={signInErrorMessage(Astro.url.searchParams.get("error"))}`.

#### 4. Smoke

**File**: `scripts/smoke.mjs:93-96`

**Intent**: Smoke ma odzwierciedlać nowe przekierowanie po sukcesie.

**Contract**: `location: "/dashboard", exact: true`. Krok złego hasła (`:88-91`) bez zmian (prefiks nadal pasuje).

### Success Criteria:

#### Automated Verification:

- `npx astro check` przechodzi
- `npm run lint` przechodzi
- `npm run smoke` przechodzi na lokalnym serwerze z lokalnym Supabase

#### Manual Verification:

- Zalogowany wchodzi na `/auth/signin` → trafia na `/dashboard`
- `/auth/signin?error=Twoje%20konto%20zablokowane` pokazuje ogólny komunikat, a nie ten tekst
- Złe hasło pokazuje „Nieprawidłowy e-mail lub hasło.”

**Implementation Note**: Po fazie i przejściu automatycznych kontroli zatrzymaj się na ręczne potwierdzenie przed następną fazą.

---

## Phase 5: Stany i bramka wizualna

### Overview

Pokazujemy 7 stanów naraz na stronie kitchen-sink dostępnej tylko w dev i robimy zrzuty (C2, D2).

### Changes Required:

#### 1. Kitchen-sink

**File**: `src/pages/dev/kitchen-sink.astro` (nowy)

**Intent**: Jeden ekran ze wszystkimi stanami widoku logowania jako bramka i dowód do przeglądu.

**Contract**: Poza `import.meta.env.DEV` zwraca 404 (`new Response(null, { status: 404 })`). Layout + `bg-cosmic`. Siatka kart z podpisem stanu, każda zbudowana z tych samych komponentów co widok (`FormField`, `PasswordToggle`, `ServerError`, `SubmitButton` z `pending`, `Card`). Interaktywne komórki (hover, focus) jako wyspa React z `client:load`. Strona nie wysyła formularzy (`<form>` bez `action` albo z `onSubmit` blokującym wysyłkę).

#### 2. Macierz 7 stanów

**File**: `src/pages/dev/kitchen-sink.astro`, poprawki w komponentach `auth/` tylko jeśli stan tego wymaga

**Intent**: Każda komórka pokazana albo N/A z powodem.

**Contract**:

| Stan | Co ma być widać |
|---|---|
| default | pusty formularz z tokenów |
| hover | przycisk `bg-primary/90`, przełącznik hasła `text-foreground` |
| focus-visible | pierścień `--ring` na polu, przełączniku i przycisku; brak pierścienia po kliknięciu myszą |
| disabled | `Input disabled` i `SubmitButton pending`, czytelne |
| error | błąd pola (`aria-invalid`, komunikat `text-destructive` obok pola) oraz `ServerError` z komunikatem z `auth-errors.ts` |
| empty | N/A: widok nie wyświetla danych. Odpowiednikiem jest default (puste pola z placeholderami) |
| loading | `SubmitButton pending`: spinner + tekst, przycisk tej samej szerokości i wysokości |

#### 3. Zrzuty

**File**: `context/changes/ui-signin-contract/screenshots/` (nowy katalog)

**Intent**: Dowód wizualny bramki w repo.

**Contract**: `kitchen-sink-desktop.png` i `kitchen-sink-390.png` (pełna strona) oraz `signin-desktop.png` i `signin-390.png`, np. przez `playwright-cli` (`open`, `screenshot --full-page`, `resize 390 844`).

### Success Criteria:

#### Automated Verification:

- `npm run build` przechodzi, a `dist` nie serwuje `/dev/kitchen-sink` (w `npm run preview` odpowiedź 404)
- Skan literałów na plikach widoku nadal daje 0 trafień
- 4 zrzuty istnieją w `context/changes/ui-signin-contract/screenshots/`

#### Manual Verification:

- Każda komórka macierzy jest widoczna na zrzucie lub oznaczona N/A z powodem
- Fokus z klawiatury (Tab) jest widoczny na polu e-mail, polu hasła, przełączniku i przycisku, w tej kolejności
- Czytnik ekranu / devtools: pole z błędem ma `aria-invalid="true"` i jest powiązane z komunikatem

**Implementation Note**: Po fazie i przejściu automatycznych kontroli zatrzymaj się na ręczne potwierdzenie przed następną fazą.

---

## Phase 6: Utrwalenie kontraktu

### Overview

Reguła i kontrola, które utrzymają kolejnego agenta przy tokenach i `ui/*`.

### Changes Required:

#### 1. Reguła UI

**File**: `CLAUDE.md` (sekcja Conventions lub nowa sekcja `## UI`, poza blokiem `<!-- BEGIN @przeprogramowani/10x-cli -->`, jeśli istnieje)

**Intent**: Powiedzieć agentowi, gdzie są tokeny i komponenty i czego nie wpisywać w widokach.

**Contract**: Maks. 6 linii. Tokeny: `src/styles/global.css` (`:root`/`.dark` → `@theme inline`), aplikacja działa w `.dark`. Komponenty: `src/components/ui/`, sprawdź przed utworzeniem nowego, brakujące przez `npx shadcn@latest add <name>`. W widokach brak klas palety (`bg-purple-600`, `text-white/40`), hex i wartości arbitralnych, tylko role (`bg-primary`, `text-muted-foreground`). Kitchen-sink: `/dev/kitchen-sink` (tylko dev). Treść do zatwierdzenia przez użytkownika.

#### 2. Kontrola w pre-commit

**File**: `scripts/ui-literal-scan.mjs` (nowy), `package.json` (`lint-staged`)

**Intent**: Pre-commit odrzuca literał w oczyszczonych plikach, zanim zrobi to przegląd.

**Contract**: Skrypt bez zależności. Dostaje ścieżki plików, sprawdza tylko te z listy oczyszczonych plików (widok, `signup.astro`, `SignUpForm.tsx`, kitchen-sink) wzorcem z `/10x-ui`, wypisuje `plik:linia` i kończy się kodem 1 przy trafieniu. W `lint-staged` dodany do wzorca `*.{ts,tsx,astro}` obok `eslint --fix`.

#### 3. Liczby przed i po

**File**: `context/changes/ui-signin-contract/tokens.md`

**Intent**: Ślad skuteczności zmiany.

**Contract**: Sekcja „Skan literałów”: przed 13 (6 plików widoku), po 0, z poleceniem skanu.

### Success Criteria:

#### Automated Verification:

- `node scripts/ui-literal-scan.mjs src/pages/auth/signin.astro` kończy się kodem 0
- Ten sam skrypt na pliku z dopisaną tymczasowo klasą `bg-purple-600` (tylko lokalnie, bez commita) kończy się kodem 1
- `npm run lint` przechodzi

#### Manual Verification:

- Treść reguły UI w `CLAUDE.md` zatwierdzona przez użytkownika
- Nowa sesja agenta, poproszona o drobną zmianę w widoku logowania (np. dodanie linku „Nie pamiętasz hasła?”), sięga po tokeny i `ui/*`

**Implementation Note**: Po fazie i przejściu automatycznych kontroli zatrzymaj się na ręczne potwierdzenie, a potem `/10x-impl-review ui-signin-contract`.

---

## Testing Strategy

### Unit Tests:

- Brak runnera testów jednostkowych w repo. `signInErrorMessage` sprawdzany ręcznie przez URL-e z fazy 4.

### Integration Tests:

- `npm run smoke`: pełny przepływ rejestracja → logowanie → `/dashboard` → wylogowanie z nowym przekierowaniem.

### Manual Testing Steps:

1. Wylogowany: `/auth/signin` → formularz, Tab przez wszystkie kontrolki z widocznym fokusem.
2. Puste pola + wyślij → błędy pod polami w kolorze `destructive`, pola z `aria-invalid`.
3. Złe hasło → „Nieprawidłowy e-mail lub hasło.”
4. `/auth/signin?error=<dowolny tekst>` → ogólny komunikat.
5. Poprawne dane → `/dashboard`. Potem wejście na `/auth/signin` → `/dashboard`.
6. `/auth/signup` → spójny wygląd, rejestracja działa.
7. `/dev/kitchen-sink` w dev → 7 stanów. W `npm run preview` → 404.

## Performance Considerations

Nie dotyczy: zmiana klas i 4 małe komponenty. `backdrop-blur` zostaje tylko tam, gdzie był.

## Migration Notes

Nie dotyczy: brak danych. Wycofanie to `git revert` commitów faz. `.dark` na `<html>` można zdjąć jedną linią w `Layout.astro`.

## References

- Research: `context/changes/ui-signin-contract/research.md`
- Skill: `.claude/skills/10x-ui/SKILL.md` (kolejność faz, macierz 7 stanów, skan literałów, „Utrwal to”)
- Wzorzec czytania `Astro.locals`: `src/pages/dashboard.astro:3`
- Komponent bazowy: `src/components/ui/button.tsx:7-36`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Biblioteka komponentów

#### Automated

- [x] 1.1 4 nowe pliki istnieją w `src/components/ui/`, a `git diff --stat src/components/ui/button.tsx` jest pusty — 78948d0
- [x] 1.2 `npx astro check` przechodzi — 78948d0
- [x] 1.3 `npm run lint` przechodzi — 78948d0
- [x] 1.4 `npm run build` przechodzi — 78948d0

#### Manual

- [x] 1.5 `/auth/signin` wygląda tak samo jak przed fazą (nic go jeszcze nie importuje) — 78948d0

### Phase 2: Wartości tokenów

#### Automated

- [x] 2.1 `grep -nE '#[0-9a-fA-F]{3,8}' src/styles/global.css` nie zwraca linii z `bg-cosmic` — 142e36c
- [x] 2.2 `npx astro check` przechodzi — 142e36c
- [x] 2.3 `npm run build` przechodzi — 142e36c

#### Manual

- [x] 2.4 Zrzuty `/auth/signin`, `/`, `/dashboard` (desktop) wyglądają jak przed fazą, a gradient jest widoczny — 142e36c
- [x] 2.5 Banner braku konfiguracji (jeśli występuje) wygląda bez zmian — 142e36c

### Phase 3: Jeden widok

#### Automated

- [x] 3.1 Skan literałów `/10x-ui` na plikach widoku daje 0 trafień — 31e043d
- [x] 3.2 Ten sam skan na `src/pages/auth/signup.astro src/components/auth/SignUpForm.tsx` daje 0 trafień — 31e043d
- [x] 3.3 `npx astro check` przechodzi — 31e043d
- [x] 3.4 `npm run lint` przechodzi — 31e043d
- [x] 3.5 `npm run build` przechodzi — 31e043d

#### Manual

- [x] 3.6 Zrzut `/auth/signin` (desktop i 390 px) jest bliski zrzutowi sprzed zmiany, a różnice są wymienione w `tokens.md` — 31e043d
- [x] 3.7 `/auth/signup` wygląda spójnie z logowaniem — 31e043d
- [x] 3.8 Logowanie i rejestracja działają tak jak przed fazą (walidacja klienta, pokazywanie hasła, wysyłka) — 31e043d

### Phase 4: Punkty wejścia

#### Automated

- [x] 4.1 `npx astro check` przechodzi — 9e3df00
- [x] 4.2 `npm run lint` przechodzi — 9e3df00
- [x] 4.3 `npm run smoke` przechodzi na lokalnym serwerze z lokalnym Supabase — b46cd7c

#### Manual

- [x] 4.4 Zalogowany wchodzi na `/auth/signin` → trafia na `/dashboard` — 9e3df00
- [x] 4.5 `/auth/signin?error=Twoje%20konto%20zablokowane` pokazuje ogólny komunikat, a nie ten tekst — 9e3df00
- [x] 4.6 Złe hasło pokazuje „Nieprawidłowy e-mail lub hasło.” — 9e3df00

### Phase 5: Stany i bramka wizualna

#### Automated

- [x] 5.1 `npm run build` przechodzi, a `dist` nie serwuje `/dev/kitchen-sink` (w `npm run preview` odpowiedź 404) — e497461
- [x] 5.2 Skan literałów na plikach widoku nadal daje 0 trafień — e497461
- [x] 5.3 4 zrzuty istnieją w `context/changes/ui-signin-contract/screenshots/` — e497461

#### Manual

- [x] 5.4 Każda komórka macierzy jest widoczna na zrzucie lub oznaczona N/A z powodem — e497461
- [x] 5.5 Fokus z klawiatury (Tab) jest widoczny na polu e-mail, polu hasła, przełączniku i przycisku, w tej kolejności — e497461
- [x] 5.6 Czytnik ekranu / devtools: pole z błędem ma `aria-invalid="true"` i jest powiązane z komunikatem — e497461

### Phase 6: Utrwalenie kontraktu

#### Automated

- [x] 6.1 `node scripts/ui-literal-scan.mjs src/pages/auth/signin.astro` kończy się kodem 0 — 4dc7600
- [x] 6.2 Ten sam skrypt na pliku z dopisaną tymczasowo klasą `bg-purple-600` (tylko lokalnie, bez commita) kończy się kodem 1 — 4dc7600
- [x] 6.3 `npm run lint` przechodzi — 4dc7600

#### Manual

- [x] 6.4 Treść reguły UI w `CLAUDE.md` zatwierdzona przez użytkownika — 4dc7600
- [x] 6.5 Nowa sesja agenta, poproszona o drobną zmianę w widoku logowania (np. dodanie linku „Nie pamiętasz hasła?”), sięga po tokeny i `ui/*` — 4dc7600
