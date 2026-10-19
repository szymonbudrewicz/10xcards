# Tabela fiszek z izolacją danych per użytkownik (F-01) Implementation Plan

## Overview

Wprowadzamy minimalną tabelę `cards` (przód, tył, właściciel) z włączonym RLS i politykami per operacja, tak aby każdy użytkownik widział i zmieniał wyłącznie własne wiersze. Izolację dowodzi powtarzalny skrypt `scripts/isolation-check.mjs` (konta A/B na lokalnym Supabase), uruchamiany w CI przy każdym pushu. Migracja trafia na produkcję ręcznie (bramka M3), a konfigurację RLS sprawdzamy tam zapytaniem tylko do odczytu. To Foundation F-01 z `context/foundation/roadmap.md`: odblokowuje S-03 (zapis zaakceptowanych fiszek), S-04 i S-05.

## Current State Analysis

- Brak `supabase/migrations/`; w `supabase/` jest tylko `config.toml` (db 17, `enable_signup = true`, `enable_confirmations = false`, `schema_paths = []`). CLI `supabase` jest w devDependencies.
- `src/lib/supabase.ts` buduje klienta z kluczem publicznym (rola `authenticated` po zalogowaniu), więc izolację wymuszamy w bazie, nie w kodzie aplikacji.
- Brak `src/types.ts` i jakiegokolwiek kodu fiszek.
- `scripts/smoke.mjs` to wzorzec: zero zależności, PASS/FAIL, bezpośrednie wywołania GoTrue. Job `smoke` w `.github/workflows/ci.yml` startuje lokalny Supabase (`supabase start`), zapisuje `supabase.env` (`API_URL`, `ANON_KEY`), potem `.env` i `.dev.vars`, buduje i uruchamia smoke.
- Na tej maszynie nie ma Dockera, więc lokalny `supabase start` jest niemożliwy; pierwszym miejscem, gdzie migracja i skrypt faktycznie się wykonają, jest CI.
- `.dev.vars` lokalnie może wskazywać na produkcyjny Supabase (`deploy-plan.md`, krok 3), a rejestracja w smoke już raz groziła zapisem do produkcji.
- `context/foundation/lessons.md`: sprawdzaj kształt wartości `SUPABASE_URL`/`SUPABASE_KEY`, nie samą obecność nazwy.

## Desired End State

- Tabela `public.cards` istnieje lokalnie (CI) i na produkcji, z RLS i politykami select/insert/update/delete tylko dla roli `authenticated` i tylko dla własnych wierszy; rola `anon` nie ma dostępu.
- `npm run isolation` przechodzi na świeżym lokalnym Supabase; ten sam skrypt jest krokiem w jobie `smoke` i blokuje merge, gdy izolacja się zepsuje.
- Na produkcji zapytanie do `pg_class`/`pg_policies` potwierdza RLS i komplet polityk.
- Weryfikacja: zielony job `smoke` na GitHubie oraz wynik zapytania katalogowego z produkcji.

### Key Discoveries:

- `supabase/config.toml:150-209` — rejestracja włączona, bez potwierdzania maila, więc skrypt dostaje sesję od razu po `signup`.
- `scripts/smoke.mjs:55-70` — wzorzec bezpośredniego wywołania GoTrue i raportowania PASS/FAIL do skopiowania.
- `.github/workflows/ci.yml` (job `smoke`) — `supabase.env` zawiera `API_URL` i `ANON_KEY`; migracje z `supabase/migrations/` zostaną zastosowane przez `supabase start`.
- `context/deployment/deploy-plan.md` M3 — migracje na produkcję wykonuje człowiek (`supabase link` + `db push`) przed kodem, który ich wymaga.

## What We're NOT Doing

- Kolumn terminów powtórek (S-05), tabeli liczników akceptacji (S-03), kolumny `updated_at` i triggera (S-04, gdy edycja będzie potrzebować).
- Typów TypeScript/DTO dla fiszek (`src/types.ts`), generowania typów bazy, endpointów API i UI.
- Maksymalnej długości `front`/`back` (PRD jej nie określa); tylko ograniczenie niepustości.
- Testów izolacji na bazie produkcyjnej i kont testowych w produkcji.
- Runnera testów, pgTAP, zmian w CI poza jednym krokiem w `ci.yml`, zmian w `eslint.config.js` poza globalnymi dla skryptów, migracji gałęzi ani joba deploy.

