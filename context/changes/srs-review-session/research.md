---
date: 2026-10-20T19:09:05+02:00
researcher: Szymon Budrewicz (z agentem Claude Code)
git_commit: 95d24242c72e66e9e8fd9b41850e8d1015dbee07
branch: main
repository: 10x
topic: "Jak dołożyć stan powtórek FSRS (ts-fsrs) do 10xCards: przechowywanie stanu, konwencje strony/API, zgodność ze stackiem"
tags: [research, codebase, srs, ts-fsrs, supabase, rls, middleware, cloudflare]
status: complete
last_updated: 2026-10-20
last_updated_by: Szymon Budrewicz (z agentem Claude Code)
---

# Research: stan powtórek FSRS w 10xCards

**Date**: 2026-10-20T19:09:05+02:00
**Researcher**: Szymon Budrewicz (z agentem Claude Code)
**Git Commit**: 95d24242c72e66e9e8fd9b41850e8d1015dbee07
**Branch**: main
**Repository**: 10x

## Research Question

Jak dołożyć stan powtórek FSRS (ts-fsrs) do istniejącego projektu: gdzie trzymać stan karty (kolumny `cards` vs osobna tabela, RLS, migracje), jakie konwencje API/błędów/middleware obowiązują dla nowej strony sesji i endpointu oceny, oraz czy ts-fsrs pasuje do stacku Astro SSR + Cloudflare. Wejście zewnętrzne: `context/changes/srs-review-session/ts-fsrs.md`.

## Summary

1. **Przechowywanie stanu.** Dotychczasowe dokumenty zakładają **kolumny powtórek w `cards`** jako osobną migrację S-05 (`context/archive/2026-10-19-cards-table-with-isolation/plan.md:33`, `:210`; `context/foundation/roadmap.md:85`), choć nikt nie porównał tego wprost z osobną tabelą. Kolumny w `cards` są pokryte istniejącymi 4 politykami RLS (`supabase/migrations/20261019120000_create_cards.sql:20-36`). Edycja bez resetu i kasowanie razem z fiszką wychodzą wtedy z samego modelu „jeden wiersz”. Osobna tabela 1:1 wymaga nowego kompletu RLS, rozwiązania problemu przypinania wiersza do cudzej karty i równoległego zestawu testów izolacji. Szczegóły w „Detailed Findings → Warstwa danych”.
2. **Konwencje strony i API.** Na tym commicie nie istnieje żaden endpoint JSON, sprawdzanie `locals.user` w API, walidacja zod, `src/lib/services/` ani `src/types.ts`. Endpoint oceny będzie pierwszym takim wzorcem. Musi sam zwracać 401 w kształcie `{ error: { code, message } }` (`context/foundation/lessons.md`, wpis o 401), bo middleware chroni tylko `/dashboard` przez przekierowanie (`src/middleware.ts:4`, `:18-22`).
3. **Zgodność ts-fsrs.** Analiza statyczna nie znalazła przeszkód. Paczka nie ma importów ani API Node (`dist/index.mjs`), Node w projekcie to 22.14.0 (`.nvmrc`), a `tsc 6.0.3` z ustawieniami projektu przeszedł próbny import (wynik subagenta, scratchpad). Jedna uwaga: przy imporcie paczka dopisuje 4 metody do globalnego `Date.prototype` (`dist/index.mjs:99-113`). Build i uruchomienie w workerd nie były wykonane.

## Detailed Findings

### Warstwa danych (Supabase)

