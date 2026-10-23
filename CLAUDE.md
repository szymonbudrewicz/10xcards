# CLAUDE.md

## Project

**10xCards** — AI-generated flashcards with spaced repetition (PRD: `@context/foundation/prd.md`, stack: `@context/foundation/tech-stack.md`, shaping notes: `@context/foundation/shape-notes.md`). Auth and AI card-proposal generation (`/generate`, `POST /api/generate`) exist; saving cards, card management and review sessions are not yet implemented.

Docs under `context/` are written in Polish; `context/archive/` is immutable — never write there (open a new change with `/10x-new` instead). `AGENTS.md` just points at this file.

## Commands

- `npx astro check` — type check (CI runs it after `npx astro sync`)
- `npm test` — Vitest (`tests/**/*.test.ts`), no server or network: endpoints are called directly, global `fetch` is stubbed as the AI boundary. Put tests in `tests/`, never in `src/pages/` (Astro turns every file there into a route). Patterns: `context/foundation/test-plan.md` §6.
- `npm run test:mutation` — Stryker, ad hoc only, for a module tied to a test-plan risk; don't chase the score, judge surviving mutants one by one. On Windows + Vitest 5 its score was unreliable (`context/changes/testing-generation-guard/stryker-report.md`).
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server; `BASE_URL` defaults to `http://localhost:4321`. Run after dependency upgrades.
- `npm run isolation` — proves account B cannot read/change/delete/impersonate account A's cards and anon has no access (`scripts/isolation-check.mjs`). Needs `SUPABASE_URL`/`SUPABASE_KEY` from `npx supabase status -o env` (API_URL, ANON_KEY) in the environment (POSIX and PowerShell snippets in the script header); needs `npx supabase start` with migrations applied and email confirmation disabled. Refuses any non-loopback host and never reads `.dev.vars`. Never run it against production. CI runs it in the `smoke` job.

CI (`.github/workflows`) runs on pushes and pull requests to `main` (lint, `astro check`, `npm test`, build, plus the `smoke` job); there is no deploy job.

## Environment

- Windows/PowerShell here — detect the real shell rather than assuming POSIX.
- Cloudflare local dev reads secrets from `.dev.vars`; Node reads `.env`.

## Architecture

- `output: "server"` — everything is SSR.
- Auth: `src/lib/supabase.ts` `createClient(headers, cookies)` builds a cookie-based `@supabase/ssr` client and returns `null` when env vars are missing. Gdy createClient() zwraca null (brak SUPABASE_URL/klucza), auth jest wyłączony. Sprawdzaj null, nie zakładaj że klient istnieje. Komunikat jest w configStatuses (src/lib/config-status.ts). `src/middleware.ts` resolves the user into `context.locals.user` on every request and redirects to `/auth/signin` for paths in `PROTECTED_ROUTES` (prefix match; add new protected pages there).

## Conventions

- Astro components for static/layout; React components only for interactivity. No Next.js directives (`"use client"`); extract hooks to `src/components/hooks/`.
- Class names: use `cn()` from `@/lib/utils`, never string concatenation.
- Services/helpers in `src/lib/` (business logic in `src/lib/services/`); shared types/DTOs in `src/types.ts`.
- Migrations: `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`; always enable RLS on new tables with granular per-operation, per-role policies.
- Wklejony tekst użytkownika nie może być zapisywany ani logowany. Trwałe są tylko fiszki i liczniki propozycji/akceptacji.
- Błędy API mają kształt { error: { code, message } }, z kodem w snake_case i komunikatem po polsku.

## UI

