# Lista zapisanych fiszek z edycją i usuwaniem (S-04) — plan implementacji

## Overview

Użytkownik na nowej stronie `/cards` widzi swoje zapisane fiszki (najnowsze najpierw), może poprawić przód i tył każdej z nich wspólnym `CardEditor` i usunąć ją po potwierdzeniu w oknie dialogowym (FR-010). Edycja nigdy nie zmienia innych kolumn niż `front`/`back`: pilnuje tego nie tylko endpoint, ale też baza (grant `update` tylko na te dwie kolumny), bo zmiana `generation_id`/`proposal_index` przez REST pozwalała ponownie zaakceptować tę samą propozycję i zawyżyć `accepted_count` (FR-012).

Źródła: roadmap S-04 (`context/foundation/roadmap.md`), PRD FR-010, Guardrails („zaakceptowane fiszki nigdy nie giną”), NFR (izolacja), Non-Goals (bez filtrów, wyszukiwania i paginacji), test-plan ryzyko #3.

## Current State Analysis

- `public.cards`: `id, user_id, front, back, created_at, generation_id, proposal_index`. RLS z politykami `cards_*_own`, a `authenticated` ma `select, insert, update, delete` na całej tabeli (`supabase/migrations/20261020120000_cards_tighten_constraints_and_privileges.sql:3-4`). Polityka `cards_update_own` działa na poziomie wiersza, więc właściciel może przez REST zmienić każdą kolumnę oprócz przypisania do innego konta (`WITH CHECK`).
- Zmiana `generation_id`/`proposal_index` zwalnia slot `(generation_id, proposal_index)`, a `accept_proposal()` wstawia wtedy nową fiszkę i podbija `accepted_count` (`supabase/migrations/20261026120000_generations_and_accept_proposal.sql`). S-03 świadomie nie ograniczał kolumn (`context/changes/accept-and-save-cards/plan.md:39`); ta zmiana to robi.
- Serwis `src/lib/services/cards.ts` ma `recordGeneration` i `acceptProposal` z błędami `CardSaveError` (kod + SQLSTATE w `cause`, nigdy treść). Endpoint `src/pages/api/cards.ts` (POST) to wzorzec kolejności 503 → 401 → 400 i logów bez treści.
- `CardEditor` (`src/components/cards/CardEditor.tsx`) przyjmuje `onSave(front, back): Promise<string | null>` i jest gotowy na S-04. `isBlankCardText` i komunikaty są w `src/lib/card-content.ts`.
- Nie ma strony z listą fiszek ani endpointów PATCH/DELETE. `PROTECTED_ROUTES` to `["/dashboard", "/generate"]` (`src/middleware.ts:5`).
- Brak komponentu AlertDialog w `src/components/ui/`.
- Testy: `tests/helpers/api-context.ts` buduje zawsze żądanie `POST` bez `params`. `tests/integration/accept-proposal.test.ts` ma lokalne helpery `localSupabase`/`signUp`. `scripts/isolation-check.mjs` sprawdza już przez REST, że B nie czyta, nie zmienia i nie usuwa fiszek A (`:150-170`), a A nie przepisze fiszki na B (`:188-194`).

## Desired End State

- `/cards` (chroniona) pokazuje listę fiszek użytkownika w kolejności `created_at` malejąco (przy remisie `id` malejąco), stan pusty z linkiem do `/generate` i czytelny błąd odczytu.
- Każda fiszka ma „Edytuj” (`CardEditor`, zapis przez `PATCH /api/cards/[id]`) i „Usuń” (okno potwierdzenia, potem `DELETE /api/cards/[id]`).
- Edycja zmienia tylko `front`/`back`. Przez REST `authenticated` nie zmieni `generation_id`, `proposal_index`, `created_at` ani `user_id` (błąd uprawnień, wiersz bez zmian).
- Usunięcie fiszki nie zmienia liczników w `generations`.
- Fiszka, której już nie ma (lub cudza), daje `404 card_not_found`; UI usuwa ją z listy.
- Wszystko jest dowiedzione testami: jednostkowymi (kontrakt endpointów), integracyjnymi na lokalnym Supabase (kolumny, izolacja, liczniki) i E2E w CI.

### Key Discoveries:

