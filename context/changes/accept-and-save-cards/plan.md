# Akceptacja i zapis fiszek (S-03) — plan implementacji

## Overview

Użytkownik na `/generate` może zaakceptować, poprawić albo usunąć każdą propozycję AI. Zaakceptowana (także po poprawce) fiszka zapisuje się od razu na jego koncie. Każde generowanie zapisuje dwa liczniki, `proposed` i `accepted`, więc autor produktu może policzyć odsetek akceptacji (FR-012, cel ≥ 75%). Edytor fiszki (`CardEditor`) powstaje jako komponent wspólny z S-04.

Źródła: roadmap S-03 (`context/foundation/roadmap.md`), PRD US-01, FR-004, FR-005, FR-012, Guardrails („zaakceptowane fiszki nigdy nie giną”), test-plan ryzyka #1 i #3.

## Current State Analysis

- `public.cards` ma tylko `id, user_id (default auth.uid(), FK auth.users on delete cascade), front, back, created_at`, RLS z 4 politykami `cards_*_own` i CHECK `!~ '^\s*$'` na `front`/`back` (`supabase/migrations/20261019120000_create_cards.sql`, `20261020120000_cards_tighten_constraints_and_privileges.sql`). F-01 świadomie odłożył „tabelę liczników akceptacji” do S-03 (`context/archive/2026-10-19-cards-table-with-isolation/plan.md:33`).
- Żaden kod w `src/` nie czyta ani nie zapisuje `cards`. Brak wygenerowanych typów bazy (`src/lib/supabase.ts` bez generyka `Database`).
- `POST /api/generate` (`src/pages/api/generate.ts`) nie używa Supabase. Zwraca `{ proposals: CardProposal[] }` bez id propozycji i bez id generowania (`src/types.ts`). Serwis już przycina i odfiltrowuje puste propozycje, maks. 10 (`src/lib/services/card-generation.ts:130-132`).
- UI: `GenerateForm.tsx` pokazuje propozycje tylko do odczytu. `useGenerateProposals` trzyma je w stanie Reacta i czyści przy nowym generowaniu (`src/components/hooks/useGenerateProposals.ts`).
- Testy: `npm test` (Vitest) wywołuje endpointy bezpośrednio przez `tests/helpers/api-context.ts`, bez sieci i bazy. `scripts/isolation-check.mjs` sprawdza tylko `/rest/v1/cards`. E2E (Playwright) działa lokalnie z `.dev.vars.e2e` i mockiem OpenRouter (`scripts/mock-openrouter.mjs`, 3 stałe fiszki), ale `ci.yml` go nie uruchamia. Job `smoke` ma już lokalny Supabase i mock AI.

## Desired End State

- Każda propozycja ma akcje „Akceptuj”, „Popraw” i „Usuń”. Akceptacja zapisuje fiszkę w `cards` z powiązaniem do generowania i podbija `accepted_count` w jednej transakcji. Ponowny zapis tej samej propozycji zwraca istniejącą fiszkę jako sukces i nie podbija licznika.
- Odsetek akceptacji to `sum(accepted_count) / sum(proposed_count)` z tabeli `generations`.
- Konto B nie odczyta ani nie podbije liczników A, nie podepnie fiszki pod generowanie A i nie podbije własnego `accepted_count` przez REST.
- Zachowanie jest dowiedzione testami z odczytem z bazy (integracja, izolacja, E2E), a wszystkie te testy działają w CI.

### Key Discoveries:

- Wcześniejsze generowanie czyści stare propozycje, żeby nie dało się zapisać fiszek niepasujących do tekstu (`context/changes/generate-card-proposals/reviews/impl-review-phase-3.md:34`). S-03 na tym polega: `generationId` należy do bieżącej listy.
- Research S-05: edycja ma wysyłać tylko `front`/`back`, nigdy cały wiersz, bo kolumny powtórek nie mogą się zerować (`context/changes/srs-review-session/research.md:51`). Dlatego `CardEditor` oddaje tylko `(front, back)`.
- Wzorzec odpowiedzi JSON: `jsonOk`/`jsonError` w `src/lib/api-response.ts`; 503 `auth_unavailable` przed 401 (`src/pages/api/generate.ts:16-22`).
- Lekcja: każda migracja z `grant` zaczyna od `revoke all … from anon, authenticated` (`context/foundation/lessons.md`).
- Mock OpenRouter zwraca 3 stałe fiszki przygotowane z myślą o S-03 (`context/changes/generate-card-proposals/plan.md:145,155`).

## What We're NOT Doing

