# Rejestracja, logowanie i wylogowanie na produkcji (S-01) Implementation Plan

## Overview

Dowodzimy, że na wdrożonej aplikacji (`https://10xcards.szymon-10x.workers.dev`) nowy użytkownik może zarejestrować konto, zalogować się i wylogować (FR-008, FR-001, FR-009). Przepływ jest już w kodzie, więc zmiana to głównie weryfikacja: `scripts/smoke.mjs` dostaje możliwość użycia prawdziwego adresu (`SMOKE_EMAIL`, tylko linia 7), rejestracja dostaje dwie drobne poprawki, a po merge smoke przechodzi jeden raz na produkcji jako zapisany dowód. To jeden z dwóch równoległych pasów M2L6 (drugi: `generate-card-proposals` w osobnym worktree), więc zakres jest zamknięty i nie dotyka plików, które zmienia drugi pas.

## Current State Analysis

- Przepływ auth istnieje: `src/pages/api/auth/signup.ts`, `signin.ts`, `signout.ts`, `src/middleware.ts` (`PROTECTED_ROUTES = ["/dashboard"]`).
- `scripts/smoke.mjs` sprawdza pełny cykl w 9 krokach (strona główna, przekierowanie anonima, rejestracja, konto w Supabase Auth, złe hasło, dobre hasło, dashboard, wylogowanie, przekierowanie po wylogowaniu). Linia 7 to `smoke-${Date.now()}@example.com`; hostowany Supabase odrzuca `example.com`, więc na produkcji smoke nigdy nie objął rejestracji ani logowania.
- `context/foundation/infrastructure.md:94` (decyzja 2026-10-18): na produkcji bez kont testowych, rejestrację i logowanie sprawdza człowiek ręcznie. Ta zmiana świadomie ją zastępuje (jedno konto testowe na przebieg, usuwane ręcznie), co już przewidywał `context/deployment/deploy-plan.md` krok 12.
- PRD FR-008: „w v1 bez weryfikacji adresu email”. Lokalnie `supabase/config.toml` ma `enable_confirmations = false`; ustawienia „Confirm email” w hostowanym projekcie nie znamy. Przy włączonym potwierdzaniu krok „signin accepts correct password” zwraca `email_not_confirmed`.
- `src/pages/auth/confirm-email.astro`: poza `DEV` zawsze pokazuje „Check your email”, co jest nieprawdą przy wyłączonym potwierdzaniu.
- `src/pages/api/auth/signup.ts:16`: do URL trafia surowy angielski `error.message`, a `src/pages/auth/signup.astro` wyświetla go bez mapowania. `signin.ts` przekazuje tylko kod, a `src/lib/auth-errors.ts` mapuje go na polski komunikat (generyczny dla nieznanych kodów, więc strona nie powtarza parametru z URL).
- Drugi worktree (`../10xcards-generate-proposals`) zmienia w `scripts/smoke.mjs` funkcję `request`, listę kroków i pętlę raportowania oraz `context/foundation/roadmap.md`; nie zmienia plików auth.

## Desired End State

- `SMOKE_EMAIL=twoj+{ts}@gmail.com BASE_URL=https://10xcards.szymon-10x.workers.dev npm run smoke` kończy się kodem 0 i 9× PASS na produkcji; bez `SMOKE_EMAIL` smoke działa jak dotąd (CI bez zmian).
- Na produkcji „Confirm email” jest wyłączone, a strona po rejestracji mówi prawdę (konto utworzone, można się zalogować).
- Błąd rejestracji pokazuje polski komunikat zależny od kodu Supabase, nigdy tekstu z URL.
- Dowód (data, wynik smoke, ręczny test w przeglądarce, usunięte konta) jest zapisany w `context/deployment/deploy-plan.md`, a decyzja w `infrastructure.md:94` zaktualizowana.
- Zmiana trafiła do `main` osobnym PR z zielonym CI i Solo Code Review.

### Key Discoveries:

- `scripts/smoke.mjs:7` — jedyna linia do zmiany; reszta pliku należy do drugiego pasa.
- `scripts/smoke.mjs:41-60` — `accountExists` bierze `SUPABASE_URL`/`SUPABASE_KEY` ze środowiska, a w razie braku z `.dev.vars`; na produkcji muszą to być wartości produkcyjne.
- `src/lib/auth-errors.ts:4-17` — wzorzec mapy kod → komunikat z generycznym fallbackiem do powtórzenia dla rejestracji.
- `context/deployment/deploy-plan.md:12,58` — URL produkcji i wcześniejsza zgoda na konto testowe z przypomnieniem o usunięciu.
- `context/foundation/lessons.md` — bramki oceniamy po kodzie wyjścia; przekierowania nie jako `return` we frontmatterze `.astro`.