- Schemat `cards`: `id`, `user_id default auth.uid()` z `on delete cascade` do `auth.users`, `front`, `back`, `created_at timestamptz`. Brak `updated_at` (`supabase/migrations/20261019120000_create_cards.sql:2-10`).
- Indeks `cards_user_id_idx` na `(user_id)` (`20261019120000_create_cards.sql:12`). Konwencja nazw: `<tabela>_<kolumny>_idx`.
- RLS włączony (`:14`), 4 polityki dla `authenticated`: `cards_{select,insert,update,delete}_own` z `user_id = (select auth.uid())`. Update ma USING i WITH CHECK (`:20-36`).
- Uprawnienia naprawione w drugiej migracji: `revoke all ... from anon, authenticated` + `grant select, insert, update, delete` (`supabase/migrations/20261020120000_cards_tighten_constraints_and_privileges.sql:2-3`). Reguła z `context/foundation/lessons.md` dotyczy każdej migracji z nowym `grant`.
- Nazwy migracji: `YYYYMMDDHHmmss_opis.sql`, obie istniejące mają godzinę 12:00:00 w kolejnych dniach. Następna musi mieć późniejszy znacznik niż `20261020120000`.
- Brak wygenerowanych typów bazy i parametru `Database` w `createServerClient` (`src/lib/supabase.ts:9`). Na tym commicie w `src/` nie ma pliku `types.ts`. F-01 świadomie to odłożył (`context/archive/2026-10-19-cards-table-with-isolation/plan.md:34`).
- Na tym commicie żaden kod w `src/` nie czyta ani nie zapisuje `cards` (wynik grep subagenta). Pierwszy zapis pojawi się w S-03.
- `scripts/isolation-check.mjs` testuje tylko `/rest/v1/cards`: odczyt, zmianę, usunięcie i podszywanie się przez konto B, przeniesienie karty na innego właściciela, puste pola oraz brak dostępu anon. Przy kolumnach w `cards` istniejące asercje dalej obowiązują. Warto dodać: B nie zmienia `due`/`state` A, edycja `front` przez A nie zmienia kolumn powtórek, CHECK zakresu `state`. Przy osobnej tabeli trzeba by dodać pełny równoległy zestaw dla nowej tabeli i kaskady.

#### Porównanie wariantów przechowywania

| Kryterium | (a) kolumny w `cards` | (b) tabela 1:1 `card_review_state` | (c) kolumna `jsonb` |
|---|---|---|---|
| RLS / izolacja | istniejące 4 polityki (`create_cards.sql:20-36`) | nowa tabela: enable RLS, revoke+grant, 4 polityki, ochrona przed przypięciem do cudzej `card_id` | jak (a) |
| Edycja bez resetu (`prd.md:84`) | PATCH `front/back` nie dotyka innych kolumn; ryzyko: aplikacja wysyła cały wiersz | gwarantowana strukturą (inna tabela) | jak (a) |
| Kasowanie z fiszką (`prd.md:84`) | ten sam wiersz | `on delete cascade` | ten sam wiersz |
| Indeks „do powtórki” | `(user_id, due)` | `(user_id, due)` przy zdenormalizowanym `user_id`, inaczej join | słaby: wyrażenie `(fsrs->>'due')::timestamptz` nie jest IMMUTABLE, więc potrzebna osobna kolumna `due` |
| Nowa fiszka (S-03) | domyślne wartości kolumn = `createEmptyCard()`; insert `{front, back}` wystarcza | wiersz trzeba utworzyć triggerem, drugim zapisem w aplikacji albo traktować brak wiersza jako „nowa” | domyślna wartość jsonb |
| Walidacja w DB | CHECK na `state`, `reps` itd. | jak (a) | brak |
| Zgodność z wcześniejszymi zapisami | tak (`plan.md:33`, `:210`, `roadmap.md:85`) | nie | nie |

Wniosek (nie decyzja): wcześniejsze zapisy i najmniejszy koszt izolacji wskazują na (a). Wada (a), potwierdzona tym, że polityka update działa na poziomie wiersza (`create_cards.sql:28-32`): właściciel może przez REST samodzielnie zmienić swoje `due`/`stability`. Dotyczy to tylko jego własnych danych.

### Strona sesji i endpoint oceny