## Implementation Approach

Jedna migracja, jeden skrypt z krokiem CI, jedna ręczna bramka. Izolacja żyje wyłącznie w politykach RLS (`user_id = auth.uid()`), a skrypt dowodzi jej przez prawdziwe API REST tym samym kluczem publicznym, którego używa aplikacja. Skrypt odmawia pracy na adresie innym niż pętla zwrotna, bo tworzy konta i dane testowe. Ponieważ Dockera lokalnie brak, iteracja przebiega przez gałąź `f-01-cards-table-with-isolation` i PR do `main`: job `smoke` uruchamia się na `pull_request` do `main` oraz na pushu do `main`, ale nie na pushu do innych gałęzi, więc kolejność jest taka: push brancha, potem draftowy PR do `main`, potem czekamy na zielony `smoke` (PR można otworzyć dopiero po pushu pierwszego commita).

## Critical Implementation Details

- **Polityki RLS**: `update` musi mieć zarówno `USING`, jak i `WITH CHECK` na `user_id`, inaczej właściciel mógłby przepisać wiersz na cudze konto; `insert` ma `WITH CHECK`, a `user_id` ma domyślną wartość `auth.uid()`. W wyrażeniach użyj `(select auth.uid())`, aby wywołanie nie liczyło się per wiersz.
- **Uprawnienia**: nie polegaj na domyślnych grantach żadnego środowiska (hostowane mogą się różnić od lokalnego). Jawnie nadaj `authenticated` select/insert/update/delete i jawnie odbierz wszystko roli `anon`, zamiast polegać wyłącznie na braku polityki.
- **Bezpieczeństwo skryptu**: dane Supabase tylko ze zmiennych środowiskowych, nigdy z `.dev.vars` (może wskazywać na produkcję); host adresu musi być `127.0.0.1` lub `localhost`, inaczej wyjście z błędem przed jakimkolwiek żądaniem.

## Phase 1: Migracja `cards`

### Overview

Dodać pierwszą migrację tworzącą tabelę fiszek z RLS i politykami.

### Changes Required:

#### 1. Migracja tabeli

**File**: `supabase/migrations/20261019120000_create_cards.sql`

**Intent**: Utworzyć tabelę `public.cards` należącą do użytkownika, włączyć RLS i zdefiniować osobne polityki dla każdej operacji, bez żadnego dostępu dla `anon`.

**Contract**: Tabela `public.cards`: `id uuid` (PK, domyślnie `gen_random_uuid()`), `user_id uuid not null default auth.uid()` z FK do `auth.users(id) on delete cascade`, `front text not null` i `back text not null` z ograniczeniem niepustości po przycięciu spacji, `created_at timestamptz not null default now()`. Indeks na `user_id`. `alter table ... enable row level security`. Cztery polityki dla roli `authenticated`: select i delete z `USING user_id = (select auth.uid())`, insert z `WITH CHECK` tym samym warunkiem, update z `USING` i `WITH CHECK`. `revoke all` na tabeli od `anon` oraz jawny `grant select, insert, update, delete` na tabeli dla `authenticated`. Nazwa pliku zgodna z konwencją `YYYYMMDDHHmmss_short_description.sql`; jeśli data/godzina w nazwie jest wcześniejsza niż ostatnia migracja zdalna, zachowaj rosnącą kolejność.

### Success Criteria:

#### Automated Verification:

- Plik migracji istnieje i ma poprawną nazwę: `ls supabase/migrations/*_create_cards.sql`
- Lint i typy bez zmian: `npm run lint` oraz `npx astro check`
- Zielony job `smoke` na branchu `f-01-cards-table-with-isolation` (PR do `main`): krok `supabase start` stosuje migrację bez błędu (`gh run list --branch f-01-cards-table-with-isolation --limit 1`)

#### Manual Verification:

- Przeczytana migracja: RLS włączony, cztery polityki, brak polityk dla `anon`, brak kolumn powtórek i liczników