## What We're NOT Doing

- Zmian w `scripts/smoke.mjs` poza linią 7 i jakichkolwiek zmian w `context/foundation/roadmap.md` (należą do koordynacji z głównego folderu i drugiego pasa).
- Tłumaczenia formularza rejestracji (walidacja w `SignUpForm.tsx` zostaje po angielsku) ani porządków palety w `confirm-email.astro` (to praca dla `/10x-ui`).
- Weryfikacji maila, resetu hasła (PRD: v2), joba deploy w CI, smoke na produkcji w CI.
- Automatycznego usuwania kont testowych (wymagałoby klucza `service_role`); usuwa je człowiek w dashboardzie.
- Nowego runnera testów ani testu Playwright.

## Implementation Approach

Najpierw kod w worktree (faza 1), potem PR i zielony job `smoke` jako dowód, że nic się nie zepsuło (faza 2), dopiero po merge deploy z `main` i dowód na produkcji (faza 3). Kolejność chroni przed wdrożeniem niezmergowanego kodu i przed rozjazdem z drugim pasem. Na tej maszynie nie ma Dockera, więc pełny smoke lokalnie nie ruszy; jego rolę w fazach 1–2 pełni job `smoke` w CI.

## Critical Implementation Details

- **Unikalność adresu:** przy wyłączonym potwierdzaniu ponowna rejestracja tego samego adresu kończy się błędem `user_already_exists`, więc `SMOKE_EMAIL` musi zawierać `{ts}`, zamieniane w linii 7 na `Date.now()` (aliasy `+` w Gmailu trafiają do tej samej skrzynki).
- **Kolejność w fazie 3:** wyłączenie „Confirm email” przed `wrangler deploy` (krok 3.3 przed 3.4), bo nowa treść `confirm-email.astro` jest prawdziwa dopiero przy wyłączonym potwierdzaniu; deploy z `main` po merge. Jeśli S-02 zmergował się wcześniej, `main` zawiera `/api/generate` i może wymagać sekretu `OPENROUTER_API_KEY` na Workerze; sprawdzić przed deployem (`wrangler secret list`) i w razie braku zatrzymać się i zapytać człowieka.

## Faza 1: Adres smoke i poprawki rejestracji

### Overview

Smoke umie użyć prawdziwego adresu, a rejestracja pokazuje prawdziwe i polskie komunikaty.

### Changes Required:

#### 1. Adres testowy w smoke

**File**: `scripts/smoke.mjs` (tylko linia 7)

**Intent**: Pozwolić uruchomić smoke na produkcji z adresem akceptowanym przez hostowany Supabase, bez zmiany zachowania w CI.

**Contract**: Jedna linia: jeśli `process.env.SMOKE_EMAIL` jest ustawione, `email` = jego wartość z `{ts}` zamienionym na `Date.now()`; w przeciwnym razie dotychczasowe `smoke-${Date.now()}@example.com`. Plik ma nadal 118 linii, `git diff` pokazuje zmianę wyłącznie w linii 7.

#### 2. Kody błędów rejestracji

**File**: `src/lib/auth-errors.ts`, `src/pages/api/auth/signup.ts`, `src/pages/auth/signup.astro`

**Intent**: Rejestracja zachowuje się jak logowanie: do URL trafia tylko kod, strona mapuje go na polski komunikat, nieznane wartości dostają komunikat generyczny.

**Contract**: Nowa eksportowana funkcja `signUpErrorMessage(code: string | null): string | null` obok `signInErrorMessage`, z mapą co najmniej dla `user_already_exists`, `weak_password`, `email_address_invalid`, `over_email_send_rate_limit`, `signup_disabled`, `auth_unavailable` i generycznym fallbackiem. `signup.ts` przekierowuje na `/auth/signup?error=<encodeURIComponent(error.code ?? "unknown")>`, a przy braku klienta na `?error=auth_unavailable`. `signup.astro` przekazuje do `SignUpForm` wynik `signUpErrorMessage(...)`. Przekierowanie po sukcesie nadal `/auth/confirm-email` (smoke na to liczy).

#### 3. Strona po rejestracji

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Usunąć rozgałęzienie `import.meta.env.DEV`, bo na produkcji potwierdzanie maila jest wyłączone (PRD v1); strona zawsze mówi, że konto jest utworzone i można się zalogować.

