---
project: 10xcards
researched_at: 2026-10-17
recommended_platform: Cloudflare Workers (static assets)
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro 7.3.2 (SSR) + @astrojs/cloudflare 14.3.1, React 19
  runtime: Cloudflare Workers (workerd, nodejs_compat); baza: Supabase (zewnętrzny)
---

## Recommendation

**Wdrożyć na Cloudflare Workers (z zasobami statycznymi), nie na Cloudflare Pages.**

To jedyna zbadana platforma, która nie wymaga zmiany adaptera (`@astrojs/cloudflare` 14.3.1 wymaga `astro ^7.2.0` i `wrangler ^4.125.0`, a projekt ma Astro 7.3.2 i Wrangler 4.151.0). Plan Free (100 tys. żądań dziennie) z zapasem pokrywa skalę ≤5 użytkowników, co odpowiada priorytetowi „minimalizuj koszt" z wywiadu, a pełen zestaw komend (`deploy`, `rollback`, `tail`, `secret`) i oficjalny MCP spełniają kryteria przyjazne agentom. Odpowiedzi z wywiadu: brak trwałych połączeń, jeden region, zewnętrzny dostawca bazy (Supabase) i brak znajomości konkretnej platformy nie dały przewagi żadnemu konkurentowi.

**Korekta kontraktu (wykonana):** `tech-stack.md` zawierał `deployment_target: cloudflare-pages`, a adapter od wersji 13.0.0 nie wspiera Pages. Wartość poprawiono na `Cloudflare Workers` (patrz ryzyko R1).

## Platform Comparison

Status sprawdzony 2026-10-17. „Partial (beta)" itp. oznacza status funkcji nieobjętej GA.

| Platforma | CLI-first | Managed/Serverless | Docs czytelne dla agenta | Stabilne API wdrożenia | MCP / integracja |
|---|---|---|---|---|---|
| **Cloudflare** | Pass | Pass | Pass | Pass | Pass |
| Netlify | Pass | Pass | Pass | Pass | Pass |
| Vercel | Pass | Pass | Pass | Pass | Partial (Vercel MCP: Public Beta wg changelogu) |
| Fly.io | Pass | Partial | Partial | Partial (rollback niepotwierdzony) | Partial (`fly mcp` experimental) |
| Railway | Pass | Partial | Partial | Partial (brak komendy rollback) | Partial (lokalny MCP experimental) |
| Render | Partial | Pass | Partial | Partial (brak komendy rollback) | Pass |

Twarde filtry: pytanie o trwałe połączenia = „Nie", więc żadna platforma nie została odrzucona. Wagi: koszt (P2) premiuje plany darmowe, a zasięg (P4) i współlokalizacja (P5) nie rozstrzygały. Platformy wymagające kontenera lub adaptera Node (Fly.io, Railway, Render) oznaczają migrację z `@astrojs/cloudflare`.

Uwagi o ocenach:
- **Cloudflare:** komendy i limity potwierdzone w oficjalnej dokumentacji. `llms.txt` jest wskazany w dokumentacji agentów, ale nie potwierdziłem, że działa.
- **Netlify:** `/llms.txt` i strony `.md`; limit funkcji synchronicznej 60 s (niezmienny); kredyty (300) bez potwierdzonych zasad darmowego planu.
- **Vercel:** Hobby tylko do użytku niekomercyjnego; limit funkcji 300 s; logi 1 godzina.
- **Fly.io:** brak darmowego planu (od ok. 2,19 $/mies. za 256 MB); wymaga adaptera Node i Dockerfile.
- **Railway:** plan Hobby 5 $/mies.; adapter Node, nasłuch na `0.0.0.0`; brak dedykowanej komendy rollback.
- **Render:** plan Free usypia po 15 min (zimny start ok. 1 min); cena płatnego Starter nie została pobrana.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Brak migracji adaptera, koszt 0 $ przy tej skali, komplet komend dla agenta i oficjalne serwery MCP (główny `https://mcp.cloudflare.com/mcp`, dokumentacja `https://docs.mcp.cloudflare.com/mcp`).

#### 2. Netlify