- Tokens: `src/styles/global.css` (`:root`/`.dark` → `@theme inline`); the app runs in `.dark` (class on `<html>` in `Layout.astro`). Value sources: `context/changes/ui-signin-contract/tokens.md`.
- Components: check `src/components/ui/` before creating one; add missing ones with `npx shadcn@latest add <name>`, then point `cn` imports to `@/lib/utils` and use single `@radix-ui/react-*` packages (the `radix-ui` umbrella crashes the Workers dev runtime).
- Views use token roles only (`bg-primary`, `text-muted-foreground`, `text-link`): no palette classes (`bg-purple-600`, `text-white/40`), hex/oklch or arbitrary values. `npm run lint:ui` enforces this for cleaned views (list in `scripts/ui-literal-scan.mjs`) and runs in CI.
- Visual states of the sign-in view: `/dev/kitchen-sink` (dev only, 404 elsewhere via `src/middleware.ts`).
- Don't run `npm run build` while `astro dev` is running: it overwrites the dev Vite cache (500 "file does not exist … deps_ssr").

## 10x course tooling

- 10xDevs skills are in `.claude/skills/`. Read each CLI skill's `references/compatibility.md` before running `10x_cli` commands.
- Do not pass `--course` normally; the edition comes from `.10x-cli.json`. Never rewrite a bound project to another edition (`course_mismatch`), and preserve `.10x-cli.json`, manifests and local work during `sync`.
- Don't treat a successful `--help` as proof a feature has shipped (e.g. `helpers install` is unreleased in 1.21.0/1.22.0 baselines).
- Rules-file filter: add a rule only if the agent couldn't know it from public training data. Recurring pitfalls go to `context/foundation/lessons.md` via `/10x-lesson` (append-only).
<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — Moduł 3, Lekcja 2

Lekcja 2 dotyczy **pisania testów, które faktycznie chronią kod** — a nie tylko maksymalizowania pokrycia. Problem wyroczni oraz antywzorce vibe-testingu wyjaśniają, dlaczego testy generowane przez LLM zawodzą na rzeczywistym kodzie; rozwiązaniem jest kontrakt jakości oparty na ryzyku z Lekcji 1.

```
context/foundation/test-plan.md (§3 Phased Rollout)
        │
        ▼  (one rollout phase at a time)
   /10x-research  ──►  research.md  (oracle source: what code should do, not what it does)
        │
        ▼
   /10x-plan  ──►  plan.md  (cost × signal, two-layer strategy, ordered phases)
        │
        ▼
   /10x-implement  or  /10x-tdd   ──►  working tests + §6 cookbook update
```

`/10x-tdd` jest **opcjonalnym trybem test-first**, a nie zamiennikiem dla łańcucha. Odczytuje ten sam `plan.md`, zapisuje do tej samej sekcji `## Progress` i obejmuje te same fazy co `/10x-implement`. Używaj go tylko wtedy, gdy potrafisz nazwać pierwszą nieudaną asercję przed napisaniem jakiegokolwiek kodu.

### Router zadań — od czego zacząć

| Umiejętność / Prompt | Użyj, gdy |
| --- | --- |
| `/10x-research` | Przed napisaniem jakiegokolwiek testu dla ryzyka. Research tworzy wyrocznię — jakie zachowanie test musi udowodnić — na podstawie źródeł (PRD, tech-stack, dokumentacja), a nie kształtu implementacji. Ujawnia również, czy ryzyko jest już pokryte albo ma dwa odrębne oblicza (jedno bezpieczne, drugie rzeczywiste). |
| `/10x-plan` | Research jest ukończony. Plan rozkłada ryzyko na uporządkowane fazy: najpierw konfiguracja środowiska, następnie reguły od niej zależne, potem hermetyczne stuby dla błędów, których rzeczywista infrastruktura nie potrafi wywołać, a na końcu aktualizacja cookbooka. Każda faza nazywa zachowanie, które potwierdza, oraz regresję, którą wykrywa. |
| `/10x-implement` | Domyślny wykonawca faz planu. Używaj do konfiguracji środowiska, istniejącego kodu, scaffolding oraz każdej fazy, w której nie możesz zdefiniować czerwonego testu przed napisaniem kodu. |
| `/10x-tdd` | Opcjonalne. Użyj zamiast `/10x-implement` dla fazy, w której potrafisz nazwać pierwszy czerwony test jednym zdaniem. Agent najpierw pisze nieudany test, potem minimalny kod, aby go zazielenić, a następnie refaktoryzuje. Zatrzymuje się na asercji przed dotknięciem implementacji — ta pauza jest sednem. |
| Prompt `m3l2-ad-hoc-testing` | Masz pojedynczy plik i chcesz testów teraz, bez pełnego cyklu research→plan→implement. Prompt wymusza wyrocznię-ze-źródeł (odczytuje PRD + TECH_STACK przed asercjami), asercje behawioralne, przypadki brzegowe wynikające z ryzyka oraz tabelę regresji. Używaj go ze świadomością, że wymieniasz głębię na szybkość. |