**Contract**: Jedna wersja treści (nagłówek, opis, link „Przejdź do logowania” na `/auth/signin`), bez zmian klas i układu.

### Success Criteria:

#### Automated Verification:

- `npm run lint` kończy się kodem 0
- `npm run lint:ui` kończy się kodem 0
- `npx astro check` kończy się kodem 0
- `npm run build` kończy się kodem 0 (bez działającego `astro dev`)
- `git diff main -- scripts/smoke.mjs` zmienia wyłącznie linię 7, a `git diff main --stat` nie zawiera `context/foundation/roadmap.md`

#### Manual Verification:

- Przegląd diffu: brak tekstu z URL wyświetlanego na `/auth/signup`, polskie komunikaty dla znanych kodów

**Implementation Note**: Po zielonych kontrolach automatycznych zatrzymaj się na potwierdzenie człowieka. Bloki faz mają zwykłe punkty; checkboxy są tylko w `## Progress`.

---

## Faza 2: PR i CI

### Overview

Zmiana przechodzi przez osobny PR do `main` z zielonym CI i Solo Code Review, zgodnie z checklistą M2L6.

### Changes Required:

#### 1. Branch i PR

**File**: brak zmian w plikach (branch `feature/account-lifecycle-on-prod`)

**Intent**: Wypchnąć branch, otworzyć PR do `main` i doczekać się zielonego joba `smoke`, który jako jedyny uruchamia pełny smoke (lokalnie brak Dockera).

**Contract**: `git push -u origin feature/account-lifecycle-on-prod`, potem `gh pr create --base main`. Job `smoke` uruchamia się na `pull_request` do `main`, nie na pushu do innej gałęzi.

### Success Criteria:

#### Automated Verification:

- Joby `ci` i `smoke` zielone na PR (`gh pr checks`), a w logu smoke 9× PASS

#### Manual Verification:

- Solo Code Review (`/10x-impl-review account-lifecycle-on-prod`) bez otwartych uwag krytycznych
- PR zmergowany do `main` przez człowieka

**Implementation Note**: Merge wykonuje człowiek; agent zatrzymuje się po zielonym CI i review.

---

## Faza 3: Dowód na produkcji

### Overview

Po merge produkcja ma ustawienia zgodne z PRD i działający kod, a pełny cykl konta jest dowiedziony smoke i ręcznym testem.

### Changes Required:

#### 1. Ustawienie Supabase (człowiek)

**File**: brak (dashboard Supabase)

**Intent**: Wyłączyć potwierdzanie maila zgodnie z PRD v1, żeby logowanie zaraz po rejestracji działało.

**Contract**: Supabase → Authentication → Sign In / Providers → Email → „Confirm email” wyłączone, zapisane.

#### 2. Deploy z `main`

**File**: brak (Worker `10xcards`)

**Intent**: Wdrożyć zmergowany kod na produkcję.

**Contract**: W głównym folderze na `main` po `git pull`: `npx wrangler secret list` (wymagane sekrety obecne), `npx astro build && npx wrangler deploy --dry-run`, bramka zatwierdzenia człowieka, `npx wrangler deploy`. Nigdy `wrangler pages ...`.

#### 3. Smoke na produkcji i sprzątanie

**File**: brak

**Intent**: Jeden przebieg smoke na publicznym URL jako powtarzalny dowód, potem ręczny test i usunięcie kont testowych.

**Contract**: `SMOKE_EMAIL=<adres+{ts}@domena>`, `BASE_URL=https://10xcards.szymon-10x.workers.dev`, `SUPABASE_URL`/`SUPABASE_KEY` produkcyjne (środowisko albo `.dev.vars`, sprawdzone co do kształtu wg `lessons.md`, bez wypisywania wartości), `npm run smoke`. Konto z ostatniej linii wyjścia i konto z testu w przeglądarce usuwa człowiek w Supabase → Authentication → Users.

#### 4. Zapis dowodu

**File**: `context/deployment/deploy-plan.md`, `context/foundation/infrastructure.md`, `context/changes/account-lifecycle-on-prod/change.md`

**Intent**: Zostawić ślad dla certyfikacji i kolejnych agentów oraz zastąpić nieaktualną decyzję.