Najlepsza dokumentacja dla agentów i MCP bez etykiety beta. Odstaje przez limit 60 s przy celu 30 s na generowanie, niepotwierdzone zasady darmowych kredytów i konieczność zmiany adaptera. Brak potwierdzonej obsługi Astro 7 na stronie adaptera (v8.2.10).

#### 3. Vercel

Duży zapas czasu funkcji (300 s), ale Hobby jest niekomercyjny, logi trzymane są godzinę, MCP jest oznaczony jako beta, a strona adaptera nie potwierdza Astro 7. Różnica wobec miejsca 2 jest niewielka.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Workers to nie Node: `nodejs_compat` jest częściowy, a niezgodna zależność wywala się w runtime, nie w buildzie.
2. Plan Free ma limit 10 ms CPU na wywołanie. SSR Reacta, walidacja zod, ciasteczka Supabase i parsowanie odpowiedzi LLM mogą go przekroczyć (błąd 1102). Czas oczekiwania na LLM nie liczy się jako CPU, ale nie zmierzyłem tego.
3. Dokumentacja jest niespójna (Pages w `tech-stack.md`, flaga `global_fetch_strictly_public` w przewodniku wdrożenia Astro, ale nie w przewodniku adaptera), co grozi wykonaniem złej komendy przez agenta (`wrangler pages deploy`).
4. `wrangler rollback` cofa kod, ale nie migracje i polityki RLS w Supabase, więc kod i schemat mogą się rozjechać.
5. Adresy wersji (`*.workers.dev`) są domyślnie publiczne i uruchamiają prawdziwą aplikację z logowaniem.

### Pre-Mortem — How This Could Fail

Po trzech tygodniach MVP działa lokalnie, bo `astro dev` odwzorowuje workerd. Po wdrożeniu trasa generowania sporadycznie zwraca 1102: parsowanie dużej odpowiedzi LLM i SSR przekraczają 10 ms CPU na planie Free. Błąd widać tylko w `wrangler tail`, bez historii, więc autor szuka go dniami. Równolegle dodaje migrację RLS w Supabase i robi rollback kodu. Stara wersja kodu nie pasuje do nowego schematu, zapis fiszek przestaje działać, a guardrail „zaakceptowane fiszki nigdy nie giną" jest zagrożony. Sekrety ustawiono ręcznie komendą `wrangler secret put`, a każdy z nich osobno wdrożył nową wersję. Publiczna wersja podglądowa z prawdziwym logowaniem była dostępna dla każdego. Po miesiącu autor wykupuje plan za 5 $, żeby pozbyć się limitu CPU, i traci przewagę kosztową.

### Unknown Unknowns

- `wrangler secret put` tworzy i wdraża nową wersję natychmiast, więc zmiana sekretu jest wdrożeniem.
- Sekrety są w dwóch miejscach: GitHub Secrets (build w CI) i sekrety Workera (runtime).
- CI (`.github/workflows`) nie ma jeszcze joba wdrożeniowego i celuje w `master`, podczas gdy lokalna gałąź to `main`.
- `astro dev` i `astro preview` działają w workerd; sekrety lokalne idą do `.dev.vars`, a zależności CommonJS mogą wymagać `optimizeDeps.include`.
- Nazwa Workera (`name` w `wrangler.jsonc`, obecnie `10xcards`) wyznacza publiczny adres `workers.dev`.
- Niesprawdzone w tej sesji (wiedza treningowa): darmowe projekty Supabase mogą być wstrzymywane po okresie nieaktywności.

## Operational Story

