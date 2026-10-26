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

## Zestaw narzędzi AI 10xDevs - Moduł 3, Lekcja 3 (10xDevs 4.0 Hooks)

Traktuj hook jako **bramkę jakości uruchamianą przez harness dla agenta**, a nie skrypt, który według ciebie agent zauważy. Hooki działają poza modelem, więc przetrwają kompresję kontekstu i zapomniane instrukcje — ale tylko hook, którego sygnał faktycznie dociera do agenta, zamyka pętlę:

```
test-plan.md "Quality Gates" -> pick the moment per gate -> /10x-configure-hook -> prove with sample JSON -> watch the agent fix a deliberate error
```

### Router zadań - Od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| `/10x-configure-hook` | Przekształcasz bramki z `context/foundation/test-plan.md` w hooki agenta, naprawiasz hooki, które się uruchamiają, ale agent nigdy nie reaguje, albo audytujesz istniejącą konfigurację hooków. Wykrywa harness na podstawie repozytorium i zawiera datowane referencje dla każdego harness. |
| `/10x-test-plan --status` | Odczytujesz aktualne bramki i stan wdrożenia. Zmiana tego, które bramki istnieją, należy do Lekcji 1, nie tutaj. |
| `/10x-new` -> `/10x-research` -> `/10x-plan` -> `/10x-implement` | Hook ujawnił awarię, której agent nie może naprawić trywialną korektą (błędna logika biznesowa, niestabilna integracja). Otwórz zmianę zamiast zapętlać hook. |

### Cykl życia hooka

1. **Wyzwalacz** — zdarzenie w harness: narzędzie zakończyło edycję pliku, agent zaraz zakończy swoją turę.
2. **Matcher** — zawęża, na które wywołania narzędzi lub pliki reaguje hook. Nie każdy harness obsługuje matchery w ten sam sposób.
3. **Handler** — zwykle polecenie powłoki lub skrypt, który odczytuje ładunek zdarzenia jako JSON ze standardowego wejścia.
4. **Sygnał** — co zwraca hook. Kod wyjścia, stderr, stdout i pola JSON oznaczają różne rzeczy w różnych harness, a tylko jeden kanał na zdarzenie faktycznie dociera do agenta. **Kanał sygnału różni się zależnie od harness — przed napisaniem lub przeglądem hooka sprawdź referencje umiejętności.**

Hook, który się uruchamia, ale wysyła komunikat niewłaściwym kanałem, jest najczęstszą awarią: użytkownik widzi „hook error”, agent nie widzi niczego i kontynuuje.

### Momenty i warstwy

Im wolniejsza kontrola, tym rzadszy moment:

| Moment | Typowe kontrole | Dociera do agenta? |
| --- | --- | --- |
| Przy każdej edycji | Lint/formatowanie **tylko edytowanego pliku**; powiązane testy, jeśli są szybkie | Tak, w trakcie pracy |
| Koniec tury (Stop lub odpowiednik) | Lint + testy dla każdego pliku zmienionego w tej turze, typecheck całego projektu | Tak, zanim agent przekaże wynik |
| Pre-commit (git) | Lint + testy dla plików w stagingu; wyłapuje edycje wykonane bez agenta | Nie — blokuje commit |
| Pre-push (git) | Cięższe zestawy, e2e uruchamiane lokalnie | Nie — blokuje push |
| CI | Integracja, współdzielony stan, infrastruktura niedostępna lokalnie | Nie — feedback dla PR |

Lokalne warstwy nie zastępują CI; każda z nich oszczędza jeden cykl zwrotny CI. Zacznij od jednego hooka lint przy każdej edycji i jednego typechecka na koniec tury, a następnie dodawaj warstwy, gdy zobaczysz, co się przedostaje.

### Kontrakt

- Odczytaj bramki z sekcji „Quality Gates” w `context/foundation/test-plan.md` (według tytułu, nie numeru sekcji). Bramka, którą plan wyraźnie odkłada, pozostaje odłożona, chyba że użytkownik to zmieni — cytuj odroczenie, gdy pytasz.
- Hooki przy każdej edycji sprawdzają tylko edytowany plik. Nigdy nie uruchamiaj `--fix` ani lintera dla całego projektu przy każdej edycji.
- Hooki końca tury, które mogą odesłać agenta z powrotem, muszą zatrzymać się po jednej próbie ponowienia (flaga harness „already continued” lub odpowiednik), aby nienaprawialny błąd nie tworzył pętli.
- Hooki przy każdej edycji widzą tylko narzędzia edycji harness; plik nadpisany za pomocą polecenia powłoki je omija. Hook końca tury ponownie sprawdza każdy plik zmieniony w tej turze (`git diff`), więc stanowi zabezpieczenie dla tych edycji.
- Limity czasu są zwykle podawane w **sekundach**. Sprawdź jednostkę przed skopiowaniem liczby.
- Udowodnij działanie każdego hooka, zanim mu zaufasz: uruchom skrypt z przykładowym ładunkiem na celowo uszkodzonym pliku i na czystym, a następnie cofnij błąd.
- Nigdy nie nadpisuj po cichu istniejącej konfiguracji hooków. Przeprowadź audyt, nazwij defekty, scal i pokaż diff.

### Granice lekcji

- Nie zmieniaj strategii ryzyka ani definicji bramek — to Lekcja 1 (`/10x-test-plan`).
- Nie pisz tutaj nowych testów — hooki uruchamiają tylko testy utworzone w Lekcji 2.
- Nie pisz scenariuszy E2E ani weryfikacji w przeglądarce — to Lekcja 4.
- Nie twórz potoków CI ani nie instaluj bez pytania menedżerów git-hooków; rekomenduj bramki pre-commit/pre-push i pozwól użytkownikowi zdecydować.

<!-- END @przeprogramowani/10x-cli -->
