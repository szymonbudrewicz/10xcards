# Modułowy recenzent ToolLoopAgent z limitem kosztu — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

Jednoplikowy recenzent z M5L2 uruchamia się przy samym imporcie, więc nie da się go użyć jako biblioteki — a w M5L3 ewaluacje promptfoo muszą go zaimportować. Rozbijamy go na moduły i dokładamy twardy limit kosztu na przebieg, którego wymaga CLAUDE.md, zanim agent zacznie działać bez nadzoru w CI.

## Starting Point

`packages/code-reviewer/src/index.ts` (PR #27) robi wszystko na najwyższym poziomie: `.env`, odczyt diffa, `ToolLoopAgent` z OpenRouterem, koszt, stdout/stderr. `review-schema.ts` trzyma schemat razem z promptem systemowym. Brak testów i brak limitu kosztu poza `isStepCount(2)` i limitem na kluczu.

## Desired End State

`src/index.ts` eksportuje recenzenta (`createReviewer`, `runReview`) bez efektów ubocznych; `src/cli.ts` robi I/O. Za duży diff jest odrzucany przed wywołaniem modelu, wyjście ma sufit tokenów, przekroczenie budżetu ($0.10 domyślnie) kończy CLI kodem 2. Testy bez sieci chodzą w CI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Miejsce promptów | `src/prompts/` (system + `buildReviewPrompt`); `review-schema.ts` = sam kontrakt | Prompty iteruje się w evalach, kontrakt zmienia się rzadko i świadomie. |
| Mechanizm limitu | 3 warstwy: limit diffa przed wywołaniem, `maxOutputTokens`, `StopCondition` z kosztem | `StopCondition` sprawdza się dopiero po kroku z narzędziami, więc sam nie ogranicza 1-krokowego przebiegu. |
| Budżet i przekroczenie | `REVIEW_MAX_COST_USD=0.10`; błąd, pusty stdout, exit 2 | ~7× zapasu nad $0.014; CI odróżni budżet (2) od awarii (1) po kodzie wyjścia. |
| Kolejność refaktoru | Najpierw testy charakteryzujące na starym `index.ts`, potem podział; testy bez zmian | Dowód, że refaktor nie zmienił zachowania (korekta użytkownika). |
| Testy | Vitest w pakiecie: CLI z fałszywym serwerem OpenRoutera na loopbacku + jednostkowe na `MockLanguageModelV4` | Granica pakietu zostaje czysta, a limit da się udowodnić bez płacenia. |
| Domyślne limity | 200 000 znaków diffa, 16 000 tokenów wyjścia | Pierwszy przebieg zużył ~7k tokenów wyjścia (reasoning) — ciaśniejszy sufit urwałby recenzję. |

## Scope

**In scope:** podział na moduły, publiczne API, limity kosztu z kodem 2, Vitest w pakiecie, krok testów w CI, wpis w CLAUDE.md.

**Out of scope:** promptfoo, bramka na werdykcie i komentarz do PR (M5L3), narzędzia agenta, zmiana treści promptu, schematu i modelu, wczytywanie `CLAUDE.md` do instrukcji.

## Architecture / Approach

`cli.ts` (env, `.env`, stdin, stdout/stderr, kody wyjścia) → `model.ts` (OpenRouter z `usage.include`) → `agent.ts` (`runReview(diff, { model, limits })`: limit diffa → `ToolLoopAgent` z `maxOutputTokens` i `stopWhen: [isStepCount(2), costBudget]` → kontrola kosztu po przebiegu). `agent.ts` przyjmuje dowolny `LanguageModel`, więc testy i promptfoo podają własny. Kontrakt `review-schema.ts` i `prompts/` są czytane przez agenta.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Testy charakteryzujące, potem moduły | Zamrożone zachowanie CLI, recenzent jako biblioteka | Fałszywy serwer musi dokładnie udawać format OpenRoutera |
| 2. Limit kosztu | 3 warstwy limitu, exit 2, testy granic | Za ciasny `maxOutputTokens` urwie reasoning modelu |
| 3. CI i weryfikacja | Testy w CI, jeden płatny przebieg | Testy CLI z procesem potomnym na Linuksie w CI |

**Prerequisites:** PR #27 scalony (0c7dca4); klucz OpenRouter w `packages/code-reviewer/.env` tylko do ręcznej weryfikacji w fazie 3.
**Estimated effort:** ~1–2 sesje, 3 fazy.

## Open Risks & Assumptions

- Koszt z OpenRoutera przychodzi po fakcie: limit nie zwraca wydanych pieniędzy, tylko zatrzymuje kolejne kroki i odrzuca wynik; realny sufit wydatków to nadal limit na kluczu.
- Testy muszą jawnie nadpisywać `OPENROUTER_API_KEY`, bo CLI ładuje `.env` z prawdziwym kluczem.

## Success Criteria (Summary)

- Te same testy CLI przechodzą przed i po refaktorze; `import` recenzenta nic nie uruchamia.
- Przebieg powyżej budżetu lub z za dużym diffem kończy się kodem 2, bez JSON na stdout — sprawdzone testami bez sieci w CI.
- Płatny przebieg na `sample.diff` daje ten sam JSON i linię `[usage]` co przed zmianą.