- Edycja ma wysyłać tylko `front`/`back`, bo S-05 doda kolumny powtórek, których edycja nie może zerować (PRD FR-010, `context/changes/srs-review-session/research.md:51`).
- Lekcja: migracja z `grant` zaczyna od `revoke all … from anon, authenticated` (`context/foundation/lessons.md`). `revoke` na tabeli usuwa też uprawnienia kolumnowe, więc kolejność revoke → grant jest bezpieczna.
- Istniejące asercje izolacji zostają ważne po grancie kolumnowym: zmiana `front` przez B nadal daje 0 wierszy (RLS), a przepisanie na B daje błąd 4xx (teraz z braku grantu na `user_id`).
- Lekcja: bez `return` we frontmatterze `.astro`; błąd odczytu na stronie to `Astro.response.status` + komunikat w szablonie (`context/foundation/lessons.md`).
- `radix-ui` (pakiet zbiorczy) wywraca runtime Workers; AlertDialog musi używać `@radix-ui/react-alert-dialog` (CLAUDE.md, UI).

## What We're NOT Doing

- Filtrów, wyszukiwania, paginacji, sortowania przez użytkownika (PRD Non-Goals).
- Endpointu `GET /api/cards` — listę czyta strona SSR.
- Ręcznego tworzenia fiszek (PRD Non-Goals, v2) ani cofania usunięcia.
- Zmiany liczników przy usunięciu fiszki: **świadoma decyzja** — akceptacja już się odbyła, więc `accepted_count` zostaje, a odsetek akceptacji opisuje decyzje na ekranie przeglądu, nie stan talii.
- Ochrony metryki przed cyklem „usuń fiszkę → zaakceptuj tę samą propozycję ponownie” przez REST. Usunięcie zwalnia slot, więc `accepted` może rosnąć do sufitu `accepted = proposed`. To ryzyko przyjęte w S-03 (tylko własne dane, ≤ 5 użytkowników); zwykłe UI na to nie pozwala. Grant kolumnowy zamyka tylko drogę przez zmianę `generation_id`/`proposal_index`.
- Kolumny `updated_at` i kolumn powtórek (S-05).
- Zmian w `scripts/isolation-check.mjs` poza ewentualnym komentarzem przy asercji przepisania (asercje zostają).
- Zmian w test-planie: statusy faz rolloutu aktualizuje `/10x-test-plan`.
- Przeróbki dashboardu na tokeny (tylko link do `/cards`).
- Wdrożenia na produkcję (migracja to ręczna bramka, jak w S-03).

## Implementation Approach

Od dołu do góry, jak w S-03: najpierw baza i serwis z endpointami, dowiedzione testami jednostkowymi i integracyjnymi; potem strona i komponenty; na końcu E2E w przeglądarce, uruchamiany w istniejącym jobie `smoke`. Strona czyta listę na serwerze i przekazuje ją do jednej wyspy React, która trzyma listę w stanie i woła PATCH/DELETE.

## Critical Implementation Details

- **Konsekwencja grantu dla S-05.** Po tej migracji `authenticated` nie zmieni żadnej nowej kolumny `cards` przez REST. S-05 musi zapisywać stan powtórek funkcją `security definer` albo jawnie rozszerzyć grant kolumnowy. Dopisać to w notatkach `context/changes/srs-review-session/change.md`.
- **Fokus po usunięciu.** AlertDialog oddaje fokus przyciskowi, który znika razem z fiszką. Po udanym usunięciu fokus trafia na nagłówek listy (`tabIndex={-1}`), a region `aria-live` ogłasza „Usunięto fiszkę.”.

## Faza 1: Baza i API — grant kolumnowy, serwis, PATCH/DELETE

### Overview

