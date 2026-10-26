# Akceptacja i zapis fiszek (S-03) — Plan Brief

> Full plan: `context/changes/accept-and-save-cards/plan.md`

## What & Why

Użytkownik akceptuje, poprawia albo usuwa każdą propozycję AI, a zaakceptowane fiszki zapisują się od razu na jego koncie. To gwiazda przewodnia roadmapy: sprawdza główne założenie produktu, że fiszki z AI są na tyle dobre, by je akceptować (cel ≥ 75%). Dlatego każde generowanie zapisuje liczniki `proposed` i `accepted` (FR-012).

## Starting Point

`/generate` pokazuje propozycje tylko do odczytu, a `/api/generate` niczego nie zapisuje i nie nadaje propozycjom id. Tabela `cards` z RLS istnieje (F-01), ale żaden kod jej jeszcze nie używa, a liczniki F-01 świadomie odłożył do S-03.

## Desired End State

Każda propozycja ma „Akceptuj”, „Popraw” i „Usuń”. Akceptacja (także po poprawce) zapisuje fiszkę i podbija `accepted` w jednej transakcji; ponowienie nie tworzy duplikatu. Odsetek akceptacji to `accepted / proposed` z tabeli `generations`. Wszystko jest dowiedzione testami z odczytem z bazy, w tym E2E w CI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Metryka | 2 liczniki na generowanie, odsetek = `accepted/proposed`; usunięte i porzucone = niezaakceptowane | Dosłownie FR-012; ryzyko #1 sprawdzane tym, że po usunięciu `accepted` się nie zmienia. |
| „Usuń” | Tylko w UI, bez serwera, bez potwierdzenia | Bez licznika `rejected` nie ma czego zapisywać. |
| Model danych | Tabela `generations` + `cards.generation_id`/`proposal_index` (unikalne), złożony FK `(generation_id, user_id)` | Liczniki przeżyją usunięcie fiszki w S-04; klucz daje idempotencję; złożony FK blokuje podpięcie fiszki pod cudze generowanie. |
| Ochrona liczników | `authenticated` ma tylko `select, insert` (insert z `accepted = 0`); CHECK `proposed 1..10`, `0 ≤ accepted ≤ proposed`; licznik zmienia tylko funkcja | Licznika nie da się zmienić bezpośrednio (PATCH) ani podbić ponad `proposed`; zawyżenie przez własne generowania jest zaakceptowanym ryzykiem (Open Risks). |
| Funkcja akceptacji | `security definer`, `search_path = ''`, jawne `auth.uid()`, sprawdza właściciela i zakres indeksu, `on conflict do nothing`, inkrement tylko przy nowym wierszu | Zapis i licznik atomowo; powtórka zwraca istniejącą fiszkę jako sukces. |
| Podwójne kliknięcie / błąd zapisu | Blokada przycisku; przy błędzie treść zostaje z polskim komunikatem i „Spróbuj ponownie”; UI pokazuje treść z serwera; log z kodem i przyczyną, bez treści | Guardrail „zaakceptowane fiszki nigdy nie giną”, bez duplikatów i ukrytych błędów. |
| Edycja | Wspólny `CardEditor` z `onSave(front, back)` z zewnątrz; „Zapisz” = akceptacja; pusta treść blokuje zapis; przy błędzie edytor zostaje otwarty | Jeden komponent dla S-03 i S-04 (PATCH tylko front/back). |
| Brak zapisu generowania | 503 `generation_not_saved`, log z przyczyną, tekst zostaje w polu; 0 propozycji → brak wiersza, `generationId: null` | Nie ma propozycji, których akceptacji nie da się policzyć. |
| Testy | Vitest `tests/integration/` na lokalnym Supabase (job `smoke`), rozszerzony skrypt izolacji, 1 E2E + Playwright w CI | Ryzyka #1 i #3 dowiedzione stanem w bazie; `npm test` zostaje bez bazy. |

## Scope

**In scope:** migracja `generations` + powiązanie fiszek + funkcja `accept_proposal`; `generationId` w `/api/generate`; `POST /api/cards`; `CardEditor`, `ProposalItem`, hook zapisu; testy jednostkowe, integracyjne, izolacji i E2E; Playwright w jobie `smoke`.

**Out of scope:** licznik `rejected`, cofanie usunięcia, edycja/usuwanie zapisanych fiszek (S-04), kolumny powtórek (S-05), limit długości treści, widok metryki, ochrona metryki przed zawyżeniem przez właściciela, zmiany definicji ryzyk w test-planie (statusy faz 2–3 i cookbook §6.2/§6.4 aktualizuje po S-03 `/10x-test-plan`), wdrożenie na produkcję.

## Architecture / Approach

`/api/generate` → AI → insert `generations(proposed)` → `{ proposals, generationId }`. W UI każda akceptacja → `POST /api/cards { generationId, proposalIndex, front, back }` → `rpc accept_proposal` (blokada wiersza generowania, insert fiszki `on conflict do nothing`, `accepted + 1` tylko przy nowym wierszu) → `201`/`200 { card, created }`. Logika licznika jest w bazie, endpoint tylko waliduje i mapuje błędy.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza | Tabela, złożony FK, funkcja akceptacji, izolacja, testy integracyjne w CI | Luka w uprawnieniach funkcji `security definer` lub w FK |
| 2. API | `generationId`, `POST /api/cards`, serwis, testy ze stubem | Błąd zapisu zamieniony w ciszę zamiast 503/500 z logiem |
| 3. UI | `CardEditor` (wspólny z S-04), stany propozycji, blokada | Utrata poprawionej treści przy błędzie |
| 4. E2E | Spec akceptuj/popraw/usuń z odczytem liczników, Playwright w jobie `smoke` | Konflikt portów z krokiem smoke w CI |

**Prerequisites:** lokalny Supabase (`npx supabase start`, potwierdzanie emaila wyłączone), `.dev.vars.e2e` dla E2E; S-02 i F-01 w `main`.
**Estimated effort:** ~4 sesje, po jednej na fazę.

## Open Risks & Assumptions

- **Zaakceptowane: użytkownik może zawyżyć własną metrykę przez REST.**
  - Może wstawić generowanie z `proposed = 1` i od razu zaakceptować indeks 0, co daje 1/1.
  - Może przejść cykl akceptuj → usuń fiszkę → akceptuj ponownie. Usunięcie zwalnia slot propozycji, więc `accepted` rośnie znowu, aż do sufitu `accepted = proposed`.
  - Akceptujemy to, bo dotyczy tylko własnych danych i ≤ 5 użytkowników.
  - W S-04 (usuwanie w UI) usunięcie fiszki nie cofa `accepted` i zwalnia slot; zwykłe UI `/generate` nie pozwala na ponowną akceptację zapisanej propozycji.
- `on delete set null (generation_id)` wymaga Postgresa 15+ (lokalny i hostowany Supabase to spełniają; do potwierdzenia przy migracji).
- Produkcja: migracja to ręczna bramka i czeka na domknięcie S-02 fazy 4 (sekret OpenRouter i deploy).
- Zgodność `isBlankCardText` z CHECK `^\s*$` dla rzadkich znaków Unicode nie jest gwarantowana; ostatecznym strażnikiem jest baza (`23514` → `400 card_blank`).

## Success Criteria (Summary)

- Zaakceptowana (także poprawiona) propozycja jest w bazie na koncie właściciela, a `accepted` rośnie dokładnie o 1, także przy ponowieniu.
- Usunięcie propozycji nie zmienia `accepted`; odsetek akceptacji da się policzyć z `generations`.
- Testy integracyjne, izolacji i E2E przechodzą w CI.