- **Preview deploys**: `wrangler versions upload --preview-alias <nazwa>` tworzy adres `<alias>-<worker>.<subdomain>.workers.dev` (włączenie: `preview_urls = true` w konfiguracji). Adresy wersji są publiczne, dopóki nie włączy się Cloudflare Access; do czasu jego konfiguracji nie używać ich z danymi produkcyjnymi.
- **Secrets**: produkcja: `wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` (Workers Secrets, wartość niewidoczna po zapisie; lista: `wrangler secret list --format json`). Lokalnie: `.dev.vars`. Build w CI: GitHub Secrets. Rotacja: ponowne `secret put`, które wdraża nową wersję. Dostęp przez `astro:env`.
- **Rollback**: `wrangler rollback [VERSION_ID] --message "powód"` (bez pytań interaktywnych; do 100 ostatnich wersji; wersje: `wrangler versions list --json`). Cofa tylko kod; migracje Supabase i dane nie są cofane, więc migracje muszą być wstecznie zgodne.
- **Approval**: człowiek: pierwsze wdrożenie na produkcję, rotacja głównych sekretów, usunięcie Workera lub projektu Supabase, zmiany migracji RLS na produkcji. Agent bez nadzoru: build, `versions upload` (podgląd), `wrangler tail`, odczyt `versions list` i `deployments list`. Token API ograniczony do jednego Workera.
- **Logs**: `wrangler tail --format json --status error --search "<tekst>"` (tylko na żywo); `observability.enabled: true` jest już w `wrangler.jsonc`; MCP `https://mcp.cloudflare.com/mcp` (nie sprawdziłem, czy daje historię logów). Wklejony tekst użytkownika nie może trafić do logów (CLAUDE.md), więc nie logować treści żądań generowania.

## Decyzje techniczne

- **Region Supabase:** UE (Frankfurt, `eu-central-1`) — dane użytkowników w UE (RODO), mały dystans do Workerów w Europie.
- **Plan Cloudflare:** Free (Workers Free, 100 tys. żądań dziennie, 10 ms CPU na wywołanie) — zgodnie z priorytetem „minimalizuj koszt".

## Sygnał zmiany decyzji

Wracamy do decyzji o planie Cloudflare (Free → Paid, 5 $/mies.) lub o platformie, gdy wystąpi którykolwiek z sygnałów:

- błędy 1102 (przekroczony limit CPU) w `wrangler tail` na trasach SSR lub generowania — przejść na plan Paid;
- użycie komercyjne aplikacji (zmiana charakteru projektu z nauki/MVP) — sprawdzić warunki planu i przejść na Paid;
- ruch powyżej 100 tys. żądań dziennie — limit planu Free, wymagany plan Paid.

Dodatkowo, dla Supabase: jeśli pauzy projektu po nieaktywności (R9) staną się uciążliwe mimo okresowego zapytania, przejść na plan Supabase Pro.

## Risk Register

Kolumna „Decyzja": **akceptuję** (ryzyko przyjęte, mitygacja wystarcza), **znane ograniczenie** (ryzyko zostaje, monitorujemy), **zmieniam wybór** (wymaga zmiany platformy; nie wybrano dla żadnego ryzyka).