Migracja ograniczająca `update` do `front`/`back`, operacje serwisu dla listy, edycji i usuwania, endpointy `/api/cards/[id]` oraz testy jednostkowe i integracyjne.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261027120000_cards_update_front_back_only.sql`

**Intent**: W bazie, nie tylko w endpoincie, zablokować zmianę kolumn innych niż treść, żeby nikt przez REST nie przepiął fiszki na inną propozycję i nie zawyżył `accepted_count`, a przyszłe kolumny powtórek nie były edytowalne bezpośrednio.

**Contract**:
- `revoke all on public.cards from anon, authenticated;`
- `grant select, insert, delete on public.cards to authenticated;`
- `grant update (front, back) on public.cards to authenticated;`
- Polityki RLS bez zmian. Komentarz w migracji: dlaczego (FR-012, slot propozycji) i konsekwencja dla S-05.

#### 2. Typy

**File**: `src/types.ts`

**Intent**: Kontrakt edycji wspólny dla endpointu, hooka i testów.

**Contract**: `UpdateCardRequest { front: string; back: string }`, `UpdateCardResponse { card: SavedCard }`. `SavedCard` bez zmian.

#### 3. Serwis fiszek

**File**: `src/lib/services/cards.ts`

**Intent**: Wszystkie operacje na zapisanych fiszkach w jednym miejscu, z tym samym kontraktem błędów co akceptacja (kod + SQLSTATE, nigdy treść).

**Contract**:
- `listCards(supabase): Promise<SavedCard[]>` — `select id, front, back, created_at`, `order created_at desc, id desc`. Błąd → `CardSaveError("cards_not_loaded", code)`.
- `updateCard(supabase, id, { front, back }): Promise<SavedCard>` — `update({ front, back })` tylko z tymi dwoma polami, `eq("id", id)`, zwraca wiersz. Brak wiersza (nie istnieje albo cudzy przez RLS) → `card_not_found`. `23514` z constraintem `cards_front_not_blank`/`cards_back_not_blank` → `card_blank` z `blankField` (to samo rozpoznanie po `message` co w akceptacji, wspólna funkcja). Inny błąd → `card_not_saved`.
- `deleteCard(supabase, id): Promise<void>` — `delete().eq("id", id)` ze zwróceniem usuniętych id. 0 wierszy → `card_not_found`. Błąd → `card_not_deleted`.
- `CardSaveErrorCode` dostaje `card_not_found`, `card_not_deleted`, `cards_not_loaded`.

#### 4. Endpointy `PATCH` i `DELETE /api/cards/[id]`

**File**: `src/pages/api/cards/[id].ts`

**Intent**: Edycja treści i usunięcie jednej fiszki właściciela (FR-010), z kolejnością sprawdzeń i kształtem błędów jak w `src/pages/api/cards.ts`.

**Contract** (obie metody):
- `503 auth_unavailable`; `401 unauthorized` „Zaloguj się, aby zarządzać fiszkami.”; `400 invalid_request` dla `id` innego niż uuid.
- PATCH: body przez zod `.strict()` z `front`/`back` (string, `.max(2000)` każde — stała `MAX_CARD_TEXT_LENGTH` w `src/lib/card-content.ts`, liczona jak `String.prototype.length`); inne pola → `400 invalid_request` „Nieprawidłowe żądanie.”; przekroczenie limitu → `400 invalid_request` „Przód i tył fiszki mogą mieć najwyżej 2000 znaków.”. Limit dotyczy tylko PATCH, w endpoincie (nie w bazie i nie w `POST /api/cards`). Pusta treść (`isBlankCardText`) albo `card_blank` z bazy → `400 card_blank`. `200 { card }`.
- DELETE: bez body; sukces → `204` bez treści.
- `card_not_found` → `404` „Tej fiszki już nie ma. Mogła zostać usunięta w innej karcie.”.
- Klient `null` albo inny błąd → `500 card_not_saved` „Nie udało się zapisać fiszki. Spróbuj ponownie.” (PATCH) / `500 card_not_deleted` „Nie udało się usunąć fiszki. Spróbuj ponownie.” (DELETE) plus `console.error("cards: update failed" | "cards: delete failed", { code, cause })` bez `front`/`back`.
- Właściciel wynika z sesji (RLS), nigdy z body.

#### 5. Testy endpointów

**File**: `tests/api/cards-id.test.ts`, `tests/helpers/api-context.ts`

**Intent**: Zablokować kontrakt błędów, brak dodatkowych pól w zapisie i brak treści w logach, bez bazy.

**Contract**:
- `apiContext` dostaje opcjonalne `method` i `params` (domyślnie `POST`, `{}`); istniejące testy bez zmian.
- Stub `createClient` (`vi.mock("@/lib/supabase")`) z łańcuchem `from().update().eq().select()…` i `from().delete().eq().select()`.
- Przypadki: 503/401 bez wywołania bazy; zły uuid → 400; PATCH z dodatkowym polem (np. `generation_id`) → 400 i brak wywołania bazy; `front` albo `back` o długości 2001 → 400 `invalid_request` z komunikatem o limicie i brak wywołania bazy, a 2000 znaków przechodzi; pusta treść → 400 `card_blank`; argument `update()` w stubie to dokładnie `{ front, back }`; 0 wierszy → 404; `23514` z constraintem treści → 400, inny `23514` → 500; błąd bazy → 500 i log z kodem bez treści fiszki (marker jak w `tests/api/cards.test.ts`); DELETE sukces → 204, 0 wierszy → 404, błąd → 500 z logiem.

#### 6. Testy integracyjne na lokalnym Supabase

**File**: `tests/integration/manage-cards.test.ts`, `tests/integration/helpers.ts`

**Intent**: Dowieść odczytem z bazy, że edycja dotyka tylko treści, usunięcie nie rusza liczników, a konto B nie edytuje ani nie usuwa fiszek A — przez prawdziwe funkcje serwisu i bezpośrednio przez REST.

**Contract**:
- `localSupabase`/`signUp` przeniesione do `tests/integration/helpers.ts` i używane przez oba pliki (bez zmiany zachowania `accept-proposal.test.ts`).
- Fiszki testowe powstają przez `rpc("accept_proposal")`, żeby miały `generation_id` i `proposal_index`.
- Przypadki (każdy z odczytem wiersza po akcji):
  - `updateCard` przez A zmienia `front`/`back`; `generation_id`, `proposal_index`, `created_at`, `user_id` bez zmian;
  - `update` przez supabase-js jako A na `generation_id`, `proposal_index`, `created_at`, `user_id` → błąd `42501`, wiersz bez zmian;
  - `updateCard` i `deleteCard` przez B na id fiszki A → `card_not_found`, fiszka A bez zmian;
  - `updateCard` z treścią `"  \n"` wysłaną mimo walidacji → `card_blank`, wiersz bez zmian;
  - `deleteCard` przez A → fiszki nie ma, `accepted_count` i `proposed_count` generowania bez zmian;
  - `listCards` zwraca tylko fiszki właściciela, od najnowszej;
  - nieistniejący uuid → `card_not_found`.
- Wyrocznia: decyzje z tego planu i PRD FR-010/FR-012.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się na czystej bazie: `npx supabase db reset`
- Skrypt izolacji nadal przechodzi: `npm run isolation`
- Testy integracyjne przechodzą (stare i nowe): `npm run test:integration`
- Testy jednostkowe przechodzą: `npm test`
- Lint i typy: `npm run lint`, `npx astro check`

#### Manual Verification:

- W psql/Studio `\dp public.cards` pokazuje dla `authenticated` `select, insert, delete` na tabeli i `update` tylko na `front`, `back`; `anon` bez uprawnień
- Testy integracyjne zweryfikowane przez psucie: tymczasowe przywrócenie pełnego `grant update on public.cards` (po `git add` migracji) → po `db reset` pada test `42501`; tymczasowe dodanie `generation_id` do `update` w `updateCard` → pada test „tylko treść”; potem `git checkout -- <plik>`, pusty `git diff`, ponowny `db reset`
- Ręczny `PATCH`/`DELETE` przez DevTools przy `npm run dev` daje 200/204, a powtórny DELETE 404

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Faza 2: UI — strona `/cards` z edycją i usuwaniem

### Overview

Strona SSR z listą, wyspa React z edycją i usuwaniem przez okno potwierdzenia, hook akcji, nawigacja i bramki UI.

### Changes Required:

#### 1. AlertDialog

**File**: `src/components/ui/alert-dialog.tsx`, `package.json`

**Intent**: Dostępne okno potwierdzenia usunięcia (fokus w oknie, Escape zamyka).

**Contract**: `npx shadcn@latest add alert-dialog`, potem import z `@radix-ui/react-alert-dialog` (pojedynczy pakiet, nie `radix-ui`) i `cn` z `@/lib/utils`. Tylko role tokenów.

#### 2. Hook akcji

**File**: `src/components/hooks/useSavedCardActions.ts`

**Intent**: Wywołania PATCH/DELETE z blokadą równoległych żądań dla tej samej fiszki i jednym sposobem czytania odpowiedzi (jak `useAcceptProposal`).

**Contract**:
- `updateCard(id, front, back)` i `deleteCard(id)` zwracają wynik `{ ok: true, card? } | { ok: false, message, gone: boolean }`; `gone` = odpowiedź 404.
- Blokada przez `useRef` (zbiór id w toku). Odpowiedź z błędem → `error.message`; błąd sieci lub nieczytelna odpowiedź → stały komunikat sieciowy; nigdy treść fiszki w logu.

#### 3. Lista i element fiszki

**File**: `src/components/cards/SavedCardList.tsx`, `src/components/cards/SavedCardItem.tsx`

**Intent**: Lista w stanie Reacta zainicjowanym z SSR; każdy element ma podgląd, edycję i usunięcie z potwierdzeniem.

**Contract**:
- `SavedCardList({ initialCards: SavedCard[] })`: nagłówek listy z `tabIndex={-1}`, region `aria-live`, stan pusty („Nie masz jeszcze zapisanych fiszek.” + link do `/generate`) także po usunięciu ostatniej.
- `SavedCardItem` — stany:
  - podgląd: przód, tył, „Edytuj”, „Usuń”;
  - edycja: `CardEditor` z treścią fiszki; sukces → podgląd z treścią z serwera; 404 → komunikat w edytorze, a „Anuluj” usuwa element z listy; inny błąd → edytor otwarty z wpisaną treścią;
  - usuwanie: AlertDialog „Usunąć tę fiszkę?” / „Tej operacji nie można cofnąć.” z „Usuń” i „Anuluj”; w trakcie przyciski nieaktywne; sukces lub 404 → element znika, fokus na nagłówek, ogłoszenie „Usunięto fiszkę.”; inny błąd → komunikat w oknie, fiszka zostaje.
- `aria-label` elementu oparty na przodzie fiszki (do lokalizacji w testach i czytnikach). Tylko role tokenów, `cn()`.

#### 4. Strona i nawigacja

**File**: `src/pages/cards.astro`, `src/middleware.ts`, `src/pages/dashboard.astro`, `src/pages/generate.astro`

**Intent**: Chroniona strona z listą czytaną na serwerze i drogi do niej z istniejących widoków.

**Contract**:
- `cards.astro`: układ jak `generate.astro` (Card, nagłówek „Moje fiszki”, link do panelu i do `/generate`); `createClient` + `listCards`. Klient `null` albo błąd → `console.error("cards: list failed", { code, cause })`, `Astro.response.status = 500` i komunikat „Nie udało się wczytać fiszek. Odśwież stronę.” zamiast listy; bez `return` we frontmatterze.
- `PROTECTED_ROUTES` dostaje `/cards`.
- Link „Moje fiszki” na dashboardzie i na `/generate`.

#### 5. Bramka UI i dokumentacja

**File**: `scripts/ui-literal-scan.mjs`, `CLAUDE.md`, `context/changes/srs-review-session/change.md`

**Intent**: Nowe widoki od razu pod `lint:ui`; opis projektu zgodny z kodem; konsekwencja grantu zapisana tam, gdzie zajrzy S-05.

**Contract**:
- Do listy skanu: `src/pages/cards.astro`, `SavedCardList.tsx`, `SavedCardItem.tsx`.
- CLAUDE.md (Project): zarządzanie zapisanymi fiszkami istnieje (`/cards`, `PATCH`/`DELETE /api/cards/[id]`), `update` na `cards` tylko dla `front`/`back`; powtórki jeszcze nie.
- Notatka w `srs-review-session/change.md`: kolumny powtórek wymagają funkcji `security definer` albo rozszerzenia grantu kolumnowego.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run lint:ui`, `npx astro check`
- `npm test` przechodzi
- `npm run build` przechodzi (przy zatrzymanym `astro dev`)

