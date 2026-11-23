---
date: 2026-11-19T13:56:28+01:00
researcher: Claude (Opus 5.5) z Szymonem Budrewiczem
git_commit: 959e924
branch: feat/m5l3-code-review-evals
repository: szymonbudrewicz/10xcards
topic: "Evale recenzenta (packages/code-reviewer) w promptfoo: ponowne użycie promptu i agenta, porównanie modeli, bramka regresji"
tags: [research, evals, promptfoo, code-reviewer, openrouter]
status: complete
last_updated: 2026-11-19
last_updated_by: Claude (Opus 5.5)
---

# Research: evale recenzenta w promptfoo

**Date**: 2026-11-19T13:56:28+01:00
**Git Commit**: 959e924 (main po PR #31)
**Branch**: feat/m5l3-code-review-evals
**Repository**: szymonbudrewicz/10xcards

## Research Question

Czy `packages/code-reviewer` nadaje się do evali (ponowne użycie promptu, importowalność agenta) i czy promptfoo pasuje do stacku (Node 24, TS ESM, AI SDK 7, OpenRouter)? Jak zbudować zestaw: przypadki `user_id` z body → fail z niską `accountIsolation`, czysty diff → pass, logowanie wklejonego tekstu → fail z prywatności; asercje `is-json`, `javascript`, `llm-rubric`; 2–3 modele z kosztem i czasem; skrypt npm jako bramka regresji bez sieci w `npm test`; ocena `REVIEW_MAX_REASONING_TOKENS=8000`. Źródło celów: `context/changes/code-review-evals/change.md`, lekcja M5L3 („Testowanie zmian w agentach z promptfoo”), `.claude/prompts/m5l3-promptfoo.md`, `.claude/config-templates/m5l3-promptfooconfig.yaml.template`.

## Summary

- **Agent jest importowalny i gotowy do evali.** `runReview(input, { model, limits })` (`packages/code-reviewer/src/agent.ts`) to biblioteka bez efektów ubocznych przy imporcie (pilnuje tego `tests/library.test.ts`), zwraca `{ review, modelVerdict, usage }` z tokenami i kosztem; model dostarcza wywołujący przez `createOpenRouterModel({ apiKey, modelId, baseURL })` (`src/model.ts`). Publiczne API eksportuje też `SYSTEM_PROMPT`, `buildReviewPrompt`, `REVIEW_SCHEMA`, `REVIEW_JSON_SCHEMA`, `CRITERION_KEYS`, `HARD_CRITERIA`, `verdictFromScores` (`src/index.ts`).
- **Stack jest zgodny z promptfoo.** promptfoo 0.126.0 (npm, 2026-11-18) wymaga Node `>=22.22.0`; lokalnie Node 24.21, CI recenzenta używa Node 24 (`.github/actions/ai-reviewer/action.yml`). Dokumentacja providerów: custom provider w `.ts` ładowany w Node przez `file://`, eksport `default class … implements ApiProvider` z `id()` i `callApi(prompt, context)`; `context.vars` niesie zmienne testu; ten sam plik można podać wiele razy z różnym `config` i `label` („Multiple Instances”) ([custom-api](https://www.promptfoo.dev/docs/providers/custom-api)).
- **Rekomendowany provider: własny `file://evals/reviewProvider.ts` wołający `runReview`**, nie goły `openrouter:` z `prompts/review.txt` z szablonu kursu. Goły provider testuje sam model z kopią promptu i pomija to, co chcemy ocenić: schemat przez `Output.object`, regułę werdyktu w kodzie (`src/verdict.ts`), limit rozumowania (`providerOptions.openrouter.reasoning.max_tokens`, `src/agent.ts`) i limity kosztu. Lekcja opisuje ten sam wybór dla repozytorium przykładów („providerem jest własny plik `file://./reviewProvider.ts`, który uruchamia całego agenta”). Prompt nie musi być kopiowany: provider dostaje diff z `context.vars`.
- **Kontrakt odpowiedzi providera** (custom-api): `output` może być obiektem, `tokenUsage { total, prompt, completion }`, `cost` (przykład `0.002`, jednostka niepodana wprost — `getModelPricing` mówi o USD), `error` dla nieudanych wywołań, `metadata`. `RunUsage` daje wszystko poza czasem; **`latencyMs` nie jest opisane na sprawdzonych stronach** — do potwierdzenia w implementacji (fallback: pomiar w providerze i zwrot w `metadata`).
- **Bramka bez sieci w `npm test`:** Vitest obejmuje wyłącznie `tests/**/*.test.ts` (`packages/code-reviewer/vitest.config.ts`), więc katalog `evals/` i skrypt `npm run eval` są poza `npm test`. CLI respektuje `OPENROUTER_BASE_URL` (`src/cli.ts`, `src/model.ts`), a testy mają fałszywy OpenRouter na loopback (`tests/helpers/fake-openrouter.ts`) — ten sam mechanizm pozwala na darmowy, offline'owy przebieg kontrolny configu promptfoo (sprawdzenie ładowania `.ts` i asercji `javascript`) przed płatnymi przebiegami.
- **promptfoo kończy się kodem 100 przy niezaliczonym teście**, 1 przy innym błędzie; próg `PROMPTFOO_PASS_RATE_THRESHOLD` (domyślnie 100) ([command-line](https://www.promptfoo.dev/docs/usage/command-line/)). Lesson rule „bramki po kodzie wyjścia” (`context/foundation/lessons.md`) — skrypt musi przekazać kod 100 dalej.
- **Modele w OpenRouterze** (API `/api/v1/models`, 2026-11-19, wszystkie z `reasoning` i `structured_outputs`): `z-ai/glm-5.3` $0.07/$1.40 za 1M (in/out), `deepseek/deepseek-v4.1-flash` $0.05/$0.20, `openai/gpt-5.6-luna` $0.20/$1.20, `openai/gpt-6-luna` $0.10/$0.50, `anthropic/claude-haiku-5.5` $0.10/$0.50, `anthropic/claude-sonnet-5.5` $2.00/$10.00. Prompt kursu wymienia trzy pierwsze (`.claude/prompts/m5l3-promptfoo.md`); lekcja w tekście używa `openai/gpt-6-luna`.
- **Zmienność kosztu `glm-5.3` wskazuje na routing między dostawcami.** Przy cenach z katalogu 32k tokenów wejścia + 628 wyjścia ≈ $0.003, a lokalny przebieg z 2026-11-19 kosztował $0.047; przebiegi CI na podobnym wejściu (35k in, 1.1–1.4k out) kosztowały $0.007–0.008, a jeden zużył 16 000 tokenów wyjścia (`finishReason=length`, `context/changes/ci-cd-code-review/plan.md`, notka fazy 4). Wniosek (nie fakt): OpenRouter kieruje żądania do różnych dostawców o różnej cenie i zachowaniu rozumowania. Dla porównywalności evali warto rozważyć przypięcie dostawcy (`provider` w OpenRouter) albo co najmniej raportowanie go.

## Detailed Findings

### Ponowne użycie agenta i promptu

- `runReview` buduje prompt z `{ diff, title, body }` przez `buildReviewPrompt` (`src/prompts/review.ts`) i `SYSTEM_PROMPT` (`src/prompts/system.ts`) — provider evali przekazuje te same pola z `context.vars`, więc eval testuje dokładnie ścieżkę CI.
- Wynik: `review.verdict` z reguły (`src/verdict.ts`), `modelVerdict` — werdykt samego modelu. Asercja może sprawdzać oba: zgodność modelu z regułą to sygnał jakości promptu niezależny od bramki.
- Błędy przebiegu mają typy: `DiffTooLargeError`, `BudgetExceededError`, `OutputTokenLimitError` (limit, `finishReason=length`), `NoReviewOutputError` (`src/limits.ts`). Provider może je zwrócić jako `error` z nazwą klasy, co w macierzy odróżni „model nie odpowiedział” od „zła ocena”.
- `RunUsage { modelId, steps, inputTokens, outputTokens, costUsd }` (`src/agent.ts`) mapuje się na `tokenUsage` i `cost` promptfoo; `costUsd` pochodzi z `usage.cost` OpenRoutera (`src/cost.ts`), `undefined` gdy provider go nie zwrócił.
- Limity jako `Partial<ReviewLimits>` w `runReview` (`src/agent.ts`) — provider może przyjąć `maxReasoningTokens` z `config` i porównać np. 8000 z innym ustawieniem jako osobne „providery” w macierzy (to odpowiada na pytanie o ocenę `REVIEW_MAX_REASONING_TOKENS=8000`).

### Asercje

- `is-json`: przy providerze zwracającym obiekt promptfoo porównuje obiekt; lekcja zaleca asercję przyjmującą string albo obiekt (`typeof output === 'string' ? JSON.parse(output) : output`). Walidację schematu można oprzeć na `REVIEW_JSON_SCHEMA` (draft-07, `src/review-schema.ts`) — `is-json` przyjmuje schemat JSON jako `value`.
- `javascript`: werdykt i progi z kryteriów (`accountIsolation.score <= 3`, `privacySecretsAiCost.score <= 4`, `verdict === 'fail'`); wartości progów są w `src/verdict.ts` (`HARD_FAIL_AT_OR_BELOW = 4`, `ANY_FAIL_AT_OR_BELOW = 3`).
- `llm-rubric`: grader ustawiany przez `defaultTest.options.provider` (albo `--grader`); dostaje `{{output}}` (obiekt zamieniany na JSON) i rubrykę; zwraca `{ reason, score, pass }` ([llm-rubric](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric)). Strona nie pokazuje przykładu z `openrouter:` jako graderem — szablon kursu go używa (`openrouter:anthropic/claude-sonnet-5.5`), do potwierdzenia pierwszym płatnym przebiegiem.
- Długość uzasadnień („jedno zdanie”, odłożone z `ci-cd-code-review`) da się sprawdzić deterministycznie asercją `javascript` (np. liczba zdań lub znaków w `reason`) — bez dodatkowego kosztu gradera.

### Przypadki testowe (fixtures)

- `user_id` z body: realny diff PR #30 (`src/pages/api/cards/by-user.ts` na zamkniętej gałęzi `demo/ai-cr-fail`; commit dostępny w PR #30). W CI `glm-5.3` ocenił `accountIsolation` na 4/10 — dokładnie próg reguły; to przypadek graniczny, którego eval powinien pilnować (oczekiwanie ≤ 3 jest ostrzejsze niż reguła).
- Logowanie wklejonego tekstu: łamie zasadę z CLAUDE.md („Wklejony tekst użytkownika nie może być zapisywany ani logowany”); naturalny kandydat to `src/pages/api/generate.ts` z `console.log` treści wejściowej.
- Czysty mały diff na pass: zmiana zgodna z konwencjami z testem w `tests/` (np. drobna funkcja w `src/lib/` + test Vitest).
- Diff React 16 → 19 z trzema błędami (szablon kursu) jest generyczny wobec kryteriów 10xCards; opcjonalny.
- `data/sample.diff` (bulk-delete z kluczem service-role) — istniejący przypadek fail na wielu osiach.
- Diffy JSX zawierają `{{ }}` — lekcja: `PROMPTFOO_DISABLE_TEMPLATING=true`, inaczej Nunjucks je interpretuje.

### Integracja z paczką i repo

- `tsconfig.json` paczki obejmuje `src/**`, `tests/**`, `vitest.config.ts` — pliki w `evals/` wymagają dopisania do `include`, żeby `npm run typecheck` je sprawdzał.
- Root ESLint lintuje `packages/` (CI uruchamia go po `npm ci` paczki, `.github/workflows/ci.yml`) — nowe pliki `evals/*.ts` przejdą przez te same reguły.
- `promptfoo` jako devDependency paczki (34 MB rozpakowany); paczka ma własny `package-lock.json` w cache `ci.yml` — instalacja wydłuży `npm ci` w CI, chyba że eval nie trafi do CI (bramka ręczna przed zmianą promptu/modelu).
- Klucz: `packages/code-reviewer/.env` ładowany przez dotenv w CLI (`src/cli.ts`); promptfoo czyta `OPENROUTER_API_KEY` z env (dla gradera `openrouter:`). Provider evali musi wczytać ten sam `.env` paczki (nie `.dev.vars`, nie root `.env`).

## Code References

- `packages/code-reviewer/src/agent.ts` — `createReviewer`, `runReview`, limity, `providerOptions.openrouter.reasoning`, mapowanie `NoOutputGeneratedError`/`NoObjectGeneratedError`
- `packages/code-reviewer/src/index.ts` — publiczne API (bez efektów ubocznych)
- `packages/code-reviewer/src/model.ts` — `createOpenRouterModel` z `usage: { include: true }` i `baseURL`
- `packages/code-reviewer/src/verdict.ts` — progi reguły werdyktu
- `packages/code-reviewer/src/review-schema.ts` — `REVIEW_SCHEMA`, `REVIEW_JSON_SCHEMA`, `CRITERIA`
- `packages/code-reviewer/src/limits.ts` — `DEFAULT_LIMITS` (16 000 out, 8 000 reasoning, $0.10), typy błędów
- `packages/code-reviewer/vitest.config.ts` — `include: ["tests/**/*.test.ts"]`
- `packages/code-reviewer/tests/helpers/fake-openrouter.ts` — fałszywy OpenRouter na loopback
- `.claude/config-templates/m5l3-promptfooconfig.yaml.template` — szablon kursu (3 modele, grader Sonnet 5.5, is-json/llm-rubric/javascript)

## Architecture Insights

- Ten sam podział co w CI: logika recenzji w paczce, a otoczka (CI, eval) tylko dostarcza wejście i czyta wynik. Provider evali to cienki adapter `context.vars → runReview → ProviderResponse`, analogiczny do akcji GitHub.
- Werdykt bramki CI jest wynikiem reguły, więc eval powinien oceniać przede wszystkim **oceny i uzasadnienia** (to, na czym reguła się opiera), a `modelVerdict` jako dodatkowy sygnał.

## Historical Context (from prior changes)

- `context/changes/ci-cd-code-review/plan.md` (notka fazy 4) — `glm-5.3` zużył 16 000 tokenów wyjścia na rozumowanie; dodano `maxReasoningTokens=8000` bez evali. Supported: limit działa w CI (out=1136, 1381, 1116 w kolejnych przebiegach); jakość ocen przy limicie nieoceniona.
- `context/changes/tool-loop-agent/plan.md` — decyzja z M5L2, że biblioteka ma być importowalna „dla przyszłego providera promptfoo” (`tests/library.test.ts`, komentarz w pliku). Supported: import bez efektów ubocznych jest testowany.

## Related Research

- `context/changes/ci-cd-code-review/research.md` — kontrakt CLI i akcji CI.

## Open Questions

1. Czy promptfoo samo mierzy czas odpowiedzi providera (`latencyMs`) dla custom providera — potwierdzić pierwszym przebiegiem; inaczej pomiar w providerze.
2. Czy grader `llm-rubric` przez `openrouter:` działa bez dodatkowej konfiguracji — potwierdzić pierwszym płatnym przebiegiem.
3. Wybór modeli do porównania (2–3) i modelu gradera (koszt: Sonnet 5.5 $2/$10 vs Haiku 5.5 $0.10/$0.50).
4. Przypinać dostawcę OpenRouter dla porównywalności, czy raportować tylko obserwowany koszt.
5. Ile powtórzeń na przypadek (zmienność modelu) i czy próg `PROMPTFOO_PASS_RATE_THRESHOLD` zostaje 100.
6. Czy eval trafia do CI (koszt, sekret) czy zostaje bramką ręczną przed zmianą promptu/modelu.