- Licznika `rejected` ani wywołania serwera przy „Usuń” — usunięcie działa tylko w UI, a usunięta propozycja liczy się jako niezaakceptowana (bo `accepted` nie rośnie).
- Cofania usunięcia ani potwierdzenia przed usunięciem propozycji.
- Edycji ani usuwania już zapisanej fiszki na `/generate` — to S-04 (lista, PATCH `front`/`back`, DELETE).
- Kolumn powtórek (S-05), `updated_at`, wygenerowanych typów bazy.
- Limitu długości `front`/`back` (F-01 świadomie go nie wprowadził).
- Ograniczenia `update` na `cards` do wybranych kolumn (zmiana kontraktu F-01 i asercji skryptu izolacji).
- Widoku ani raportu odsetka akceptacji — wystarczy zapytanie SQL na `generations`.
- Zmian definicji ryzyk w `context/foundation/test-plan.md` (ryzyko #1 zostaje, sprawdzamy je przez niezmienione `accepted` po usunięciu). Po S-03 statusy faz 2–3 rolloutu oraz cookbook §6.2/§6.4 aktualizujemy przez `/10x-test-plan`, nie w tej zmianie.
- Ochrony metryki przed zawyżeniem przez właściciela konta. Ryzyko jest zaakceptowane, bo dotyczy tylko własnych danych i ≤ 5 użytkowników. Użytkownik z własnym tokenem może przez REST:
  - wstawić generowanie z dowolnym `proposed` (1..10) i od razu wywołać `accept_proposal`, np. `proposed = 1` + akceptacja indeksu 0 daje 1/1;
  - przejść cykl akceptuj → usuń fiszkę (`delete` na `cards` jest dozwolony już dziś, a w S-04 będzie też w UI) → akceptuj ponownie. Usunięcie zwalnia slot `(generation_id, proposal_index)`, więc ponowna akceptacja wstawia nową fiszkę i znów podbija `accepted`, aż do sufitu `accepted = proposed`.

  W zwykłym UI drugi przypadek nie występuje, bo zapisana propozycja ma stan „Zapisano” bez akcji. S-04 musi jednak wiedzieć, że usunięcie fiszki nie cofa `accepted`, a slot zostaje zwolniony.
- Wdrożenia na produkcję (migracja na hostowaną bazę to ręczna bramka; S-02 faza 4 nadal otwarta).

## Implementation Approach

Od dołu do góry: najpierw baza (tabela, klucze, funkcja akceptacji z całą logiką licznika i idempotencji), dowiedziona testami na lokalnym Supabase. Potem cienka warstwa API, która tylko waliduje, wywołuje funkcję i mapuje błędy. Potem UI z wspólnym edytorem. Na końcu E2E w przeglądarce i w CI.

Logika licznika siedzi w bazie, bo musi być atomowa z insertem fiszki i odporna na bezpośrednie wywołania REST z tokenem użytkownika.

## Critical Implementation Details

- **Złożony klucz obcy jest warunkiem bezpieczeństwa.** Zwykłe `generation_id → generations(id)` pozwoliłoby kontu B wstawić przez REST fiszkę z `generation_id` konta A (sprawdzenie FK omija RLS). B zająłby wtedy slot `(generation_id, proposal_index)` A, a powtórka A dostałaby fiszkę B. Klucz `(generation_id, user_id) → generations(id, user_id)` wymusza tego samego właściciela. Wymaga `unique (id, user_id)` na `generations`. Używamy `on delete set null (generation_id)` (lista kolumn, Postgres 15+), żeby nie zerować `user_id`. Funkcja przy konflikcie szuka istniejącej fiszki z warunkiem `user_id = auth.uid()`.
- **Kolejność w CI.** Krok smoke uruchamia mock na 4399 i preview na 4321 w tle. Playwright w CI (`reuseExistingServer: false`) startuje własne serwery na tych portach, więc krok Playwright musi iść przed krokiem smoke albo na innych portach (`E2E_PORT`, `MOCK_OPENROUTER_PORT`).
- **Domyślny Vitest nie może zbierać testów integracyjnych.** `npm test` zbiera `tests/**/*.test.ts`, więc `tests/integration/**` trzeba z niego wykluczyć. Inaczej `npm test` w jobie `ci` zacznie wymagać bazy.

## Faza 1: Baza — generations, powiązanie fiszek, funkcja akceptacji

### Overview

Migracja z tabelą liczników, powiązaniem fiszek z propozycją i funkcją akceptacji. Do tego rozszerzony skrypt izolacji i nowy zestaw testów integracyjnych na lokalnym Supabase, uruchamiany w jobie `smoke`.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261026120000_generations_and_accept_proposal.sql`

**Intent**: Dodać trwałe liczniki FR-012 per generowanie i jedyną drogę ich podbijania, tak żeby zapis fiszki i licznik zmieniały się razem, bez duplikatów i bez możliwości podbicia licznika ponad `proposed` ani z pominięciem funkcji.

**Contract**:
- `public.generations`: `id uuid pk default gen_random_uuid()`, `user_id uuid not null default auth.uid() references auth.users on delete cascade`, `proposed_count smallint not null`, `accepted_count smallint not null default 0`, `created_at timestamptz not null default now()`. Bez kolumny z tekstem.
  - CHECK: `proposed_count between 1 and 10`; `accepted_count between 0 and proposed_count`.
  - `unique (id, user_id)` (cel złożonego FK); indeks `generations_user_id_idx`.
  - RLS włączony. `revoke all on public.generations from anon, authenticated`, potem `grant select, insert` dla `authenticated`. Brak `update` i `delete`.
  - Polityki: `generations_select_own` (`user_id = (select auth.uid())`); `generations_insert_own` z `with check (user_id = (select auth.uid()) and accepted_count = 0)`.
- `public.cards`: nowe kolumny `generation_id uuid null`, `proposal_index smallint null`.
  - CHECK: oba null albo oba not null; `proposal_index between 0 and 9`.
  - `unique (generation_id, proposal_index)`.
  - FK `(generation_id, user_id) references public.generations (id, user_id) on delete set null (generation_id)`.
  - Istniejące polityki i granty `cards` bez zmian.
- Funkcja `public.accept_proposal(p_generation_id uuid, p_proposal_index smallint, p_front text, p_back text)`. Zwraca wiersz z polami fiszki (`id, front, back, created_at`) i `created boolean`.
  - `security definer`, `set search_path = ''`, wszystkie nazwy z prefiksem `public.`.
  - Na początku jawne sprawdzenie `auth.uid()` (null → wyjątek).
  - Blokuje wiersz generowania (`select … for update`) z warunkiem `id = p_generation_id and user_id = auth.uid()`. Brak wiersza (nie istnieje albo cudzy) → wyjątek „nie znaleziono”, nieodróżnialny dla obu przypadków.
  - `p_proposal_index` spoza `0..proposed_count-1` → wyjątek „poza zakresem”.
  - `insert into public.cards (user_id, front, back, generation_id, proposal_index) values (auth.uid(), …) on conflict (generation_id, proposal_index) do nothing returning …`.
  - `accepted_count = accepted_count + 1` tylko gdy insert zwrócił wiersz. Wtedy `created = true`.
  - Przy konflikcie zwraca istniejącą fiszkę `where generation_id = … and proposal_index = … and user_id = auth.uid()` z `created = false`. Treść z pierwszej udanej próby wygrywa.
  - Każdy wyjątek ma własny, stały SQLSTATE (np. `P0002` nie znaleziono, `22023` poza zakresem), żeby endpoint mógł je zmapować. Naruszenie CHECK pustej treści przechodzi jako `23514`.
  - `revoke execute … from public, anon`; `grant execute … to authenticated`.

#### 2. Skrypt izolacji

**File**: `scripts/isolation-check.mjs`

**Intent**: Dowieść ryzyka #3 dla nowej tabeli i funkcji, bez zależności, tym samym stylem co dotychczasowe asercje.

**Contract**: Nowe asercje (konta A i B, anon):
- B nie widzi `generations` A.
- B nie wstawi generowania z `user_id` A.
- Nikt nie wstawi generowania z `accepted_count > 0`.
- Ani A, ani B nie zmieni `accepted_count`/`proposed_count` przez PATCH na `/rest/v1/generations` (brak grantu `update`).
- B nie wywoła `accept_proposal` na generowaniu A (błąd, licznik A bez zmian, brak fiszki).
- B nie wstawi przez REST fiszki z `generation_id` A (złożony FK).
- anon nie wywoła funkcji ani nie czyta `generations`.

Istniejące asercje dla `cards` zostają bez zmian.

#### 3. Testy integracyjne na lokalnym Supabase

**File**: `tests/integration/accept-proposal.test.ts`, `vitest.integration.config.ts`, `package.json` (skrypt `test:integration`), `vitest.config.*` (wykluczenie `tests/integration/**`)

**Intent**: Dowieść ryzyka #1 odczytem stanu z bazy, nie statusem odpowiedzi. Zestaw jest osobny, żeby `npm test` dalej nie potrzebował bazy.

**Contract**:
- Wymaga `SUPABASE_URL`/`SUPABASE_KEY` w środowisku. Odmawia hosta innego niż loopback (jak `isolation-check.mjs`) i nigdy nie czyta `.dev.vars`.
- Zakłada konta jednorazowe przez sign-up (lokalnie bez potwierdzania emaila) i używa `@supabase/supabase-js` z sesją użytkownika.
- Przypadki (każdy z odczytem `cards` i `generations` po akcji):
  - akceptacja → 1 fiszka z podaną treścią, `accepted = 1`;
  - dwa zapisy tej samej propozycji (drugi z inną treścią) → 1 fiszka z treścią pierwszego, `accepted = 1`, drugie wywołanie zwraca `created = false`;
  - dwie różne propozycje → `accepted = 2`;
  - indeks `= proposed_count` i ujemny → błąd, stan bez zmian;
  - cudze generowanie → błąd „nie znaleziono”, stan obu kont bez zmian;
  - pusta treść (`"   "`, `"\n\t"`) → błąd, stan bez zmian;
  - akceptacja wszystkich `proposed` propozycji kończy się na `accepted = proposed`.
- Wyrocznia: decyzje z tego planu i PRD FR-012, nie implementacja funkcji.

#### 4. CI i dokumentacja poleceń

**File**: `.github/workflows/ci.yml` (job `smoke`), `CLAUDE.md` (sekcja Commands)

**Intent**: Uruchamiać testy integracyjne tam, gdzie lokalny Supabase już działa, i opisać nowe polecenie.

**Contract**: Krok `npm run test:integration` w jobie `smoke` po „Check data isolation between accounts”, z tymi samymi zmiennymi co isolation. Wpis w CLAUDE.md: co wymaga, że nie działa na produkcji, gdzie działa w CI.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się na czystej bazie: `npx supabase db reset`
- Skrypt izolacji przechodzi z nowymi asercjami: `npm run isolation`
- Testy integracyjne przechodzą: `npm run test:integration`
- `npm test` nadal przechodzi bez uruchomionej bazy (nie zbiera `tests/integration/**`)
- Lint i typy przechodzą: `npm run lint`, `npx astro check`

#### Manual Verification:

- W lokalnym Studio/psql `generations` ma RLS, granty tylko `select, insert` dla `authenticated` i żadnych dla `anon`; funkcja ma `security definer` i `search_path=''`
- Job `smoke` w CI wykonuje `test:integration` i przechodzi
- Testy integracyjne zweryfikowane przez psucie (test-plan §6.2): przed psuciem działająca migracja jest dodana do indeksu (`git add <plik>`, bo to nowy plik i `git checkout` bez tego jej nie przywróci); usunięcie `on conflict do nothing` albo warunku inkrementu (licznik rośnie bezwarunkowo) w funkcji → po `npx supabase db reset` pada test idempotencji; usunięcie sprawdzenia zakresu indeksu → pada test zakresu; potem przywrócenie wersji z indeksu (`git checkout -- <plik>`) albo ręczne cofnięcie, potwierdzone pustym `git diff -- <plik>`, i ponowny `db reset`

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Faza 2: API — zapis generowania i endpoint akceptacji

### Overview

`/api/generate` tworzy wiersz `generations` i zwraca `generationId`. Nowy `POST /api/cards` akceptuje propozycję przez funkcję SQL. Logika jest w serwisie, a testy Vitest używają stuba klienta Supabase.

### Changes Required:

#### 1. Typy i wspólna walidacja treści

**File**: `src/types.ts`, `src/lib/card-content.ts`

**Intent**: Jeden kontrakt danych dla endpointów, UI i S-04 oraz jedna reguła „pusty = same białe znaki”, używana przez serwer i `CardEditor`.

**Contract**:
- `GenerateProposalsResponse` dostaje `generationId: string | null`.
- Nowe: `AcceptProposalRequest { generationId: string; proposalIndex: number; front: string; back: string }`, `SavedCard { id: string; front: string; back: string; createdAt: string }`, `AcceptProposalResponse { card: SavedCard; created: boolean }`.
- `card-content.ts` eksportuje `isBlankCardText(value: string): boolean` (zgodne z CHECK `^\s*$`) oraz polskie komunikaty dla pustego przodu i tyłu.

#### 2. Serwis fiszek

**File**: `src/lib/services/cards.ts`

**Intent**: Oddzielić wywołania bazy od endpointów, żeby S-04 dołożył tu swoje operacje.

**Contract**:
- `recordGeneration(supabase, proposedCount): Promise<string>` (insert, zwraca id).
- `acceptProposal(supabase, input): Promise<AcceptProposalResponse>` (wywołanie `rpc("accept_proposal")`, mapowanie wiersza na `SavedCard`).
- Błędy jako `CardSaveError` z `code` (`generation_not_found`, `proposal_out_of_range`, `card_blank`, `card_not_saved`) i z oryginalną przyczyną w `cause` (kod SQLSTATE/PostgREST). Nigdy z treścią fiszki.

#### 3. `/api/generate`

**File**: `src/pages/api/generate.ts`

**Intent**: Zapisać `proposed` w chwili generowania. Brak zapisu ma być widoczny, a nie ukryty.

**Contract**:
- Po udanym wywołaniu AI:
  - przy ≥ 1 propozycji `recordGeneration` z klientem z `createClient(context.request.headers, context.cookies)` i odpowiedź `{ proposals, generationId }`;
  - przy 0 propozycji brak wiersza i `generationId: null` (CHECK `proposed_count ≥ 1`).
- Klient `null` albo błąd insertu → `console.error("generate: generation not saved", { code, cause })` bez tekstu i odpowiedź `503 generation_not_saved` „Nie udało się zapisać wyniku generowania. Spróbuj ponownie.”.
- Reszta kontraktu błędów bez zmian.

#### 4. `POST /api/cards`

**File**: `src/pages/api/cards.ts`

**Intent**: Jednostkowy zapis zaakceptowanej propozycji (FR-005), idempotentny.

**Contract** (kolejność sprawdzeń jak w `generate.ts`):
- `503 auth_unavailable`;
- `401 unauthorized` „Zaloguj się, aby zapisywać fiszki.”;
- `400 invalid_request` (zod: `generationId` uuid, `proposalIndex` int ≥ 0, `front`/`back` string);
- `400 card_blank` (przez `isBlankCardText`, a z bazy tylko dla `23514` z naruszeniem `cards_front_not_blank` albo `cards_back_not_blank`, rozpoznanym po nazwie constraintu w `message` błędu PostgREST: `violates check constraint "<nazwa>"`);
- każde inne `23514` (np. `generations_accepted_count_range` po cyklu akceptuj → usuń fiszkę → akceptuj ponownie przy `accepted = proposed`) → `500 card_not_saved` z logiem `{ code, cause }`, nigdy `card_blank`;
- `404 generation_not_found` (SQLSTATE `P0002`, rozpoznawany po `error.code`, bo PostgREST zwraca dla niego HTTP 500);
- `400 proposal_out_of_range` (SQLSTATE `22023`);
- `42501` (brak sesji w funkcji) i `P0001` (niespójność) → `500 card_not_saved` z logiem;
- `201 { card, created: true }` dla nowej fiszki, `200 { card, created: false }` dla powtórki;
- klient `null` albo inny błąd → `500 card_not_saved` „Nie udało się zapisać fiszki. Spróbuj ponownie.” plus `console.error("cards: save failed", { code, cause })` bez `front`/`back`.

Właściciel zawsze pochodzi z sesji (`auth.uid()` w funkcji), nigdy z body.

#### 5. Testy endpointów

**File**: `tests/api/cards.test.ts`, `tests/api/generate.test.ts`, `tests/helpers/api-context.ts`

**Intent**: Zablokować kontrakt błędów, mapowanie kodów i brak treści w logach, bez bazy.

**Contract**:
- `vi.mock("@/lib/supabase")` ze stubem `createClient` (`from().insert().select().single()`, `rpc()`).
- `apiContext` dostaje `cookies` i konfigurowalny URL.
- `cards.test.ts`: 503/401 bez wywołania bazy, 400 dla złego body i pustej treści, mapowanie każdego kodu bazy, 201 vs 200, log błędu bez treści fiszki (sprawdzony markerem jak w `generate.test.ts`).
  - `23514` z constraintem `cards_front_not_blank`/`cards_back_not_blank` → `400 card_blank`; `23514` z `generations_accepted_count_range` → `500 card_not_saved` i log powstał (oba z komunikatem w kształcie PostgREST).
- `tests/integration/accept-proposal.test.ts` (lokalny Supabase): nowy przypadek sufitu — generowanie z `proposed = 1`, akceptacja indeksu 0, usunięcie fiszki przez REST, ponowna akceptacja → błąd `23514` z nazwą `generations_accepted_count_range` w `message`, brak nowej fiszki, `accepted = 1`. Dowodzi formatu komunikatu, na którym opiera się mapowanie w endpoincie.
- `generate.test.ts`: nowe przypadki:
  - `generationId` w odpowiedzi;
  - 0 propozycji → `null` i brak insertu;
  - błąd insertu → 503 i log bez tekstu;
  - znacznik z wklejonego tekstu nie pojawia się w argumentach insertu do `generations` (sprawdzone na wywołaniach stuba, np. przez `inspect` jak w istniejących testach prywatności), przy tym insert musiał się wykonać, żeby test nie był pusty.
- Istniejące asercje zostają. Zmienia się tylko kształt odpowiedzi tam, gdzie zmieniło się wymaganie.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Testy integracyjne nadal przechodzą: `npm run test:integration`
- Lint i typy: `npm run lint`, `npx astro check`

#### Manual Verification:

- Przy `npm run dev` na lokalnym Supabase `POST /api/generate` zwraca `generationId`, a w tabeli `generations` jest wiersz z `proposed_count` równym liczbie propozycji
- `POST /api/cards` wysłany dwa razy (np. z DevTools) daje 201, potem 200 i jedną fiszkę

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Faza 3: UI — CardEditor i akcje na propozycjach

### Overview

Wspólny edytor fiszki, element propozycji ze stanami i hook zapisu. Zapis działa od razu po akceptacji. Po sukcesie UI pokazuje treść z serwera.

### Changes Required:

#### 1. Wspólny edytor

**File**: `src/components/cards/CardEditor.tsx`

**Intent**: Jeden edytor przodu i tyłu dla S-03 (akceptacja po poprawce) i S-04 (PATCH), niezależny od endpointu.

**Contract**:
- Props: `initialFront`, `initialBack`, `onSave(front, back): Promise<string | null>` (`null` = sukces, string = polski komunikat błędu), `onCancel()`, opcjonalne `saveLabel`.
- Pola `Textarea` z etykietami „Przód” i „Tył”.
- Pusta treść lub same białe znaki (`isBlankCardText`) blokują zapis i pokazują komunikat przy polu.
- W trakcie `onSave` „Zapisz” i „Anuluj” są nieaktywne. Przy błędzie edytor zostaje otwarty z wpisaną treścią i komunikatem (`ServerError`).
- Tylko role tokenów, `cn()`.

#### 2. Hook zapisu propozycji

**File**: `src/components/hooks/useAcceptProposal.ts`

**Intent**: Wywołanie `POST /api/cards` z blokadą równoległych zapisów tej samej propozycji.

**Contract**:
- `useAcceptProposal(generationId, proposalIndex)` zwraca `{ accept(front, back): Promise<string | null>, saved: SavedCard | null, isSaving }`.
- Blokada przez `useRef`, jak `inFlight` w `useGenerateProposals`.
- 200 i 201 ustawiają `saved` z odpowiedzi serwera.
- Odpowiedź z błędem → komunikat z `error.message`, a błąd sieci lub nieczytelna odpowiedź → stały komunikat sieciowy.

#### 3. Element propozycji i lista

**File**: `src/components/generate/ProposalItem.tsx`, `src/components/generate/GenerateForm.tsx`, `src/components/hooks/useGenerateProposals.ts`

**Intent**: Trzy akcje z FR-004 na każdej propozycji, a usunięcie tylko w UI.

**Contract**:
- Stany `ProposalItem`:
  - podgląd z „Akceptuj”, „Popraw” i „Usuń”;
  - edycja (`CardEditor`, którego „Zapisz” = akceptacja z poprawioną treścią);
  - zapisywanie (przyciski nieaktywne);
  - błąd (treść zostaje, polski komunikat, „Spróbuj ponownie”);
  - zapisano (treść z `saved`, oznaczenie „Zapisano”, bez akcji).
- „Usuń” w stanie podglądu usuwa propozycję z listy, bez wywołania serwera i bez potwierdzenia.
- Klucz elementu to `proposalIndex` (pozycja w odpowiedzi), nie pozycja po usunięciach.
- `useGenerateProposals` przechowuje `generationId`. Przy `generationId === null` (0 propozycji) zostaje dotychczasowy komunikat.
- Region `aria-live` zostaje.

#### 4. Bramka UI i dokumentacja projektu

**File**: `scripts/ui-literal-scan.mjs`, `CLAUDE.md` (sekcja Project)

**Intent**: Nowe widoki od razu pod `lint:ui`; opis projektu zgodny z kodem.

**Contract**:
- Dopisać `CardEditor.tsx` i `ProposalItem.tsx` do listy skanowanych widoków.
- W CLAUDE.md: zapis fiszek z akceptacją istnieje (`POST /api/cards`, `generations`), a zarządzanie fiszkami i powtórki jeszcze nie.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run lint:ui`, `npx astro check`
- `npm test` przechodzi
- `npm run build` przechodzi (przy zatrzymanym `astro dev`)

#### Manual Verification:

- Na `/generate` (lokalny Supabase, mock AI): „Akceptuj” zapisuje fiszkę i pokazuje „Zapisano”; „Popraw” → zmiana → „Zapisz” zapisuje poprawioną treść; „Usuń” znika z listy
- Pusta treść w edytorze blokuje zapis z komunikatem po polsku
- Przy zatrzymanym Supabase błąd zapisu zostawia propozycję (i otwarty edytor) z komunikatem i „Spróbuj ponownie”, a po wznowieniu ponowienie działa
- Szybkie podwójne kliknięcie „Akceptuj” daje jedną fiszkę i `accepted = 1`
- Widok wygląda spójnie z resztą w motywie `.dark`, a fokus z klawiatury jest widoczny

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Faza 4: E2E — akceptacja w przeglądarce i Playwright w CI

### Overview

Jeden spec przechodzi pełny przepływ w przeglądarce i sprawdza stan w bazie. Playwright zaczyna działać w jobie `smoke`.

### Changes Required:

#### 1. Spec E2E

**File**: `tests/e2e/accept-save-cards.spec.ts`, `tests/e2e/helpers.ts`

**Intent**: Pokazać ryzyko #1 tam, gdzie widzi je użytkownik, i potwierdzić je odczytem z bazy.

**Contract**:
- Generuj (mock zwraca 3 fiszki) i przechwyć `generationId` z odpowiedzi `/api/generate`.
- Akceptuj #1, popraw i zapisz #2, usuń #3.
- Asercje w UI: dwie „Zapisano”, #3 zniknęła.
- Asercje w bazie przez REST z sesją konta E2E (helper `signInWithPassword` przez `fetch`): `proposed = 3`, `accepted = 2` także po usunięciu #3; w `cards` dla tego `generationId` są treść #1 i poprawiona treść #2.
- Sprzątanie: usunięcie fiszek tego generowania. Wiersz `generations` zostaje, bo nie ma grantu `delete`; dotyczy tylko lokalnej bazy.
- Nagłówek w stylu istniejących speców (risk, seed, co jest mockowane).

#### 2. Playwright w jobie `smoke`

**File**: `.github/workflows/ci.yml`

**Intent**: E2E działa w CI, nie tylko lokalnie.

**Contract**:
- W jobie `smoke` nowe kroki:
  - utworzenie `.dev.vars.e2e` z lokalnego Supabase, URL mocka i `E2E_USERNAME`/`E2E_PASSWORD`;
  - założenie konta E2E przez sign-up w lokalnym Auth;
  - `npx playwright install --with-deps chromium`;
  - `npx playwright test`;
  - upload `playwright-report`/`test-results` jako artefakt przy porażce.
- Krok idzie przed smoke albo na osobnych portach (patrz Critical Implementation Details). Żadnych sekretów produkcyjnych.

### Success Criteria:

#### Automated Verification:

- Lokalnie `npx playwright test` przechodzi (wszystkie spece, w tym nowy)
- W CI job `smoke` uruchamia Playwright i przechodzi na PR
- `npm run lint`, `npx astro check`

#### Manual Verification:

- Przy celowo zepsutym zapisie (np. tymczasowo zła nazwa funkcji SQL) nowy spec pada z czytelną przyczyną, a w artefakcie CI jest trace
- Przegląd specu: asercje na stan w bazie, nie tylko na status odpowiedzi

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `tests/api/cards.test.ts`, `tests/api/generate.test.ts`: kontrakt błędów, kolejność 503 → 401 → 400, mapowanie kodów bazy, 201/200, brak treści fiszki i wklejonego tekstu w logach.

### Integration Tests:

- `tests/integration/accept-proposal.test.ts` (lokalny Supabase): idempotencja (dwa zapisy → 1 fiszka, `accepted = 1`), zakres indeksu, cudze generowanie, pusta treść, sufit `accepted = proposed`. Wszystko z odczytem z bazy.
- `scripts/isolation-check.mjs`: izolacja `generations`, złożony FK, brak `update` liczników przez REST, brak dostępu anon.
- E2E `accept-save-cards.spec.ts`: akceptuj, popraw, usuń, a potem liczniki i treść w bazie.

### Manual Testing Steps:

1. Wygeneruj z mockiem 3 propozycje, zaakceptuj jedną, popraw drugą, usuń trzecią; sprawdź w Studio `generations` (3/2) i `cards`.
2. Zatrzymaj Supabase w trakcie i kliknij „Akceptuj”: komunikat, propozycja zostaje; wznów i ponów.
3. Podwójne kliknięcie „Akceptuj”: jedna fiszka.

## Performance Considerations

Brak istotnych: maks. 10 zapisów na generowanie, jedna transakcja z blokadą jednego wiersza `generations` na zapis.

## Migration Notes

Migracja tylko dodaje: nową tabelę i dwie nullowalne kolumny w `cards`, więc istniejące fiszki mają `generation_id = null`. Wycofanie to nowa migracja usuwająca funkcję, ograniczenia, kolumny i tabelę. Zastosowanie na produkcji to ręczna bramka człowieka (jak w F-01), po domknięciu S-02 fazy 4.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03, S-04)
- PRD: `context/foundation/prd.md` (US-01, FR-004, FR-005, FR-012, Guardrails, NFR)
- Test plan: `context/foundation/test-plan.md` (ryzyka #1, #3; faza 3)
- F-01: `context/archive/2026-10-19-cards-table-with-isolation/plan.md:33`
- S-02: `context/changes/generate-card-proposals/plan.md`, `reviews/impl-review-phase-3.md:34`
- S-05 research (edycja tylko front/back): `context/changes/srs-review-session/research.md:51`
- Wzorce: `src/pages/api/generate.ts`, `src/lib/api-response.ts`, `src/components/hooks/useGenerateProposals.ts`, `tests/api/generate.test.ts`, `scripts/isolation-check.mjs`
- Lekcje: `context/foundation/lessons.md` (401 w endpointach, revoke przed grant, bramki po kodzie wyjścia)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza — generations, powiązanie fiszek, funkcja akceptacji

#### Automated

- [x] 1.1 Migracja aplikuje się na czystej bazie: `npx supabase db reset` — a7e8e69
- [x] 1.2 Skrypt izolacji przechodzi z nowymi asercjami: `npm run isolation` — a7e8e69
- [x] 1.3 Testy integracyjne przechodzą: `npm run test:integration` — a7e8e69
- [x] 1.4 `npm test` nadal przechodzi bez uruchomionej bazy (nie zbiera `tests/integration/**`) — a7e8e69
- [x] 1.5 Lint i typy przechodzą: `npm run lint`, `npx astro check` — a7e8e69

#### Manual

- [x] 1.6 W lokalnym Studio/psql `generations` ma RLS, granty tylko `select, insert` dla `authenticated` i żadnych dla `anon`; funkcja ma `security definer` i `search_path=''` — a7e8e69
- [ ] 1.7 Job `smoke` w CI wykonuje `test:integration` i przechodzi
- [x] 1.8 Testy integracyjne zweryfikowane przez psucie (test-plan §6.2): przed psuciem działająca migracja jest dodana do indeksu (`git add <plik>`, bo to nowy plik i `git checkout` bez tego jej nie przywróci); usunięcie `on conflict do nothing` albo warunku inkrementu (licznik rośnie bezwarunkowo) w funkcji → po `npx supabase db reset` pada test idempotencji; usunięcie sprawdzenia zakresu indeksu → pada test zakresu; potem przywrócenie wersji z indeksu (`git checkout -- <plik>`) albo ręczne cofnięcie, potwierdzone pustym `git diff -- <plik>`, i ponowny `db reset` — a7e8e69

### Phase 2: API — zapis generowania i endpoint akceptacji

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą: `npm test` — 29535ec
- [x] 2.2 Testy integracyjne nadal przechodzą: `npm run test:integration` — 29535ec
- [x] 2.3 Lint i typy: `npm run lint`, `npx astro check` — 29535ec

#### Manual

- [x] 2.4 Przy `npm run dev` na lokalnym Supabase `POST /api/generate` zwraca `generationId`, a w tabeli `generations` jest wiersz z `proposed_count` równym liczbie propozycji — 29535ec
- [x] 2.5 `POST /api/cards` wysłany dwa razy (np. z DevTools) daje 201, potem 200 i jedną fiszkę — 29535ec

### Phase 3: UI — CardEditor i akcje na propozycjach

#### Automated

- [x] 3.1 `npm run lint`, `npm run lint:ui`, `npx astro check` — c085a30
- [x] 3.2 `npm test` przechodzi — c085a30
- [x] 3.3 `npm run build` przechodzi (przy zatrzymanym `astro dev`) — c085a30

#### Manual

- [x] 3.4 Na `/generate` (lokalny Supabase, mock AI): „Akceptuj” zapisuje fiszkę i pokazuje „Zapisano”; „Popraw” → zmiana → „Zapisz” zapisuje poprawioną treść; „Usuń” znika z listy — c085a30
- [x] 3.5 Pusta treść w edytorze blokuje zapis z komunikatem po polsku — c085a30
- [x] 3.6 Przy zatrzymanym Supabase błąd zapisu zostawia propozycję (i otwarty edytor) z komunikatem i „Spróbuj ponownie”, a po wznowieniu ponowienie działa — c085a30
- [x] 3.7 Szybkie podwójne kliknięcie „Akceptuj” daje jedną fiszkę i `accepted = 1` — c085a30
- [x] 3.8 Widok wygląda spójnie z resztą w motywie `.dark`, a fokus z klawiatury jest widoczny — c085a30

### Phase 4: E2E — akceptacja w przeglądarce i Playwright w CI

#### Automated

- [x] 4.1 Lokalnie `npx playwright test` przechodzi (wszystkie spece, w tym nowy)
- [ ] 4.2 W CI job `smoke` uruchamia Playwright i przechodzi na PR
- [x] 4.3 `npm run lint`, `npx astro check`

#### Manual

- [ ] 4.4 Przy celowo zepsutym zapisie (np. tymczasowo zła nazwa funkcji SQL) nowy spec pada z czytelną przyczyną, a w artefakcie CI jest trace
- [ ] 4.5 Przegląd specu: asercje na stan w bazie, nie tylko na status odpowiedzi
