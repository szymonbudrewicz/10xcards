# Ochrona generowania (rollout Phase 1) — Plan Brief

> Full plan: `context/changes/testing-generation-guard/plan.md`
> Research: `context/changes/testing-generation-guard/research.md`

## What & Why

Projekt nie ma żadnego runnera testów, a endpoint generowania wywołuje płatne AI na
wklejonym tekście. Stawiamy Vitest i dowodzimy testami ryzyk #4 i #5 z test-planu:
złe wejście lub brak sesji nie wywołują AI i dają czytelny błąd, błąd AI jest czytelny,
wynik ma maks. 10 propozycji, a wklejony tekst nie trafia do logów ani poza AI.

## Starting Point

Endpoint `src/pages/api/generate.ts` i serwis `src/lib/services/card-generation.ts`
działają; jedyne pokrycie to smoke w CI, który sprawdza tylko status i kod błędu —
nie dowodzi braku wywołania AI, nie dotyka limitu 10 ani logów.

## Desired End State

`npm test` w jobie `ci` uruchamia testy w `tests/`, które padają przy każdej z nazwanych
regresji (zniknięta sesja, przesunięta granica, brak limitu, wyciek tekstu do logów,
dodatkowe wyjście sieciowe) — potwierdzone ręcznym „zepsuj → pada ten test”. Stryker
uruchomiony raz, żywe mutanty ocenione. §6 test-planu i `CLAUDE.md` opisują, jak testujemy.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Warstwa testów | Endpoint wywołany bezpośrednio + unit serwisu, stub globalnego `fetch` | Najtańszy prawdziwy sygnał; `fetch` to jedyna granica sieci i licznik „AI nie wywołane” | Research |
| Komunikaty błędów | Status + `code` + `message` niepusty i bez wklejonego tekstu | Kod to kontrakt; dokładne zdanie zmienia się przy poprawkach tekstu | Plan |
| Emoji (UTF-16 = 2 znaki) | Nie testujemy, zapisane jako znana rozbieżność | Decyzja produktowa, źródła nie rozstrzygają | Plan |
| Tekst w polu, podwójne kliknięcie | Poza zakresem → Phase 2 e2e | Zachowanie przeglądarki; e2e i tak musi to sprawdzić | Research / Plan |
| Stryker | Ostatnia faza, jednorazowo, bez CI | Druga połowa lekcji; lekcja odradza bramkę na każdy commit | Plan |
| `astro:env/server` | Alias na zaślepkę zamiast `getViteConfig` | Unika ładowania adaptera Cloudflare/workerd w testach | Research |
| Lokalizacja testów | `tests/` w korzeniu | Pliki w `src/pages/` Astro zamienia w trasy | Plan |
| Wyrocznia | Literały z PRD (10 000, 10), nie stałe z kodu | Unika testu lustrzanego | Research |

## Scope

**In scope:** Vitest 5.0.5 + config + `npm test` w CI; testy 401, walidacji, 503,
mapowania błędów AI, limitu 10, prywatności logów/odpowiedzi, wyjścia sieciowego;
Stryker jednorazowo; cookbook §6 i notka w `CLAUDE.md`.

**Out of scope:** testy UI/przeglądarki, dokładne treści komunikatów, emoji, zapytania
do bazy, Stryker w CI, zmiany kodu produkcyjnego (chyba że test ujawni błąd — wtedy STOP).

## Architecture / Approach

`tests/api/generate.test.ts` wywołuje `POST(context)` ze sztucznym `APIContext`
(`locals.user`, `Request`); `tests/services/card-generation.test.ts` woła serwis. Globalny
`fetch` jest stubowany per test (odpowiedź OpenRouter lub błąd), `console` szpiegowany,
`astro:env/server` podmieniony aliasem w `vitest.config.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Vitest + 401 | Runner, `npm test` w CI, test 401 + 0 wywołań AI | Alias wirtualnego modułu Astro / typy w `astro check` |
| 2. Walidacja wejścia | Pusty, białe znaki, 10 000/10 001, nie-JSON, 503 | Test lustrzany przez import stałych |
| 3. AI i prywatność | Limit 10, błędy AI 502/504, logi i wyjście sieciowe | Przeciekanie stubów między testami |
| 4. Stryker | Mutation score + decyzje o żywych mutantach | Pogoń za 100% kosztem kruchych testów |
| 5. Cookbook | §6 test-planu, notka w `CLAUDE.md`, statusy | — |

**Prerequisites:** Node ≥ 22.12 (lokalnie 24.21, CI 22); bez Supabase i bez sieci.
**Estimated effort:** ~1–2 sesje, 5 krótkich faz.

## Open Risks & Assumptions

- `vi.mock`/alias dla `astro:env/server` wymaga potwierdzenia w fazie 1 (plan daje dwie drogi).
- Jeśli test ujawni realny błąd w kodzie produkcyjnym — zatrzymanie i decyzja użytkownika.

## Success Criteria (Summary)

- `npm test` zielony w CI, a każda nazwana regresja wywraca konkretny test.
- Każdy żywy mutant Strykera ma świadomą decyzję.
- Następny autor testu znajduje wzorzec w §6 test-planu.