#### Manual Verification:

- Na `/cards` (lokalny Supabase) lista pokazuje fiszki od najnowszej; bez fiszek widać stan pusty z linkiem do `/generate`
- „Edytuj” → zmiana → „Zapisz” pokazuje nową treść także po odświeżeniu; pusta treść blokuje zapis z polskim komunikatem
- „Usuń” otwiera okno; „Anuluj” nic nie zmienia; „Usuń” usuwa fiszkę także po odświeżeniu, a fokus trafia na nagłówek listy
- Fiszka usunięta w drugiej karcie: edycja pokazuje komunikat i znika po „Anuluj”, usunięcie po prostu ją zdejmuje
- Przy zatrzymanym Supabase `/cards` pokazuje komunikat błędu (status 500), a błąd zapisu/usunięcia zostawia fiszkę z komunikatem
- Widok spójny z resztą w motywie `.dark`, fokus z klawiatury widoczny, okno zamyka się Escape

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Faza 3: E2E — edycja i usunięcie w przeglądarce

### Overview

Jeden spec przechodzi edycję i usunięcie zapisanej fiszki w przeglądarce i potwierdza wynik odczytem z bazy. Działa w istniejącym kroku Playwright joba `smoke`.

### Changes Required:

#### 1. Spec E2E

**File**: `tests/e2e/manage-saved-cards.spec.ts`, `tests/e2e/helpers.ts`