**Implementation Note**: Dockera lokalnie brak, więc migracja po raz pierwszy wykona się dopiero w CI: po commicie wypchnij branch, potem otwórz draftowy PR do `main`, potem czekaj na zielony job `smoke` (uruchamia się na `pull_request`, nie na pushu do innych gałęzi). Po zielonym jobie `smoke` poproś człowieka o potwierdzenie przed następną fazą. Bloki faz mają zwykłe punkty; checkboxy są tylko w `## Progress`.

---

## Phase 2: Skrypt izolacji kont A/B i krok w CI

### Overview

Dodać powtarzalny dowód izolacji w stylu `smoke.mjs`, podpiąć go pod `npm run isolation` i od razu uruchamiać w jobie `smoke`, bo bez lokalnego Dockera CI jest jedynym miejscem, gdzie skrypt może się wykonać.

### Changes Required:

#### 1. Skrypt

**File**: `scripts/isolation-check.mjs`

**Intent**: Na lokalnym Supabase utworzyć dwa konta i sprawdzić, że B nie może odczytać, zmienić, usunąć ani podszyć się pod właściciela fiszek A oraz że `anon` nie ma dostępu.

**Contract**: Zero zależności, wejście `SUPABASE_URL` i `SUPABASE_KEY` wyłącznie ze środowiska (bez `.dev.vars`); wyjście z kodem 1 i komunikatem, gdy brakuje wartości, gdy kształt jest zły (URL `http(s)://...`, niepusty klucz) albo gdy host nie jest `127.0.0.1`/`localhost`. Dwie rejestracje przez `/auth/v1/signup` (adresy `isolation-a-<ts>@example.com`, `isolation-b-<ts>@example.com`; lokalnie bez potwierdzania maila), zapytania do `/rest/v1/cards` z nagłówkami `apikey` i `Authorization: Bearer <token>`, `Prefer: return=representation`. Kroki PASS/FAIL: A wstawia fiszkę (bez `user_id`) i `user_id` równa się id A; A ją widzi; B select zwraca `[]`; B update i delete cudzej fiszki zwracają `[]`, a fiszka A pozostaje bez zmian; B insert z `user_id` A jest odrzucony; A update zmieniający `user_id` na B jest odrzucony; insert z pustym `front` jest odrzucony; `anon` select kończy się błędem uprawnień albo pustą listą (nigdy wierszami), a insert jest odrzucony. Posprzątanie: usunięcie fiszek A przez A. Konta zostają w lokalnej bazie i są tak opisane w komunikacie końcowym; kod wyjścia 1 przy jakimkolwiek FAIL.

#### 2. Skrypt npm i dokumentacja komendy

**File**: `package.json`, `CLAUDE.md`

**Intent**: Udostępnić `npm run isolation` i dopisać jedną linię w sekcji Commands w `CLAUDE.md` (poza blokiem zarządzanym przez CLI), z informacją, że wymaga lokalnego Supabase i wartości z `supabase status -o env`.

**Contract**: `"isolation": "node scripts/isolation-check.mjs"` obok `smoke`; w Commands: komenda, wymagane zmienne i zakaz uruchamiania na produkcji.

#### 3. Globalne ESLint dla skryptów

**File**: `eslint.config.js`

**Intent**: Pozwolić skryptowi izolacji używać `URL` i `crypto` bez błędu `no-undef` (sprawdzone próbnym plikiem: blok `scriptsConfig` zna dziś tylko `console`, `process`, `fetch`, `URLSearchParams`).

**Contract**: W `languageOptions.globals` bloku `scriptsConfig` dopisać `URL: true` i `crypto: true`; żadnych innych zmian w pliku.

#### 4. Krok w CI

**File**: `.github/workflows/ci.yml`

**Intent**: Dodać jeden krok w jobie `smoke`, po kroku `Configure secrets for build and preview` i przed `npm run build`, który uruchamia `npm run isolation` na świeżym lokalnym Supabase, aby regresja RLS blokowała merge.

