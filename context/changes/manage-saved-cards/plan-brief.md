# Lista zapisanych fiszek z edycją i usuwaniem (S-04) — Plan Brief

> Full plan: `context/changes/manage-saved-cards/plan.md`

## What & Why

Użytkownik widzi listę swoich zapisanych fiszek, poprawia ich treść i usuwa niepotrzebne (FR-010). Bez tego fiszki z S-03 lądują na koncie, ale nie da się nimi zarządzać. Przy okazji baza przestaje pozwalać na zmianę czegokolwiek poza treścią fiszki, bo przepięcie fiszki na inną propozycję przez REST zawyżało licznik akceptacji (FR-012).

## Starting Point

S-03 zapisuje zaakceptowane fiszki (`POST /api/cards`, `accept_proposal()`), a wspólny `CardEditor` czeka na S-04. Tabela `cards` ma RLS, ale `authenticated` może dziś zmienić przez REST każdą kolumnę własnej fiszki, w tym `generation_id` i `proposal_index`. Nie ma strony z listą ani endpointów edycji i usuwania.

## Desired End State

Chroniona strona `/cards` pokazuje fiszki od najnowszej. Każdą można poprawić w `CardEditor` albo usunąć po potwierdzeniu w oknie dialogowym. Edycja zmienia tylko `front`/`back` (pilnuje tego baza), usunięcie nie rusza liczników, a fiszka, której już nie ma, znika z listy z czytelnym komunikatem. Całość jest dowiedziona testami jednostkowymi, integracyjnymi i E2E w CI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Odczyt listy | SSR w `cards.astro` + jedna wyspa React; bez `GET /api/cards` | Mniej endpointów do zabezpieczenia i brak stanu ładowania; zgodne z `output: "server"`. |
| Uprawnienia | Migracja: `revoke all`, potem `select, insert, delete` i `update (front, back)` dla `authenticated` | Zmiana `generation_id`/`proposal_index` zwalniała slot i pozwalała ponownie zaakceptować propozycję (zawyżony `accepted_count`); baza, nie tylko endpoint, gwarantuje „edycja nie zeruje”. |
| Liczniki przy usunięciu | Bez zmian | Akceptacja już się odbyła; metryka opisuje decyzje na ekranie przeglądu, nie stan talii. |
| Potwierdzenie usunięcia | AlertDialog (shadcn, `@radix-ui/react-alert-dialog`) | Guardrail „zaakceptowane fiszki nigdy nie giną”; czytelne okno z fokusem w środku. |
| Kolejność | `created_at` malejąco, przy remisie `id` | Świeżo zaakceptowane fiszki są na górze po powrocie z `/generate`. |
| Brak fiszki / cudza | `404 card_not_found`; UI zdejmuje ją z listy (przy edycji po „Anuluj”) | Lista zgadza się z bazą, a edycja nie tworzy fiszki od nowa; cudza jest nieodróżnialna od brakującej. |
| Endpointy | `PATCH`/`DELETE /api/cards/[id]`, body PATCH `.strict()` z `front`/`back`, DELETE → 204 | Ten sam kształt błędów i kolejność 503 → 401 → 400 co w S-03; dodatkowe pola odrzucone wprost. |
| Limit długości przy edycji | `.max(2000)` na `front`/`back` w PATCH → `400 invalid_request` z polskim komunikatem; tylko w endpoincie | Ogranicza rozmiar zapisu przez edycję bez zmiany kontraktu bazy i akceptacji (`POST /api/cards` bez limitu). |
| Testy | Unit (kontrakt), integracja na lokalnym Supabase (kolumny, `42501`, izolacja, liczniki), 1 spec E2E | Ryzyko #3 i „edycja nie zeruje” dowiedzione odczytem z bazy przed S-05. |

## Scope

**In scope:** migracja z grantem kolumnowym; `listCards`/`updateCard`/`deleteCard`; `PATCH`/`DELETE /api/cards/[id]`; strona `/cards`, `SavedCardList`, `SavedCardItem`, hook akcji, AlertDialog; linki z dashboardu i `/generate`; `PROTECTED_ROUTES`, `lint:ui`, CLAUDE.md; testy unit, integracyjne i E2E.

**Out of scope:** filtry, wyszukiwanie, paginacja; `GET /api/cards`; ręczne tworzenie i cofanie usunięcia; zmiana liczników przy usunięciu; ochrona przed cyklem „usuń → zaakceptuj ponownie” przez REST (ryzyko przyjęte w S-03); `updated_at` i kolumny powtórek; przeróbka dashboardu na tokeny; test-plan; produkcja.

## Architecture / Approach

`/cards` (SSR) → `listCards` → `SavedCardList` (stan listy) → `SavedCardItem` → `useSavedCardActions` → `PATCH`/`DELETE /api/cards/[id]` → serwis → Supabase z sesją użytkownika (RLS + grant kolumnowy). Endpoint waliduje i mapuje błędy; o właścicielu i dozwolonych kolumnach decyduje baza.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza i API | Grant kolumnowy, serwis, `PATCH`/`DELETE`, testy unit + integracja | Grant psuje istniejącą ścieżkę (izolacja, akceptacja) |
| 2. UI | Strona `/cards`, edycja, usuwanie z AlertDialog, nawigacja | Fokus i stan listy po usunięciu; zbiorczy `radix-ui` w Workers |
| 3. E2E | Spec edycji i usunięcia z odczytem z bazy, w jobie `smoke` | Kruchość czasowa lokalnie (wzorzec: czekać na odpowiedź) |

**Prerequisites:** S-03 (PR #17) zmergowany albo gałąź S-04 wychodzi z gałęzi S-03; lokalny Supabase i `.dev.vars.e2e`.
**Estimated effort:** ~3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- **S-05 musi zapisywać stan powtórek funkcją `security definer` albo rozszerzyć grant kolumnowy.** Po tej migracji `authenticated` nie zmieni przez REST żadnej nowej kolumny `cards`. Notatka trafia do `srs-review-session/change.md`.
- Cykl „usuń fiszkę → zaakceptuj tę samą propozycję ponownie” przez REST nadal podbija `accepted` (do sufitu `accepted = proposed`). Grant zamyka tylko drogę przez zmianę kolumn powiązania.
- Produkcja: migracja to ręczna bramka w tej samej kolejce co migracje S-03.

## Success Criteria (Summary)

- Użytkownik widzi, poprawia i usuwa swoje fiszki na `/cards`, a zmiany zostają po odświeżeniu.
- Edycja nie zmienia nic poza `front`/`back`, nawet przez REST; usunięcie nie zmienia liczników; konto B nie dotknie fiszek A.
- Testy jednostkowe, integracyjne i E2E przechodzą w CI.