- `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:4`), dopasowanie przez `startsWith` (`:18`), bez sesji przekierowanie na `/auth/signin` (`:20`). Dodanie `"/review"` objęłoby też każdą ścieżkę zaczynającą się od `/review` (np. `/reviews`). Ścieżki `/api/*` nie są objęte.
- `locals.user` jest ustawiany przy każdym żądaniu (`src/middleware.ts:7-16`). `App.Locals` ma jedno pole `user` (`src/env.d.ts:2-4`), klienta Supabase w locals nie ma. Endpoint musi więc wywołać `createClient(headers, cookies)` i sprawdzić `null` (`src/lib/supabase.ts:5-8`, CLAUDE.md, sekcja Architecture).
- Istniejące endpointy na tym commicie to 3 pliki w `src/pages/api/auth/` (`signin.ts`, `signup.ts`, `signout.ts`). Wszystkie używają `export const POST: APIRoute`, `formData()` i przekierowań. Żaden nie zwraca JSON. `signin.ts:11` i `signup.ts:11` przekazują angielski komunikat w query stringu, a `signin.ts:16` i `signup.ts:16` surowy `error.message` z Supabase. Te 3 pliki nie są zgodne z regułą błędów z CLAUDE.md (kształt JSON, kod snake_case, komunikat po polsku), więc nie nadają się na wzór dla `/api/reviews`.
- Wymagane zachowanie endpointu: sprawdzić `locals.user` i bez sesji zwrócić 401 JSON. Nie polegać na PROTECTED_ROUTES (`context/foundation/lessons.md`, wpis „Endpointy API wywołujące AI wymagają sesji”; reguła dotyczy endpointów AI, ale jej uzasadnienie, czyli przekierowanie zamiast 401, odnosi się do każdego endpointu JSON).
- Walidacja: w `package.json` jest `zod` `^4.6.7`, na tym commicie nieużywany w `src/`. To API v4.
- Strony: `src/pages/dashboard.astro` czyta `Astro.locals.user` i opakowuje treść w `Layout`. Wyspy React montowane są przez `client:load` (`src/pages/auth/signin.astro:14`). Komponenty UI z shadcn: na tym commicie tylko `src/components/ui/button.tsx`. `cn()` jest w `src/lib/utils.ts:4`.
- Rozjazd konfiguracji: `components.json` ma alias hooks `@/hooks`, a CLAUDE.md każe trzymać hooki w `src/components/hooks/` (katalog na tym commicie nie istnieje).

### Zgodność ts-fsrs ze stackiem

- Adapter Cloudflare, `output: "server"`, bez ustawień `ssr.noExternal`/`external` (`astro.config.mjs:11`, `:18`). Domyślnie zależności są bundlowane do workera.
- `wrangler.jsonc:5-6`: `compatibility_date: 2026-05-08`, `nodejs_compat`. Node: `.nvmrc` = `22.14.0`, CI na Node 22 (`.github/workflows/ci.yml:16`, `:33`). Paczka wymaga Node ≥ 20.
- Mapa `exports` ts-fsrs ma warunki `require`, `import`, `umd`, `default`, `types`, w tej kolejności (`package.json:9-17` paczki). `types` jest ostatni. TypeScript w trybie Bundler i tak znajduje `dist/index.d.ts` (sprawdzone przez subagenta `tsc 6.0.3 --traceResolution` w scratchpadzie). Próbny plik z `fsrs`, `createEmptyCard`, `next`, `Rating`, `Card` przeszedł type-check.
- W przejrzanym `dist/index.mjs` subagent nie znalazł: `require(`, `process.`, `Buffer`, importów `node:`, `eval`, `new Function`, dynamicznego `import()` ani `Intl`.
- **Efekt uboczny importu:** paczka dopisuje `scheduler`, `diff`, `format`, `dueFormat` do `Date.prototype` (`dist/index.mjs:99-113`). Działa to w workerze, ale zmienia globalny obiekt w całym procesie.
- Daty: wejście `Date | number | string` (`TypeConvert.time`, `dist/index.mjs:69-87`), więc stringi ISO z `timestamptz` przechodzą. Różnice dni liczone są w UTC. W Workers zegar przesuwa się dopiero po I/O, dlatego warto przekazywać `now` jawnie do `next()`.
- W repo na tym commicie jedyną konwencją dat jest `created_at timestamptz default now()` (`create_cards.sql:7`).

## Code References