### Kiedy używać `/10x-tdd` vs `/10x-implement`

Decydujące pytanie: *Czy potrafisz nazwać pierwszy czerwony test jednym zdaniem?*

Dobre warunki dla `/10x-tdd`:
- "promuje wyłącznie drafty w stanie `accepted`, a `pending`/`rejected` nigdy nie trafiają do talii"
- "zwraca `ok: true` i loguje `orphan_review_state`, gdy upsert stanu powtórek padnie w trakcie zapisu"
- "zwraca 401, gdy użytkownik nie ma dostępu do kursu"
- "resetuje interwał powtórki do jednego dnia, gdy ocena wynosi 0"

Każdy z nich nazywa obserwowalny wynik, a nie wewnętrzny szczegół. Jeśli nie potrafisz stworzyć zdania takiego jak to, pozostań przy `/10x-implement` albo wróć do `/10x-research`.

`/10x-tdd` **nie nadaje się** do: konfiguracji środowiska, konfiguracji CI/CD, dokumentacji, prostego łączenia elementów, gdzie test jedynie przepisywałby implementację, ani spike'a, podczas którego nadal odkrywasz kontrakt.

Możesz łączyć oba tryby w jednym planie:

```
/10x-implement <change-id> phase 1   # environment
/10x-tdd       <change-id> phase 2   # contract (new code)
/10x-tdd       <change-id> phase 3   # contract (API endpoint)
/10x-implement <change-id> phase 4   # cookbook + plan sync
```

Oba zapisują postęp do tej samej sekcji `## Progress` w `plan.md`.

### Dwuwarstwowa strategia testów (koszt × sygnał)

Dla każdego ryzyka wybierz **najtańszy test, który daje rzeczywisty sygnał**. Nie wybieraj domyślnie e2e „bo jest najbezpieczniej” i nie ścigaj się za procentem pokrycia.

| Warstwa | Kiedy używać | Kiedy NIE używać |
| --- | --- | --- |
| Integracja (prawdziwa DB / prawdziwa infrastruktura) | Reguła obejmuje ograniczenia DB, kaskady, rzeczywisty SQL lub ograniczenia unikalności, co do których mock by kłamał. | Przepływy auth kontrolowane przez RLS, które należą do odrębnej fazy; wszystko, gdzie koszt konfiguracji przekracza wartość sygnału. |
| Hermetyczna (stub klienta) | Częściowe błędy, których rzeczywista infrastruktura nie potrafi łatwo wywołać (np. druga operacja w sekwencji kończy się błędem). | Reguły zależne od faktycznego stanu DB — stub będzie kłamał w kwestii naruszeń ograniczeń i kaskad. |

Nieatomowa sekwencja zapisu (wiele niezależnych operacji bez transakcji) oznacza: pisz hermetyczne testy dla gałęzi częściowych błędów, a nie testy integracyjne wymuszające błąd w środku sekwencji.

### Reguły wyroczni

- Wyrocznia — co kod *powinien* robić — musi pochodzić ze źródeł: PRD, dokumentacji, ograniczeń tech-stacku, wiedzy domenowej. **Nie może** pochodzić z odczytywania implementacji.
- Jeśli implementacja zawiera błąd, skopiowanie jej wyniku jako oczekiwanej wartości tworzy test lustrzany, który przechodzi mimo błędu.
- Gdy źródła nie rozstrzygają oczekiwanego zachowania jednoznacznie, **zatrzymaj się i zapytaj**, zamiast zgadywać.
- Zadaniem researchu jest ujawnienie wyroczni, zanim zostanie napisany jakikolwiek test.

