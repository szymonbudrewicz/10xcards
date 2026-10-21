<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Kontrakt UI widoku logowania

- **Plan**: context/changes/ui-signin-contract/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-10-21
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Uzasadnione odstępstwa od planu (zapisane w `tokens.md` i w commitach): `--link` i `--accent`, `@radix-ui/react-label` zamiast `radix-ui`, przekierowanie zalogowanego i 404 dla `/dev/*` w `src/middleware.ts`, siatka kitchen-sink w `src/components/dev/SignInStates.tsx`, skan w CI zamiast samego pre-commit (husky niepodłączony). Pliki spoza zakresu (`button.tsx`, `dashboard.astro`, `Topbar.astro`, `confirm-email.astro`, `api/auth/signup.ts`) bez zmian.

## Triage

Fixed: F2, F3, F6, F8 (4) · Rule: F5 (1) · Deferred: F4 (1) · Accepted: F1 (1) · Skipped: F7 (1)

## Findings

### F1 — Smoke test (4.3) jeszcze niepotwierdzony

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:95, plan.md Progress 4.3
- **Detail**: Jedyny test integracyjny zmiany (przekierowanie na `/dashboard` po logowaniu) nie został uruchomiony, bo lokalnie nie ma Dockera i Supabase. Zgodnie z ustaleniem sprawdzi go job `smoke` w CI.
- **Fix**: Otworzyć PR, poczekać na zielony job `smoke`, dopiero wtedy odhaczyć 4.3 i zamknąć plan.
- **Decision**: ACCEPTED — weryfikuje job `smoke` w CI na PR; 4.3 odhaczane po zielonym CI

### F2 — Skan literałów przepuszcza część klas palety

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ui-literal-scan.mjs:23-26
- **Detail**: Wzorzec z `/10x-ui` nie łapie m.in. `placeholder-white/40` (dokładnie tej klasy używał stary `FormField`), `border-t-white`, `ring-offset-*`, `caret-*`, `accent-*`, `decoration-*` ani wartości arbitralnych w `%`/`vh`/`em`. Kontrola w CI przepuściłaby taki powrót literałów.
- **Fix**: Rozszerzyć prefiksy o `placeholder|caret|accent|decoration`, opcjonalny segment strony (`border(-[xytrbl])?`) i `ring(-offset)?`, a jednostki o `%|vh|vw|em`. Sprawdzić na obecnych 10 plikach (ma zostać 0) i na teście z `placeholder-white/40` (ma być 1).
- **Decision**: FIXED — rozszerzony wzorzec (placeholder, caret, accent, decoration, border-[xytrbl], ring-offset, em/%/vh/vw); 5 przykładów złapanych, 10 czystych plików nadal 0

### F3 — `/auth/signin/` (ze slashem) omija przekierowanie zalogowanego

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:24
- **Detail**: Warunek `pathname === "/auth/signin"` jest dokładny, a Astro (domyślnie `trailingSlash: "ignore"`) serwuje tę samą stronę pod `/auth/signin/`. Zalogowany użytkownik pod tym adresem zobaczy formularz.
- **Fix**: Porównywać ścieżkę bez końcowego slasha (`pathname.replace(/\/$/, "") === "/auth/signin"`).
- **Decision**: FIXED — porównanie ścieżki bez końcowego slasha w src/middleware.ts

### F4 — Rejestracja na liście „oczyszczonych”, choć nadal odbija `?error=`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/auth/signup.astro:6, src/pages/api/auth/signup.ts:11,16
- **Detail**: Plan świadomie wyłączył `signup.ts` z zakresu, ale `signup.astro` jest na liście CLEANED skanu, co sugeruje, że widok jest gotowy. Na rejestracji nadal można linkiem wyświetlić dowolny tekst jako komunikat (bez XSS, React escapuje).
- **Fix**: Zapisać jako zadanie na osobną zmianę (to samo mapowanie kodów co `auth-errors.ts` dla rejestracji) w `follow-ups/review-fixes.md`.
- **Decision**: DEFERRED — follow-ups/review-fixes.md (F4)

### F5 — Fałszywy PASS bramki lintu w fazie 4

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 4.2 (commit 9e3df00)
- **Detail**: `return` we frontmatterze `.astro` wywracał ESLint (`@typescript-eslint/no-misused-promises`), a bramka była oceniana po tekście wyjścia, nie po kodzie wyjścia. Naprawione w e497461 (logika w middleware, pełny lint przechodzi). Pre-commit nie złapał tego, bo husky nie jest podłączony. To powtarzalna pułapka, kandydat na lekcję.
- **Fix**: Zapisać lekcję: bramki oceniać po kodzie wyjścia; w `.astro` nie używać `return` we frontmatterze, przekierowania i 404 robić w `src/middleware.ts`.
- **Decision**: ACCEPTED-AS-RULE: Bramki weryfikacji oceniaj po kodzie wyjścia; w .astro bez return we frontmatterze (context/foundation/lessons.md)

### F6 — `/dev/*` sprawdzane po wywołaniu sieciowym `getUser()`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:7-21
- **Detail**: Na produkcji żądanie do `/dev/*` najpierw pyta Supabase o użytkownika, a dopiero potem dostaje 404.
- **Fix**: Przenieść sprawdzenie `/dev/` na początek middleware, przed `createClient`.
- **Decision**: FIXED — sprawdzenie /dev/* przeniesione przed createClient w src/middleware.ts

### F7 — Dowody stanów: brak zrzutu hover, disabled wygląda jak loading

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/dev/SignInStates.tsx:67, context/changes/ui-signin-contract/screenshots/
- **Detail**: Fokus ma osobne zrzuty (`signin-focus-*.png`), hover nie ma żadnego. W kitchen-sink karty disabled i loading pokazują ten sam przycisk ze spinnerem, więc stan „disabled w spoczynku” nie jest pokazany osobno. Użytkownik potwierdził 5.4–5.6 ręcznie.
- **Fix**: Dodać zrzut z najechaniem (`playwright-cli hover`) i w karcie disabled pokazać `Button disabled` bez spinnera.
- **Decision**: SKIPPED — stany potwierdzone ręcznie przez użytkownika (5.4–5.6), fokus ma osobne zrzuty

### F8 — Dryf poza zakresem: dashboard i strona główna na starych literałach, `:root` dostał nowe klucze

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/dashboard.astro, src/components/Welcome.astro, src/styles/global.css (`:root`)
- **Detail**: Po włączeniu `.dark` globalnie dashboard i strona główna mieszają stare literały z nowymi tokenami (D3, świadomie poza zakresem). `:root` dostał `--background-accent` i `--link`, choć plan mówił „jasna paleta bez zmian” (tylko dodane klucze, nic nie renderuje się w jasnym motywie). Polskie komunikaty błędów są na stronie z `lang="en"` (D1).
- **Fix**: Dopisać w `tokens.md` jedną linię o kluczach w `:root` i wskazać dashboard jako następny widok dla `/10x-ui`.
- **Decision**: FIXED (dokumentacja) — :root opisany w tokens.md; dashboard jako następny widok w follow-ups/review-fixes.md