| Risk | Source | Likelihood | Impact | Mitigation | Decyzja |
|---|---|---|---|---|---|
| R1: `tech-stack.md` wskazuje Pages, a adapter 14 wspiera tylko Workers; agent może użyć `wrangler pages deploy` | Research finding | H | M | Poprawić `deployment_target` w `tech-stack.md` na Workers; w planie wdrożenia podać wyłącznie `wrangler deploy` | **akceptuję** — `deployment_target` poprawiony na Cloudflare Workers |
| R2: limit 10 ms CPU na planie Free (błąd 1102) | Devil's advocate | M | H | Zmierzyć trasę generowania w `wrangler dev`/po wdrożeniu; w razie błędów przejść na plan Paid (5 $/mies.) | **znane ograniczenie** — Free; zmiana na Paid przy błędach 1102 (patrz Sygnał zmiany decyzji) |
| R3: niezgodność zależności z workerd (runtime, nie build) | Devil's advocate | M | M | Testować `npm run smoke` na `astro preview` (workerd) przed każdym wdrożeniem | **akceptuję** |
| R4: rollback kodu bez rollbacku schematu Supabase | Pre-mortem | M | H | Migracje wstecznie zgodne; migrację RLS wdrażać przed kodem, który jej wymaga | **akceptuję** |
| R5: publiczne adresy wersji z prawdziwym logowaniem | Devil's advocate | M | M | Włączyć Cloudflare Access dla podglądów albo wyłączyć `preview_urls` | **akceptuję — wykonane:** `"preview_urls": false` ustawione w `wrangler.jsonc`. Tło (dokumentacja Cloudflare, 2026-10-17, [Preview URLs](https://developers.cloudflare.com/workers/configuration/previews/)): bez własnego ustawienia `preview_urls` podąża za `workers_dev`. Dokumentacja [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) nie podaje jawnej wartości domyślnej `workers_dev`, ale mówi, że „All Workers are assigned a `workers.dev` route when they are created or renamed", więc domyślnie jest włączony, a adresy wersji były włączone (wcześniejsze założenie „wyłączone" było błędne). Uwaga: samo `workers_dev: false` nie wyłącza adresów wersji ani deployment URL, więc jawne `preview_urls: false` jest potrzebne. Włączenie z powrotem dopiero po skonfigurowaniu Cloudflare Access |
| R6: sekret = wdrożenie; sekrety w dwóch miejscach | Unknown unknowns | H | L | Dokumentować kolejność ustawiania sekretów; ustawić sekrety przed pierwszym wdrożeniem | **akceptuję** |
| R7: CI bez joba wdrożeniowego, gałąź `master` kontra `main` | Unknown unknowns | H | L | Ujednolicić gałąź; dodać job z tokenem `CLOUDFLARE_API_TOKEN` ograniczonym do jednego Workera | **znane ograniczenie** — wdrożenie ręczne do czasu dodania joba CI |
| R8: niespójność dokumentacji o fladze `global_fetch_strictly_public` | Research finding | L | L | Flaga dotyczy tylko `fetch()` do własnej strefy; nie wymagana, opcjonalnie dodać | **akceptuję** |
| R9: wstrzymanie darmowego projektu Supabase po nieaktywności (niezweryfikowane) | Unknown unknowns | M | H | Sprawdzić zasady planu Free Supabase przed wdrożeniem | **znane ograniczenie** — zweryfikowane w dokumentacji Supabase (2026-10-17, [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)): projekty Free z niską aktywnością bazy w ciągu **7 dni** są wstrzymywane (zwykle wystarczy kilka zapytań dziennie). Wznowienie: dashboard → projekt → **Resume project**, dane i konfiguracja wracają. Okno przywracania: dokumentacja podaje **1 rok**, starszy changelog 90 dni (sprzeczność; przyjmować ostrożnie 90 dni). Plan Pro nigdy nie wstrzymuje projektów. Mitygacja: po wdrożeniu ustawić okresowe zapytanie do bazy (np. zaplanowane wywołanie raz dziennie), żeby projekt nie był wstrzymywany; jeśli pauzy staną się uciążliwe, plan Pro (patrz Sygnał zmiany decyzji) |
| R10: limit czasu na fetch do LLM (~30 s) na planie Free nie potwierdzony | Research finding | L | M | Przetestować rzeczywiste generowanie po wdrożeniu | **znane ograniczenie** — test po wdrożeniu |

## Getting Started

Wersje: Astro 7.3.2, `@astrojs/cloudflare` 14.3.1, Wrangler 4.151.0. Przepływ lokalny nie wymaga osobnego `wrangler dev` (`astro dev` działa w workerd).

1. ~~Zmiana `name` w `wrangler.jsonc` na `10xcards` i `deployment_target` w `tech-stack.md` na Workers~~ — wykonane.
   - ~~Wyłączenie adresów wersji: `"preview_urls": false` w `wrangler.jsonc` (R5)~~ — wykonane.
2. Zalogować się (krok ręczny): `npx wrangler login`, następnie utworzyć token API ograniczony do jednego Workera do użycia w CI.
3. Ustawić sekrety produkcyjne: `npx wrangler secret put SUPABASE_URL` i `npx wrangler secret put SUPABASE_KEY` (przy pierwszym użyciu przed deployem Wrangler może poprosić o utworzenie Workera).
4. Sprawdzić lokalnie na runtime produkcyjnym: `npx astro build && npx astro preview`, potem `npm run smoke`.
5. Wdrożyć: `npx astro build && npx wrangler deploy`. Komendy `wrangler pages ...` nie dotyczą tego projektu.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
