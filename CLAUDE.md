# CLAUDE.md

## Project

**10xCards** — AI-generated flashcards with spaced repetition (PRD: `@context/foundation/prd.md`, stack: `@context/foundation/tech-stack.md`, shaping notes: `@context/foundation/shape-notes.md`). Only the starter's auth flow exists so far; flashcard features are not yet implemented.

Docs under `context/` are written in Polish; `context/archive/` is immutable — never write there (open a new change with `/10x-new` instead). `AGENTS.md` just points at this file.

## Commands

- `npx astro check` — type check (CI runs it after `npx astro sync`)
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server; `BASE_URL` defaults to `http://localhost:4321`. Run after dependency upgrades.
- `npm run isolation` — proves account B cannot read/change/delete/impersonate account A's cards and anon has no access (`scripts/isolation-check.mjs`). Needs `SUPABASE_URL`/`SUPABASE_KEY` from `npx supabase status -o env` (API_URL, ANON_KEY) in the environment; refuses any non-loopback host and never reads `.dev.vars`. Never run it against production.

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

## Zestaw narzędzi AI 10xDevs - Moduł 2, Lekcja 2

Przekształć jeden element roadmapy w pierwszy cykl implementacji za pomocą **łańcucha planowania zmian**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review` i `/10x-implement` są głównym tematem lekcji. `/10x-frame` i `/10x-research` nie są tutaj wymaganymi rytuałami; są ścieżkami eskalacji wprowadzanymi w następnej lekcji.

### Router zadań - od czego zacząć

| Umiejętność | Użyj jej, gdy |
| --- | --- |
| **Konfiguracja zmiany (główny temat lekcji)** | |
| `/10x-new <change-id>` | Wybrano element roadmapy i potrzebny jest stabilny folder zmiany. Tworzy `context/changes/<change-id>/change.md`, aby planowanie, implementacja, postęp, commity i późniejszy przegląd miały wspólną tożsamość. Użyj PO wybraniu elementu roadmapy, PRZED `/10x-plan`. |
| **Planowanie (główny temat lekcji)** | |
| `/10x-plan <change-id>` | Masz folder zmiany i potrzebujesz planu implementacji możliwego do przeglądu. Odczytuje kontekst roadmapy, dokumenty podstawowe, dowody z codebase oraz wszelkie istniejące notatki dotyczące zmiany; zapisuje `plan.md` i `plan-brief.md` z fazami, kontraktami plików, kryteriami sukcesu oraz `## Progress`. |
| **Gotowość planu (główny temat lekcji)** | |
| `/10x-plan-review <change-id>` | Masz `plan.md` i potrzebujesz lekkiej kontroli gotowości przed rozpoczęciem kodowania. Użyj jej, aby wychwycić brakujący stan końcowy, słabe kontrakty, nieprawidłowo sformatowany postęp, dryf zakresu lub martwe punkty, zanim rozpoczną się zmiany w kodzie. |
| **Implementacja (główny temat lekcji)** | |
| `/10x-implement <change-id> phase <n>` | Masz zatwierdzony plan i chcesz wykonać jedną fazę z weryfikacją, ręczną bramką, rytuałem commitu oraz zapisaniem SHA w `## Progress`. |
| **Zamknięcie cyklu życia** | |
| `/10x-archive <change-id>` | Zmiana jest scalona lub celowo zamknięta. Przenieś ją z aktywnego `context/changes/` do stanu archiwalnego. |

### Jak łańcuch przekazuje pracę

- `/10x-new` tworzy trwałą tożsamość zmiany.
- `/10x-plan` przekształca tę tożsamość w kontrakt implementacyjny.
- `/10x-plan-review` sprawdza plan, zanim agent zmodyfikuje kod.
- `/10x-implement` wykonuje jedną zaplanowaną fazę, weryfikuje, prosi o ręczne potwierdzenie, gdy jest potrzebne, wykonuje commit i rejestruje postęp.

### Granice lekcji

- Plan jest domyślnym routerem po wyborze elementu roadmapy. Zacznij od `/10x-plan`, chyba że problem jest niejasny lub blokują Cię dowody zewnętrzne.
- Nie uruchamiaj `/10x-frame + /10x-research` jako ceremonii dla każdej zmiany.
- Nie przekształcaj tej lekcji w pełną, kompleksową budowę produktu. Punkt kontrolny z zaplanowanym i częściowo lub w pełni zaimplementowanym strumieniem jest prawidłowy.
- Przegląd kodu zaimplementowanego diffu należy do Lekcji 3 poprzez `/10x-impl-review`.
- Zamknięcie cyklu życia przez `/10x-archive` po scaleniu lub celowym zamknięciu zmiany.

### Ścieżki używane w tej lekcji

- `context/foundation/roadmap.md` - nadrzędna roadmapa
- `context/changes/<change-id>/change.md` - tożsamość zmiany
- `context/changes/<change-id>/plan.md` - kontrakt implementacyjny
- `context/changes/<change-id>/plan-brief.md` - skompresowane przekazanie
- `context/foundation/lessons.md` - powtarzające się reguły i pułapki
- `docs/reference/contract-surfaces.md` - rejestr nazw kluczowych dla działania systemu

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozstrzygnięta ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