**Contract**: Krok wczytuje `supabase.env` (`source supabase.env`) i wywołuje `SUPABASE_URL="$API_URL" SUPABASE_KEY="$ANON_KEY" npm run isolation`. Żadnych innych zmian w workflow; zakres `branches: [main]` i trigger `pull_request` zostają.

### Success Criteria:

#### Automated Verification:

- Składnia: `node --check scripts/isolation-check.mjs`
- Lint przechodzi: `npm run lint`
- Skrypt odmawia pracy bez zmiennych: `node scripts/isolation-check.mjs` kończy się kodem 1 z komunikatem
- Skrypt odmawia pracy na adresie spoza pętli zwrotnej: `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=x node scripts/isolation-check.mjs` kończy się kodem 1 bez żadnego żądania sieciowego
- Zielony job `smoke` na branchu `f-01-cards-table-with-isolation` (PR do `main`), a w logu kroku izolacji widać wszystkie kroki PASS: `gh run list --branch f-01-cards-table-with-isolation --limit 1` oraz `gh run view <id> --log`
- Wymuszony błąd (tymczasowo usunięta polityka na gałęzi testowej) powoduje czerwony job: sprawdzić jednorazowo, potem cofnąć

#### Manual Verification:

- Przegląd skryptu: żaden krok nie czyta `.dev.vars` i nie loguje haseł ani tokenów
- `eslint.config.js` zmieniony tylko o globalne `URL` i `crypto` w `scriptsConfig`
- Człowiek potwierdza, że zielony run dotyczy ostatniego commita na branchu

---

## Phase 3: Produkcja i domknięcie dokumentacji

### Overview

Zastosować migrację na produkcyjnym Supabase (bramka ręczna), potwierdzić konfigurację RLS zapytaniem katalogowym i zapisać fakty w `deploy-plan.md`.

### Changes Required:

#### 1. Wypchnięcie migracji (człowiek)

**File**: — (operacja na produkcyjnym projekcie Supabase)

**Intent**: Człowiek stosuje migrację po merge do `main`, przed kodem, który jej wymaga.

**Contract**: `npx supabase login`, `npx supabase link --project-ref <ref>`, najpierw `npx supabase db push --dry-run` (powinien pokazać wyłącznie `create_cards`), potem `npx supabase db push`. Agent tych komend nie wykonuje; destrukcyjne operacje na bazie wykonuje wyłącznie człowiek. `link` i `db push` wymagają tokenu dostępu oraz hasła do bazy projektu: człowiek wpisuje je w zwykłym terminalu, nigdy w sesji agenta ani w rozmowie.

#### 2. Kontrola katalogu (człowiek, tylko odczyt)

**File**: — (SQL editor w Supabase)

**Intent**: Potwierdzić konfigurację bez tworzenia kont i danych testowych w produkcji.

**Contract**: Zapytanie o `pg_class.relrowsecurity` dla `public.cards` (oczekiwane `true`) oraz `select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'cards'` (oczekiwane cztery polityki, wyłącznie rola `authenticated`); `has_table_privilege('anon','public.cards','select')` zwraca `false`, a `has_table_privilege('authenticated','public.cards','select')` (oraz insert/update/delete) zwraca `true`.

#### 3. Dokumentacja stanu

**File**: `context/deployment/deploy-plan.md`

**Intent**: Dopisać w „Stan faktyczny" datę i wersję migracji na produkcji oraz wynik kontroli katalogu, bez wartości sekretów.

**Contract**: Jedna pozycja w sekcji „Stan faktyczny" z nazwą migracji i wynikiem trzech kontroli.

### Success Criteria:

#### Automated Verification:

- Aplikacja nadal się buduje: `npm run build`
- Typy i lint: `npx astro check` oraz `npm run lint`

#### Manual Verification:

- `db push --dry-run` pokazuje tylko migrację `create_cards`
- Zapytania katalogowe na produkcji zwracają oczekiwane wartości (RLS `true`, 4 polityki, brak uprawnień `anon`, pełne uprawnienia `authenticated`)
- `deploy-plan.md` zawiera dopisek o migracji

---

## Testing Strategy

### Unit Tests:

