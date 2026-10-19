# CLAUDE.md

## Project

**10xCards** — AI-generated flashcards with spaced repetition (PRD: `@context/foundation/prd.md`, stack: `@context/foundation/tech-stack.md`, shaping notes: `@context/foundation/shape-notes.md`). Only the starter's auth flow exists so far; flashcard features are not yet implemented.

Docs under `context/` are written in Polish; `context/archive/` is immutable — never write there (open a new change with `/10x-new` instead). `AGENTS.md` just points at this file.

## Commands

- `npx astro check` — type check (CI runs it after `npx astro sync`)
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server; `BASE_URL` defaults to `http://localhost:4321`. Run after dependency upgrades.

No unit-test runner is configured. CI (`.github/workflows`) runs on pushes and pull requests to `main` (lint, `astro check`, build, plus the `smoke` job); there is no deploy job.

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

## 10x course tooling

- 10xDevs skills are in `.claude/skills/`. Read each CLI skill's `references/compatibility.md` before running `10x_cli` commands.
- Do not pass `--course` normally; the edition comes from `.10x-cli.json`. Never rewrite a bound project to another edition (`course_mismatch`), and preserve `.10x-cli.json`, manifests and local work during `sync`.
- Don't treat a successful `--help` as proof a feature has shipped (e.g. `helpers install` is unreleased in 1.21.0/1.22.0 baselines).
- Rules-file filter: add a rule only if the agent couldn't know it from public training data. Recurring pitfalls go to `context/foundation/lessons.md` via `/10x-lesson` (append-only).
<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — Moduł 2, Lekcja 1

Przejdź od konfiguracji sprintu zerowego do orkiestracji projektu za pomocą **łańcucha roadmapy**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` jest tematem lekcji. `/10x-new` zostaje celowo wprowadzone w Module 2, Lesson 2, gdy wybrany element roadmapy staje się folderem zmiany implementacyjnej.

### Router zadań — od czego zacząć

| Skill | Użyj, gdy |
| --- | --- |
| **Roadmap (temat lekcji)** | |
| `/10x-roadmap` | Masz `context/foundation/prd.md` oraz przygotowaną bazę projektu i potrzebujesz roadmapy MVP o priorytecie pionowych przekrojów. Skill odczytuje PRD, analizuje bazę kodu, wykorzystuje dostępne dokumenty podstawowe, takie jak `tech-stack.md`, `infrastructure.md` i `deploy-plan.md`, a następnie zapisuje `context/foundation/roadmap.md`. Użyj go PRZED utworzeniem folderów dla poszczególnych zmian lub planów implementacji. |
| **W razie potrzeby uruchom ponownie etap wcześniejszy** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Zestawione z Module 1, aby kontrakty podstawowe można było poprawić przed ustaleniem kolejności roadmapy. Jeśli generowanie roadmapy ujawni lukę w PRD, popraw PRD, zanim uznasz backlog za gotowy. |

### Jak łańcuch przekazuje pracę dalej

- `/10x-roadmap` łączy produkt z implementacją. Nie wybiera frameworków, nie projektuje schematów ani nie tworzy planu implementacji dla pojedynczej zmiany.
- Wynikiem jest `context/foundation/roadmap.md`: uporządkowane kamienie milowe, pionowe przekroje, ograniczone fundamenty, zależności, niewiadome, ryzyka oraz pola przekazania do backlogu.
- Elementy roadmapy powinny otrzymywać stabilne, czytelne dla ludzi identyfikatory w narzędziach backlogu. Rzeczywisty folder `context/changes/<change-id>/` zostanie utworzony w Lekcji 2 za pomocą `/10x-new`.

### Granice roadmapy

- Domyślnie stosuj pionowe przekroje: widoczne dla użytkownika rezultaty obejmujące UI, dane, logikę biznesową i integracje.
- Praca horyzontalna jest dozwolona tylko jako ograniczony element umożliwiający realizację, który wskazuje docelowy pionowy kamień milowy, jaki odblokowuje.
- Unikaj osieroconej pracy horyzontalnej, takiej jak „zbuduj całą bazę danych”, „zbuduj wszystkie endpointy API” lub „zaprojektuj cały UI” przed pierwszym przepływem widocznym dla użytkownika.
- Roadmapa nie jest estymacją kalendarzową. Nie wymyślaj dat, punktów historyjek ani prędkości sprintu, chyba że użytkownik wyraźnie poprosi o osobny artefakt planowania.

### Ścieżki podstawowe używane przez tę lekcję

- `context/foundation/prd.md` — dane wejściowe
- `context/foundation/tech-stack.md` — opcjonalne dane wejściowe
- `context/foundation/infrastructure.md` — opcjonalne dane wejściowe
- `context/deployment/deploy-plan.md` — opcjonalne dane wejściowe
- `context/foundation/roadmap.md` — dane wyjściowe
- `context/foundation/lessons.md` — powtarzające się reguły i pułapki
- `docs/reference/contract-surfaces.md` — rejestr nazw krytycznych dla działania

Skills nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozwiązana ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: „This change is archived. Open a new change with `/10x-new` instead.”

<!-- END @przeprogramowani/10x-cli -->