**Intent**: Pokazać FR-010 i ryzyko #3 tam, gdzie widzi je użytkownik, i potwierdzić je stanem w bazie.

**Contract**:
- `SupabaseRest` dostaje `insert<T>(table, row)` (POST z `return=representation`); spec zakłada dwie fiszki z unikalnym tokenem jako użytkownik E2E.
- Na `/cards`: obie fiszki widoczne, nowsza wyżej; edycja pierwszej (przód i tył) → treść w UI; usunięcie drugiej: „Anuluj” w oknie zostawia ją, potem „Usuń” ją zdejmuje.
- Asercje w bazie: pierwsza fiszka ma nową treść, druga nie istnieje.
- Sprzątanie: usunięcie fiszek z tokenem; nagłówek w stylu istniejących speców (risk, seed, co jest mockowane).
- Oczekiwanie na odpowiedź `PATCH`/`DELETE` przed asercjami UI (wzorzec z `accept-save-cards.spec.ts`).

### Success Criteria:

#### Automated Verification:

- Lokalnie `npx playwright test --workers=1` przechodzi (wszystkie spece, w tym nowy)
- W CI job `smoke` przechodzi na PR z nowym specem
- `npm run lint`, `npx astro check`

#### Manual Verification:

- Przy celowo zepsutym usuwaniu (np. `deleteCard` filtrujący po losowym uuid zamiast po `id` fiszki) nowy spec pada z czytelną przyczyną
- Przegląd specu: asercje na stan w bazie, nie tylko na UI i statusy

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `tests/api/cards-id.test.ts`: kolejność 503 → 401 → 400, `.strict()` body, dokładne pola `update`, mapowanie 404/`card_blank`/500, 204 dla DELETE, logi bez treści.

