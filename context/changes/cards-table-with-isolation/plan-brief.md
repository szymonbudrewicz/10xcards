# Tabela fiszek z izolacją danych per użytkownik (F-01) — Plan Brief

> Full plan: `context/changes/cards-table-with-isolation/plan.md`

## What & Why

Dodajemy minimalną tabelę `cards` z izolacją danych per użytkownik wymuszoną w bazie (RLS) oraz powtarzalny dowód, że konto B nie widzi ani nie rusza fiszek konta A. To Foundation F-01 z roadmapy: bez bezpiecznej tabeli S-03 (zapis zaakceptowanych fiszek, gwiazda przewodnia) nie da się zaplanować ani zweryfikować.

## Starting Point

W repo jest tylko logowanie ze startera i lokalna konfiguracja Supabase; nie ma `supabase/migrations/`, żadnej tabeli fiszek ani kodu fiszek. Job `smoke` w CI już startuje lokalny Supabase, a `scripts/smoke.mjs` jest wzorcem testu bez zależności. Na tej maszynie nie ma Dockera.

## Desired End State

Tabela `cards` z RLS działa w CI i na produkcji. Skrypt `npm run isolation` przechodzi w każdym uruchomieniu CI, więc przyszła migracja nie zepsuje izolacji po cichu. Konfigurację RLS na produkcji potwierdza zapytanie katalogowe.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Dowód izolacji | Skrypt Node w stylu `smoke.mjs` | Ten sam wzorzec i narzędzia co istniejący smoke, testuje prawdziwą ścieżkę REST | Plan |
| Weryfikacja na produkcji | Kontrola katalogu tylko do odczytu | Bez kont testowych i danych w produkcji | Plan |
| CI | Krok w jobie `smoke` | Regresja RLS blokuje merge | Plan |
| Weryfikacja przed produkcją | Zielony job `smoke` na branchu `f-01-cards-table-with-isolation` (PR do `main`) | Docker nie jest zainstalowany, a bez PR job `smoke` nie startuje na pushu do innej gałęzi | Plan |
| Kolejność faz | Krok CI razem ze skryptem (faza 2) | Skrypt może się wykonać tylko w CI, więc krok musi powstać razem z nim | Plan |
| Uprawnienia | Jawny grant dla `authenticated`, revoke dla `anon` | Zachowanie nie zależy od domyślnych grantów środowiska | Plan review |
| Zakres kolumn | `id`, `user_id`, `front`, `back`, `created_at` | Kolumny powtórek (S-05) i liczniki (S-03) dochodzą w pierwszych wycinkach, które ich używają | Plan |
| `updated_at` | Pominięte | Wymaga triggera, a nic w F-01 go nie potrzebuje | Plan |
| Limit długości `front`/`back` | Tylko niepustość | PRD nie podaje limitów | Plan |
| Bezpieczeństwo skryptu | Env-only, tylko adres lokalny | `.dev.vars` może wskazywać na produkcję | Plan |

## Scope

**In scope:** migracja `cards` z RLS i politykami, skrypt izolacji + `npm run isolation` (z globalnymi `URL`/`crypto` w `eslint.config.js`), krok w CI, ręczne wypchnięcie migracji na produkcję z kontrolą katalogu, dopisek w `deploy-plan.md`.

**Out of scope:** kolumny powtórek i liczniki, typy/DTO, endpointy i UI, pgTAP, testy na produkcji, job deploy w CI.

## Architecture / Approach

Izolacja żyje w politykach RLS (`user_id = auth.uid()`; update z `USING` i `WITH CHECK`; `anon` bez dostępu). Skrypt rejestruje dwa konta na lokalnym Supabase i atakuje tabelę tym samym kluczem publicznym co aplikacja. Migracja na produkcję to ręczna bramka człowieka (`db push`), po której człowiek sprawdza katalog.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migracja `cards` | Tabela, RLS, cztery polityki | Luka w politykach (np. update bez `WITH CHECK`) |
| 2. Skrypt izolacji i krok w CI | `npm run isolation` z atakami A/B i `anon`, uruchamiany w jobie `smoke` | Skrypt uruchomiony na produkcji (zabezpieczony odmową poza pętlą zwrotną); bez Dockera pierwsze wykonanie dopiero w CI |
| 3. Produkcja | Migracja na produkcji, kontrola katalogu, dopisek w docs | Ręczna bramka; migracja nie cofa się razem z rollbackiem kodu |

**Prerequisites:** zalogowana sesja `gh`, dostęp do produkcyjnego projektu Supabase (ref, `supabase login`), gałąź `f-01-cards-table-with-isolation`; kolejność: push brancha, potem draftowy PR do `main`, potem czekamy na zielony `smoke`.
**Estimated effort:** ~2-3 sesje w 3 fazach, z jedną bramką ręczną.

## Open Risks & Assumptions

- Lokalnie nic nie da się uruchomić, więc błędy w migracji i skrypcie wyjdą dopiero w CI.
- Zakładamy, że `supabase start` w CI stosuje migracje z `supabase/migrations/` na pierwszym starcie.
- Zakładamy, że hostowany Supabase i lokalny mają te same domyślne uprawnienia dla `anon`; `revoke` czyni to jawnym.

## Success Criteria (Summary)

- Job `smoke` jest zielony, a log pokazuje komplet kroków PASS izolacji.
- Zmiana polityki łamiąca izolację powoduje czerwony job.
- Na produkcji RLS jest włączony, są cztery polityki tylko dla `authenticated`, a `anon` nie ma uprawnień.