### Antywzorce vibe-testingu, których należy unikać

| Antywzorzec | Jak wygląda | Co zrobić zamiast tego |
| --- | --- | --- |
| Implementacja lustrzana | Asercja oblicza oczekiwaną wartość tą samą logiką co testowany kod. | Asercja wobec wartości wyprowadzonej z wyroczni (PRD / reguła domenowa), a nie z implementacji. |
| Tylko happy paths | Testy przepuszczają tylko prawidłowe dane wejściowe; brak przypadków brzegowych. | Dodaj co najmniej jeden przypadek brzegowy dla każdego ryzyka: `null`, pusty, błąd zależności, nieprawidłowe dane wejściowe. |
| Nadmiarowe kopie | Sześć niemal identycznych testów sprawdzających ten sam brak sentinela. | Jeden sparametryzowany test (`it.each`) na właściwość; każdy test wykrywa inną regresję. |

### Testowanie mutacyjne (Stryker) — selektywna bramka jakości

Pokrycie mówi „ta linia została wykonana”. Wynik mutacji mówi „czy test by nie przeszedł, gdybym zepsuł tę linię?”. Używaj Stryker jako **selektywnej bramki** po fazie ryzyka, a nie jako bramki CI przy każdym commicie.

Przebieg pracy:
1. Testy przechodzą dla fazy ryzyka.
2. Uruchom `npx stryker run --mutate "path/to/file.ts"` (zawęź zakres do zmienionego modułu).
3. Otwórz raport HTML; znajdź mutacje, które przetrwały.
4. Dla każdej przetrwałej mutacji zapytaj: „Czy ta zmiana zaszkodziłaby użytkownikowi lub firmie?”
   - Tak → dodaj asercję, która zabija mutację.
   - Nie (równoważna mutacja lub kosmetyczna zmiana) → świadomie ją zignoruj.
5. Nie ścigaj 100% wyniku mutacji. Test, który przytwierdza szczegóły implementacji, aby zabić kosmetyczną mutację, sam jest testem vibe.

Bramka integracyjna może pozostać **ad hoc** (nie przy każdym commicie), gdy uruchamianie lokalnej infrastruktury jest kosztowne. Oznacz to odpowiednio w `test-plan.md §4`.

### Granice lekcji

- Nie konfiguruj hooków, cyklu życia hooków ani debugowania hooków. To Lekcja 3.
- Nie konfiguruj serwerów MCP, Playwright API, kodu e2e ani kodu scenariuszy multimodalnych. To Lekcja 4.
- Nie uruchamiaj workflow bug-to-fix-to-regression-test. To Lekcja 5.
- Nie twórz od zera pipeline'ów CI/CD. To Moduł 1 Lekcja 5 / Moduł 2 Lekcja 5.
- Nie uruchamiaj `/10x-test-plan`, aby zmienić strategię ryzyka. To Lekcja 1. Użyj `/10x-test-plan --status`, aby odczytać bieżący stan.
- Nie pisz testów bez kroku researchu, chyba że używasz promptu ad-hoc z pełną świadomością jego kompromisów.

### Ścieżki używane w tej lekcji

- `context/foundation/test-plan.md` — stan wdrożenia §3; cookbook §6 (uzupełniany w miarę dostarczania faz)
- `context/changes/<change-id>/research.md` — źródło wyroczni dla każdej fazy wdrożenia
- `context/changes/<change-id>/plan.md` — uporządkowane fazy z `## Progress` jako stanem wykonania
- `.claude/prompts/m3l2-ad-hoc-testing.md` — prompt do testowania ad-hoc na poziomie pliku

<!-- END @przeprogramowani/10x-cli -->