### Integration Tests:

- `tests/integration/manage-cards.test.ts` (lokalny Supabase): tylko `front`/`back` przez serwis, `42501` dla innych kolumn przez REST, B dostaje `card_not_found`, usunięcie nie zmienia liczników, kolejność i izolacja listy, pusta treść z bazy.
- `scripts/isolation-check.mjs`: bez nowych asercji; musi przejść po zmianie grantu.
- E2E `manage-saved-cards.spec.ts`: edycja, anulowane i potwierdzone usunięcie, stan w bazie.

### Manual Testing Steps:

1. Zaakceptuj kilka propozycji na `/generate`, przejdź do „Moje fiszki”, sprawdź kolejność.
2. Popraw fiszkę, odśwież stronę, sprawdź treść; w Studio sprawdź, że `generation_id`/`proposal_index` się nie zmieniły.
3. Usuń fiszkę z potwierdzeniem; w Studio `accepted_count` jej generowania bez zmian.
4. Usuń fiszkę w drugiej karcie i spróbuj ją edytować w pierwszej.

## Performance Considerations

Brak istotnych: lista bez paginacji (świadomie, PRD Non-Goals), jedno zapytanie po indeksie `cards_user_id_idx` przy ≤ 5 użytkownikach i dziesiątkach–setkach fiszek.

## Migration Notes

Migracja zmienia tylko uprawnienia, bez danych. Wycofanie: nowa migracja z `grant update on public.cards to authenticated`. Na produkcji ręczna bramka po S-03 (ta sama kolejka co migracje S-03). Konsekwencja dla S-05 opisana w Critical Implementation Details.

## References

