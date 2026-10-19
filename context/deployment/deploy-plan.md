# Plan: pierwsze wdrożenie 10xcards na Cloudflare Workers

Status: zatwierdzony 2026-10-17, wykonany 2026-10-18 (patrz „Stan faktyczny"). Źródła: `context/foundation/infrastructure.md`, `context/foundation/tech-stack.md`.

## Context

Pierwsze wdrożenie produkcyjne: Cloudflare Workers + static assets (plan Free), Astro 7.3.2 SSR, `@astrojs/cloudflare` 14.3.1, Supabase zewnętrzny (UE). Cel: działająca aplikacja pod `https://10xcards.<subdomena>.workers.dev` z logowaniem na produkcyjnym Supabase.

Stan wyjściowy: `wrangler.jsonc` gotowy (`name: 10xcards`, `main: @astrojs/cloudflare/entrypoints/server`, `assets.directory: ./dist`, `preview_urls: false`, `observability.enabled: true`). `astro.config.mjs` używa `cloudflare()` i `astro:env` z `SUPABASE_URL`/`SUPABASE_KEY` (secret, optional). CI nie ma joba deploy i celuje w `main`.

**Używamy wyłącznie `wrangler deploy`. Komendy `wrangler pages ...` NIE dotyczą tego projektu (R1).**

## Bramki ręczne (człowiek)

| # | Krok | Dlaczego |
|---|---|---|
| M1 | `npx wrangler login` (przeglądarka) i `npx wrangler whoami` | OAuth interaktywny |
| M2 | Produkcyjny projekt Supabase w UE (Frankfurt, `eu-central-1`); skopiować Project URL i klucz anon/publishable | Utworzenie zasobu + sekrety |
| M3 | Migracje/RLS na produkcyjnym Supabase (jeśli `supabase/migrations/` coś zawiera): `npx supabase link` + `npx supabase db push`, przed kodem, który ich wymaga (R4) | Zmiana schematu produkcji |
| M4 | Supabase → Auth → URL Configuration: Site URL i Redirect URLs na adres `workers.dev` (po kroku 9) | Bez tego redirecty auth nie działają |
| M5 | Wartości sekretów wpisuje człowiek (`wrangler secret put`, `.dev.vars`) | Sekrety nie trafiają do rozmowy ani repo |

## Kroki automatyczne (agent)

### Faza A — przygotowanie
1. `npm ci`, `npx astro sync`, `npx astro check`, `npm run lint`.
2. Poprawić prozę w `context/foundation/tech-stack.md` („Cloudflare Pages" → „Cloudflare Workers").
3. (Zastąpione, patrz „Stan faktyczny”: smoke z danymi produkcyjnymi nie został uruchomiony; nie wykonywać.) Lokalny test na runtime produkcyjnym (R3): `.dev.vars` (nie commitować) z **tymi samymi danymi Supabase co produkcja** (brak osobnego projektu testowego), potem `npx astro build && npx astro preview --port 4321` w tle i `npm run smoke`. **UWAGA: smoke test pisze do produkcyjnej bazy Supabase** (konto testowe w Auth). Błąd = stop, bez deployu. Konto testowe wymaga ręcznego usunięcia (patrz krok 12).

### Faza B — sekrety przed pierwszym deployem (R6)
4. (M1) Zalogowanie; `npx wrangler whoami`.
5. (M5) `npx wrangler secret put SUPABASE_URL` i `npx wrangler secret put SUPABASE_KEY`. Każdy `secret put` tworzy wersję; Wrangler może zaproponować utworzenie Workera `10xcards`: człowiek akceptuje.
6. `npx wrangler secret list --format json`: obie nazwy obecne.

### Faza C — wdrożenie (pierwsze wdrożenie zatwierdza człowiek)
7. `npx astro build`.
8. `npx wrangler deploy --dry-run`: nazwa Workera, assets z `./dist`, `nodejs_compat`, brak błędów.
9. **Bramka zatwierdzenia człowieka**, potem `npx wrangler deploy`. Zapisać URL z wyjścia.
10. Wrócić do M4 z tym adresem.

### Faza D — weryfikacja
11. `npx wrangler deployments list` i `npx wrangler versions list --json`: jedna aktywna wersja na 100%.
12. `BASE_URL=https://10xcards.<subdomena>.workers.dev npm run smoke`. Konto testowe w produkcyjnym Supabase zatwierdzone przez użytkownika. Po teście **przypomnieć o ręcznym usunięciu kont testowych** (z kroków 3 i 12) w Supabase → Authentication → Users.
13. Równolegle `npx wrangler tail --format json --status error`: brak błędów, w szczególności 1102 (R2). Nie logować treści żądań.
14. Potwierdzić brak adresów podglądu (R5): `preview_urls: false`; nie używać `--preview-alias`.

### Faza E — domknięcie
15. Zapisać ten plan jako `context/deployment/deploy-plan.md` wraz z faktycznym stanem: nazwa Workera, URL, sekrety, ID wersji, data.
16. Commit zmian dokumentacji, tylko gdy użytkownik poprosi.
17. **Keep-alive dla Supabase (R9)**, po wdrożeniu. Projekt Free jest wstrzymywany po 7 dniach niskiej aktywności. Propozycja (do zatwierdzenia przed implementacją):
    - Workflow `.github/workflows/keep-alive.yml` z `schedule` (cron raz dziennie) i `workflow_dispatch`, wykonujący `curl -sf` na lekki endpoint aplikacji robiący zapytanie do bazy (np. `/api/health` z `createClient()` z `src/lib/supabase.ts`, obsługa `null`, błąd w formacie `{ error: { code, message } }`, bez logowania treści użytkownika). Adres w sekrecie/zmiennej repo.
    - Zaplanowane workflow działają tylko na domyślnej gałęzi GitHub, a CI celuje w `main` (domyślna gałąź, R7 rozwiązane): bez dodatkowej zmiany gałęzi.
    - Alternatywa: bezpośrednie wywołanie REST Supabase (`/rest/v1/`) z kluczem publicznym w sekrecie GitHub. Cloudflare Cron Trigger odradzany (zmiany w entrypoincie adaptera).
18. Przypomnieć o ryzykach otwartych: R7 (brak joba CI deploy; `master` vs `main` rozwiązane, CI celuje w `main`), R10 (test generowania LLM).

## Stan faktyczny (2026-10-18)

- **Worker:** `10xcards` (Cloudflare Workers Free). **URL:** https://10xcards.szymon-10x.workers.dev (subdomena `szymon-10x` zarejestrowana ręcznie po błędzie pierwszego `deploy`).
- **Sekrety:** `SUPABASE_URL`, `SUPABASE_KEY` (`wrangler secret list`: obie nazwy; wartości wpisane ręcznie, M5).
- **Wersje:** aktywna `b1d59e2c-03d0-49a7-ae01-a1fe770d3925` (100%, wdrożona 2026-10-18 11:42 UTC). Wcześniejsze: `c322343c-be86-4751-b0d5-ae2f5c0144f3` (pierwszy upload, 11:22 UTC), `c8353a34-695f-4a38-8e9d-ab7197f387cc` (zmiana sekretu).
- **Bindingi:** tylko `ASSETS`. Bez KV `SESSION` i `IMAGES`: `session: false`, `imageService: "passthrough"`, `kv_namespaces: []` i brak `images` w `dist/server/wrangler.json` (decyzja w `infrastructure.md`).
- **Smoke:** tylko lokalnie (4 kroki PASS; klucz i URL Supabase działają). Hostowany Supabase odrzuca `example.com`, więc rejestracja i logowanie nie są w smoke; na produkcji tylko `curl -I`. Konta testowe w produkcyjnym Supabase nie powstały (rejestracja w smoke nigdy nie przeszła), nic do usunięcia.
- **Weryfikacja produkcji:** `/` 200, `/auth/signin` 200, `/dashboard` 302 → `/auth/signin`; `wrangler tail --status error` bez zdarzeń w ok. 60 s (krótka próba); `preview_urls: false`.
- **M4:** wykonane (Site URL i Redirect URLs w Supabase na adres `workers.dev`).
- **Migracja `cards` (2026-10-19, F-01 `cards-table-with-isolation`):** `20261019120000_create_cards.sql` zastosowana na produkcyjnym Supabase ręcznie (`supabase db push`, bramka M3); `db push --dry-run` pokazał wyłącznie tę migrację, a `migration list` po pushu ma ją w Local i Remote. Kontrola katalogu (tylko odczyt, bez kont i danych testowych w produkcji): (1) `relrowsecurity = true` dla `public.cards`; (2) cztery polityki `cards_select_own`, `cards_insert_own`, `cards_update_own`, `cards_delete_own`, wszystkie dla roli `authenticated` na `user_id = (select auth.uid())` (select i delete mają `qual`, insert `with_check`, update oba); (3) `anon` bez uprawnień select/insert, `authenticated` z select/insert/update/delete. Zachowanie izolacji kont A/B jest dowiedzione skryptem `npm run isolation` w jobie `smoke` w CI (lokalny Supabase), nie na produkcji.
- **Odchylenia od planu:** `wrangler login` zbędny (sesja istniała); Cloudflare wymagał weryfikacji e-maila (kod 10034) i rejestracji subdomeny `workers.dev`; `secret put` wymaga zwykłego terminala (tryb nieinteraktywny przyjmuje domyślne odpowiedzi).

## Otwarte punkty

- **R9, keep-alive Supabase:** projekt Free jest wstrzymywany po 7 dniach niskiej aktywności. Propozycja z kroku 17 (workflow `keep-alive.yml`, `/api/health`) czeka na zatwierdzenie.
- **R7, CI:** brak joba deploy. CI celuje w `main` (zgodnie z lokalną gałęzią i domyślną gałęzią GitHub).
- **R10:** test generowania LLM na produkcji (limit CPU 10 ms na planie Free, błędy 1102) jeszcze niewykonany.
- **Rejestracja i logowanie na produkcji:** ręczna weryfikacja własnym adresem (poza smoke).

## Rollback
`npx wrangler rollback [VERSION_ID] --message "powód"` (ID z `wrangler versions list --json`). Cofa tylko kod; migracje Supabase zostają (R4). Usunięcie Workera lub projektu Supabase wykonuje wyłącznie człowiek.

## Poza zakresem
Job CI do deployu, token API ograniczony do jednego Workera, Cloudflare Access, własna domena.

## Kryteria sukcesu
- `wrangler deploy` kończy się kodem 0 i zwraca URL `workers.dev`.
- `/` zwraca 200; chroniona trasa przekierowuje na `/auth/signin`; rejestracja i logowanie działają na produkcyjnym Supabase.
- `wrangler tail` bez błędów; `secret list` zawiera `SUPABASE_URL`, `SUPABASE_KEY`.
- Brak adresów podglądu wersji.