**Contract**: W `deploy-plan.md` (sekcja zapisu wdrożenia) wpis S-01 z datą, wynikiem smoke (9× PASS, kod 0), ustawieniem „Confirm email: off” i potwierdzeniem usunięcia kont. W `infrastructure.md:94` decyzja „Zakres smoke” uzupełniona o datę i nową regułę: smoke na produkcji z `SMOKE_EMAIL`, jedno konto na przebieg, usuwane ręcznie. W `change.md` w `## Notes` link do tych wpisów. Bez adresu e-mail w repo (zastąpić `<adres>`), bez sekretów.

### Success Criteria:

#### Automated Verification:

- Smoke na produkcji kończy się kodem 0 z 9× PASS
- `curl -sI https://10xcards.szymon-10x.workers.dev/auth/signin` zwraca 200

#### Manual Verification:

- „Confirm email” wyłączone w Supabase
- Deploy z `main` zatwierdzony przez człowieka i zakończony kodem 0
- Ręczny test w przeglądarce: rejestracja, komunikat po rejestracji, logowanie, dashboard, wylogowanie
- Konta testowe usunięte w Supabase → Authentication → Users
- Dowód zapisany w `deploy-plan.md`, `infrastructure.md` i `change.md`

**Implementation Note**: Kroki w dashboardzie, zatwierdzenie deployu i sprzątanie wykonuje człowiek; agent czeka na potwierdzenie każdego z nich. Zapis dowodu commitowany osobno na nowym krótkim branchu z `main` i osobnym PR (dokumenty, bez kodu).

---

## Testing Strategy

### Integration Tests:

- `npm run smoke` w jobie `smoke` w CI (lokalny Supabase, `example.com`) jako regresja w fazie 2.
- `npm run smoke` na produkcji z `SMOKE_EMAIL` jako dowód w fazie 3.

### Manual Testing Steps:

1. Na `/auth/signup` zarejestrować konto własnym adresem; sprawdzić komunikat na `/auth/confirm-email`.
2. Zarejestrować ten sam adres drugi raz; sprawdzić polski komunikat o istniejącym koncie.
3. Zalogować się, zobaczyć `/dashboard`, wylogować się, sprawdzić przekierowanie z `/dashboard` na logowanie.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-01, tylko do odczytu w tej zmianie)
- PRD: `context/foundation/prd.md` (US-01, FR-001, FR-008, FR-009)
- Decyzja smoke: `context/foundation/infrastructure.md:94`
- Wdrożenie: `context/deployment/deploy-plan.md`
- Wzorzec mapowania błędów: `src/lib/auth-errors.ts:4-17`
- Lekcja: M2L6 „Innovate: więcej ficzerów, mniej czekania z wieloma agentami” (checklista równoległej sesji)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Adres smoke i poprawki rejestracji

#### Automated

- [x] 1.1 `npm run lint` kończy się kodem 0 — ef2ec33
- [x] 1.2 `npm run lint:ui` kończy się kodem 0 — ef2ec33
- [x] 1.3 `npx astro check` kończy się kodem 0 — ef2ec33
- [x] 1.4 `npm run build` kończy się kodem 0 (bez działającego `astro dev`) — ef2ec33
- [x] 1.5 `git diff main -- scripts/smoke.mjs` zmienia wyłącznie linię 7, a `git diff main --stat` nie zawiera `context/foundation/roadmap.md` — ef2ec33

#### Manual

- [x] 1.6 Przegląd diffu: brak tekstu z URL wyświetlanego na `/auth/signup`, polskie komunikaty dla znanych kodów

### Phase 2: PR i CI

#### Automated

- [x] 2.1 Joby `ci` i `smoke` zielone na PR (`gh pr checks`), a w logu smoke 9× PASS

#### Manual

- [x] 2.2 Solo Code Review (`/10x-impl-review account-lifecycle-on-prod`) bez otwartych uwag krytycznych
- [ ] 2.3 PR zmergowany do `main` przez człowieka

### Phase 3: Dowód na produkcji

#### Automated

- [ ] 3.1 Smoke na produkcji kończy się kodem 0 z 9× PASS
- [ ] 3.2 `curl -sI https://10xcards.szymon-10x.workers.dev/auth/signin` zwraca 200

#### Manual

- [ ] 3.3 „Confirm email” wyłączone w Supabase
- [ ] 3.4 Deploy z `main` zatwierdzony przez człowieka i zakończony kodem 0
- [ ] 3.5 Ręczny test w przeglądarce: rejestracja, komunikat po rejestracji, logowanie, dashboard, wylogowanie
- [ ] 3.6 Konta testowe usunięte w Supabase → Authentication → Users
- [ ] 3.7 Dowód zapisany w `deploy-plan.md`, `infrastructure.md` i `change.md`