- Roadmap: `context/foundation/roadmap.md` (S-04)
- PRD: `context/foundation/prd.md` (FR-010, FR-012, Guardrails, NFR, Non-Goals)
- Test plan: `context/foundation/test-plan.md` (ryzyko #3)
- S-03: `context/changes/accept-and-save-cards/plan.md` (decyzja o slocie po usunięciu, wzorce endpointu i testów)
- S-05 research: `context/changes/srs-review-session/research.md:51`
- Wzorce: `src/pages/api/cards.ts`, `src/lib/services/cards.ts`, `src/components/hooks/useAcceptProposal.ts`, `src/components/cards/CardEditor.tsx`, `tests/api/cards.test.ts`, `tests/integration/accept-proposal.test.ts`, `tests/e2e/accept-save-cards.spec.ts`
- Lekcje: `context/foundation/lessons.md` (revoke przed grant, bez `return` we frontmatterze, bramki po kodzie wyjścia)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza i API — grant kolumnowy, serwis, PATCH/DELETE

#### Automated

- [x] 1.1 Migracja aplikuje się na czystej bazie: `npx supabase db reset` — 785f7e7
- [x] 1.2 Skrypt izolacji nadal przechodzi: `npm run isolation` — 785f7e7
- [x] 1.3 Testy integracyjne przechodzą (stare i nowe): `npm run test:integration` — 785f7e7
- [x] 1.4 Testy jednostkowe przechodzą: `npm test` — 785f7e7
- [x] 1.5 Lint i typy: `npm run lint`, `npx astro check` — 785f7e7

#### Manual

- [x] 1.6 W psql/Studio `\dp public.cards` pokazuje dla `authenticated` `select, insert, delete` na tabeli i `update` tylko na `front`, `back`; `anon` bez uprawnień — 785f7e7
- [x] 1.7 Testy integracyjne zweryfikowane przez psucie: tymczasowe przywrócenie pełnego `grant update on public.cards` (po `git add` migracji) → po `db reset` pada test `42501`; tymczasowe dodanie `generation_id` do `update` w `updateCard` → pada test „tylko treść”; potem `git checkout -- <plik>`, pusty `git diff`, ponowny `db reset` — 785f7e7
- [x] 1.8 Ręczny `PATCH`/`DELETE` przez DevTools przy `npm run dev` daje 200/204, a powtórny DELETE 404 — 785f7e7

### Phase 2: UI — strona `/cards` z edycją i usuwaniem

#### Automated

- [x] 2.1 `npm run lint`, `npm run lint:ui`, `npx astro check`
- [x] 2.2 `npm test` przechodzi
- [x] 2.3 `npm run build` przechodzi (przy zatrzymanym `astro dev`)

#### Manual

- [x] 2.4 Na `/cards` (lokalny Supabase) lista pokazuje fiszki od najnowszej; bez fiszek widać stan pusty z linkiem do `/generate`
- [x] 2.5 „Edytuj” → zmiana → „Zapisz” pokazuje nową treść także po odświeżeniu; pusta treść blokuje zapis z polskim komunikatem
- [x] 2.6 „Usuń” otwiera okno; „Anuluj” nic nie zmienia; „Usuń” usuwa fiszkę także po odświeżeniu, a fokus trafia na nagłówek listy
- [x] 2.7 Fiszka usunięta w drugiej karcie: edycja pokazuje komunikat i znika po „Anuluj”, usunięcie po prostu ją zdejmuje
- [x] 2.8 Przy zatrzymanym Supabase `/cards` pokazuje komunikat błędu (status 500), a błąd zapisu/usunięcia zostawia fiszkę z komunikatem
- [x] 2.9 Widok spójny z resztą w motywie `.dark`, fokus z klawiatury widoczny, okno zamyka się Escape

### Phase 3: E2E — edycja i usunięcie w przeglądarce

#### Automated

- [ ] 3.1 Lokalnie `npx playwright test --workers=1` przechodzi (wszystkie spece, w tym nowy)
- [ ] 3.2 W CI job `smoke` przechodzi na PR z nowym specem
- [ ] 3.3 `npm run lint`, `npx astro check`

#### Manual

- [ ] 3.4 Przy celowo zepsutym usuwaniu (np. `deleteCard` filtrujący po losowym uuid zamiast po `id` fiszki) nowy spec pada z czytelną przyczyną
- [ ] 3.5 Przegląd specu: asercje na stan w bazie, nie tylko na UI i statusy