- `supabase/migrations/20261019120000_create_cards.sql:2-36` – schemat, indeks, RLS `cards`
- `supabase/migrations/20261020120000_cards_tighten_constraints_and_privileges.sql:2-9` – revoke/grant, CHECK pustych pól
- `scripts/isolation-check.mjs` – testy izolacji A/B/anon dla `cards`
- `src/middleware.ts:4-22` – PROTECTED_ROUTES i przekierowanie
- `src/lib/supabase.ts:5-20` – `createClient`, zwraca `null` bez env
- `src/env.d.ts:2-4` – `App.Locals.user`
- `src/pages/api/auth/signin.ts:5-16` – jedyny wzorzec endpointu (formularz + redirect, nie JSON)
- `src/pages/dashboard.astro` – wzorzec chronionej strony
- `astro.config.mjs:11-18`, `wrangler.jsonc:4-6`, `.nvmrc` – runtime
- `context/changes/srs-review-session/ts-fsrs.md` – wybór biblioteki i API (research zewnętrzny)

## Architecture Insights

- Izolację danych zapewnia RLS w bazie, nie kod aplikacji (`create_cards.sql:1`). Nowe dane powtórek powinny zachować tę zasadę.
- Warstwa API/usług/typów jest na tym commicie pusta. S-05 (albo wcześniej S-03) ustanowi pierwszy wzorzec: endpoint JSON, helper błędów, serwis w `src/lib/services/`, DTO w `src/types.ts`, walidacja zod v4. Warto ustalić go raz i przenieść do S-03/S-04.
- Weryfikacja odbywa się przez skrypty (`npm run smoke`, `npm run isolation`), w projekcie nie ma runnera testów jednostkowych (CLAUDE.md, Commands). Test FR-013 („termin zmienia się po ocenie”, `prd.md:90`) trzeba więc wpisać w jeden z tych skryptów albo dodać runner.

## Historical Context (from prior changes)

- `context/archive/2026-10-19-cards-table-with-isolation/plan.md:33`: kolumny terminów powtórek odłożone do S-05. **Nadal aktualne**, żadna migracja ich nie dodała.
- `context/archive/2026-10-19-cards-table-with-isolation/plan.md:210`: „Kolejne migracje dla S-03 (liczniki) i S-05 (kolumny powtórek) dojdą jako osobne pliki.” **Aktualne** jako zapowiedź. Słowo „kolumny” to założenie z F-01, nie porównanie wariantów.
- `context/archive/2026-10-19-cards-table-with-isolation/plan.md:34`: typy/DTO, generowanie typów bazy, endpointy i UI poza F-01. **Aktualne**, nadal ich nie ma.
- `context/foundation/roadmap.md:85`: „kolumny terminów powtórek i liczniki NIE należą tu, dochodzą w pierwszych wycinkach, które ich używają.” **Aktualne.**
- `context/foundation/prd.md:84`: usunięcie fiszki usuwa dane powtórek, edycja nie zeruje historii. `prd.md:90`: termin zapisywany przy fiszce i weryfikowany testem.

## Related Research

- `context/changes/srs-review-session/ts-fsrs.md` – research zewnętrzny (wybór ts-fsrs, API, test lokalny).
- Innych `research.md` w `context/changes/**` i `context/archive/**` brak (sprawdzone przez subagenta).

## Open Questions

1. **Gdzie stan FSRS:** kolumny w `cards` (wskazanie wcześniejszych zapisów) czy tabela 1:1? Decyzja do `/10x-plan`.
2. **Czy blokować ręczną zmianę `due` przez właściciela** (np. aktualizacja tylko przez RPC lub uprawnienia kolumnowe), czy przyjąć to jako ryzyko dotyczące tylko własnych danych?
3. **Czy przechowywać `elapsed_days`:** pole jest oznaczone jako deprecated do usunięcia w ts-fsrs 6.0 (`index.d.ts` paczki).
4. **Globalny `Date.prototype`:** czy efekt uboczny importu jest akceptowalny?
5. **Gdzie test FR-013:** rozszerzyć `scripts/smoke.mjs`/`isolation-check.mjs` czy dodać runner testów?
6. **Kolejność z S-03:** jeśli kolumny mają domyślne wartości, S-03 nie musi znać FSRS. Migrację można zrobić w S-05 albo wcześniej.
7. Z `ts-fsrs.md`: `enable_fuzz` (deterministyczność testu) i zapis `ReviewLog` w v1.
8. **Niesprawdzone:** `npm run build` i `astro preview` z zainstalowanym ts-fsrs. Potwierdzić w pierwszej fazie implementacji.