- Brak runnera testów (zgodnie z `CLAUDE.md`); zastępuje go `scripts/isolation-check.mjs`.
- Kluczowe przypadki skryptu: odczyt, update, delete i insert-jako-ktoś-inny przez konto B; zmiana właściciela przez A; pusty `front`; `anon`.

### Integration Tests:

- Job `smoke` w CI: świeży lokalny Supabase z migracją, skrypt izolacji, potem istniejący smoke aplikacji.

### Manual Testing Steps:

1. Po zielonym CI przejrzeć log kroku izolacji (wszystkie PASS).
2. Po `db push` wykonać zapytania katalogowe na produkcji.
3. Sprawdzić, że `npm run build` i istniejący `npm run smoke` nadal przechodzą.

## Performance Considerations

Indeks na `user_id` i `(select auth.uid())` w politykach ograniczają koszt RLS; skala to do ok. 10 000 fiszek na użytkownika, więc nic więcej nie jest potrzebne.

## Migration Notes

Tabela jest nowa, bez danych do przeniesienia. Rollback kodu (`wrangler rollback`) nie cofa migracji; ewentualne wycofanie tabeli to osobna, ręczna operacja człowieka. Kolejne migracje dla S-03 (liczniki) i S-05 (kolumny powtórek) dojdą jako osobne pliki.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-01, `cards-table-with-isolation`)
- PRD: NFR „użytkownik widzi wyłącznie swoje fiszki", Access Control
- Wzorzec skryptu: `scripts/smoke.mjs`
- Bramki ręczne: `context/deployment/deploy-plan.md` (M3, R4)
- Reguły: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migracja `cards`

#### Automated

- [x] 1.1 Plik migracji istnieje i ma poprawną nazwę: `ls supabase/migrations/*_create_cards.sql` — fba2940
- [x] 1.2 Lint i typy bez zmian: `npm run lint` oraz `npx astro check` — fba2940
- [x] 1.3 Zielony job `smoke` na branchu `f-01-cards-table-with-isolation` (PR do `main`): krok `supabase start` stosuje migrację bez błędu — fba2940

#### Manual

- [x] 1.4 Przeczytana migracja: RLS włączony, cztery polityki, brak polityk dla `anon`, brak kolumn powtórek i liczników — fba2940

### Phase 2: Skrypt izolacji kont A/B i krok w CI

#### Automated

- [x] 2.1 Składnia: `node --check scripts/isolation-check.mjs` — 8930c60
- [x] 2.2 Lint przechodzi: `npm run lint` — 8930c60
- [x] 2.3 Skrypt odmawia pracy bez zmiennych: `node scripts/isolation-check.mjs` kończy się kodem 1 z komunikatem — 8930c60
- [x] 2.4 Skrypt odmawia pracy na adresie spoza pętli zwrotnej bez żadnego żądania sieciowego — 8930c60
- [x] 2.5 Zielony job `smoke` na branchu `f-01-cards-table-with-isolation` (PR do `main`), a w logu kroku izolacji widać wszystkie kroki PASS — 8930c60
- [ ] 2.6 Wymuszony błąd (tymczasowo usunięta polityka na gałęzi testowej) powoduje czerwony job, potem cofnięty

#### Manual

- [ ] 2.7 Przegląd skryptu: żaden krok nie czyta `.dev.vars` i nie loguje haseł ani tokenów
- [ ] 2.8 `eslint.config.js` zmieniony tylko o globalne `URL` i `crypto` w `scriptsConfig`
- [ ] 2.9 Człowiek potwierdza, że zielony run dotyczy ostatniego commita na branchu

### Phase 3: Produkcja i domknięcie dokumentacji

#### Automated

- [ ] 3.1 Aplikacja nadal się buduje: `npm run build`
- [ ] 3.2 Typy i lint: `npx astro check` oraz `npm run lint`

#### Manual

- [ ] 3.3 `db push --dry-run` pokazuje tylko migrację `create_cards`
- [ ] 3.4 Zapytania katalogowe na produkcji zwracają oczekiwane wartości (RLS `true`, 4 polityki, brak uprawnień `anon`, pełne uprawnienia `authenticated`)
- [ ] 3.5 `deploy-plan.md` zawiera dopisek o migracji
