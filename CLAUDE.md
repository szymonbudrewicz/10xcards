# CLAUDE.md

## Project

**10xCards** — AI-generated flashcards with spaced repetition (PRD: `@context/foundation/prd.md`, stack: `@context/foundation/tech-stack.md`, shaping notes: `@context/foundation/shape-notes.md`). Auth, AI card-proposal generation (`/generate`, `POST /api/generate`) and accepting proposals as saved cards (`POST /api/cards` → `accept_proposal()`, counters in `generations`; editor `src/components/cards/CardEditor.tsx`, shared with card management) and managing saved cards (`/cards`, `PATCH`/`DELETE /api/cards/[id]`; `update` on `cards` is granted only for `front`/`back`) exist; review sessions are not yet implemented.

Docs under `context/` are written in Polish; `context/archive/` is immutable — never write there (open a new change with `/10x-new` instead). `AGENTS.md` just points at this file.

## Commands

- `npx astro check` — type check (CI runs it after `npx astro sync`)
- `npm test` — Vitest (`tests/**/*.test.ts`), no server or network: endpoints are called directly, global `fetch` is stubbed as the AI boundary. Put tests in `tests/`, never in `src/pages/` (Astro turns every file there into a route). Patterns: `context/foundation/test-plan.md` §6.
- `npm run test:mutation` — Stryker, ad hoc only, for a module tied to a test-plan risk; don't chase the score, judge surviving mutants one by one. On Windows + Vitest 5 its score was unreliable (`context/changes/testing-generation-guard/stryker-report.md`).
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server; `BASE_URL` defaults to `http://localhost:4321`. Run after dependency upgrades.
- `npm run isolation` — proves account B cannot read/change/delete/impersonate account A's cards and anon has no access (`scripts/isolation-check.mjs`). Needs `SUPABASE_URL`/`SUPABASE_KEY` from `npx supabase status -o env` (API_URL, ANON_KEY) in the environment (POSIX and PowerShell snippets in the script header); needs `npx supabase start` with migrations applied and email confirmation disabled. Refuses any non-loopback host and never reads `.dev.vars`. Never run it against production. CI runs it in the `smoke` job.
- `npm run test:integration` — Vitest on `tests/integration/**` (excluded from `npm test`) against local Supabase: `accept_proposal()` and counters, checked by reading the DB. Same env, prerequisites and loopback-only guard as `npm run isolation`; never against production. CI runs it in the `smoke` job.
- `git diff | npm run review --prefix packages/code-reviewer` — AI code reviewer (separate package, own `node_modules`; `npm ci --prefix packages/code-reviewer` first). JSON review on stdout, usage/cost on stderr; exit 0 review, 1 setup/provider error, 2 a per-run limit hit (`REVIEW_MAX_*` in `.env.example`). Key only in `packages/code-reviewer/.env`, never `.dev.vars`. Library API: `packages/code-reviewer/src/index.ts`. `npm run comment --prefix packages/code-reviewer -- --review <file.json> | --no-verdict <reason>` renders the PR comment (used by CI). Tests: `npm test --prefix packages/code-reviewer` (no network: fake OpenRouter on loopback), run in CI.
- `npm run eval --prefix packages/code-reviewer` — promptfoo evals of the reviewer (`evals/`, provider runs the real `runReview`): **paid** OpenRouter regression gate; run it before changing the review prompt, schema or model. Key from `packages/code-reviewer/.env` only; exit 0 pass, 100 a test failed, 1 error. Extra flags pass through (`-- --repeat 3`, `--filter-providers`). Not in `npm test` or CI; `tests/eval-provider.test.ts` covers the adapter offline. After schema changes: `npm run eval:schema`. Results and model decision: `context/changes/code-review-evals/results.md`.

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

## Zestaw narzędzi AI 10xDevs — Moduł 5, Lekcja 3 (Przegląd kodu w CI)

Przenieś agenta przeglądu do GitHub Actions i zamień jego werdykt w bramkę merge. Oceń zmiany promptów i modeli na stałym zestawie przypadków przed ich wdrożeniem.

```
m5l3-requirements -> /10x-new -> /10x-research -> /10x-plan -> review.yml + composite action -> promptfoo evals
```

### Router zadań — od czego zacząć

| Umiejętność / prompt / szablon | Użyj, gdy |
| --- | --- |
| `m5l3-requirements` + `m5l3-cicd` (prompty) | Prowadzisz badania i planujesz przepływ pracy przeglądu CI na podstawie pisemnych wymagań. |
| `m5l3-review.yml.template`, `m5l3-action.yml.template` (szablony konfiguracji) | Podłączasz recenzenta do przepływu PR: akcja kompozytowa z wejściami tytułu, treści i diffu, etykietami `ai-cr:passed` / `ai-cr:failed` oraz nieudaną kontrolą przy werdykcie `fail`. |
| `m5l3-promptfoo` (prompt) + `m5l3-promptfooconfig.yaml.template` | Porównujesz modele lub zmiany promptów na tych samych diffach za pomocą asercji is-json, llm-rubric i javascript. |
| `/10x-impl-review-ci` | Przeglądasz PR względem jego `context/changes/<id>/plan.md` w CI za pomocą Claude Code Action; szablon jego workflow znajduje się w katalogu `references/` umiejętności. |

### Twarde zasady

- **Przypinaj akcje zewnętrzne do pełnego SHA commita** z tagiem w komentarzu.
- **Bramkuj na polu werdyktu**, nigdy na swobodnym tekście wyjściowym.
- **Przekazuj wielowierszowe wartości (diffy) przez pliki lub ograniczniki heredoc**, a nie przez jednowierszowe zapisy `$GITHUB_OUTPUT`.
- **Uruchom zestaw ewaluacyjny przed zmianą promptu lub modelu przeglądu.**

<!-- END @przeprogramowani/10x-cli -->
