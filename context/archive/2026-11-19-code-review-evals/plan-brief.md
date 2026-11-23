# Evale recenzenta AI w promptfoo — Plan Brief

> Full plan: `context/changes/code-review-evals/plan.md`
> Research: `context/changes/code-review-evals/research.md`

## What & Why

Recenzent AI w CI (`packages/code-reviewer`) wybiera model i limit rozumowania „na przeczucie z jednego PR-a”: `glm-5.3` raz zużył 16 tys. tokenów na rozumowanie, koszt tego samego wejścia wahał się 7×, a `user_id` z body dostał 4/10 — dokładnie próg. Budujemy zestaw evali promptfoo na stałych diffach, porównujemy modele obok siebie (pass/fail, koszt, czas) i zostawiamy go jako bramkę regresji przed zmianami promptu i modelu (zadanie 3 M5L3).

## Starting Point

`runReview` jest importowalną biblioteką bez efektów ubocznych z kosztem w `usage`; brakuje dostawcy OpenRouter, tokenów rozumowania i trybu „bez osobnego limitu rozumowania” (8000 wysyłane zawsze). promptfoo nie jest zainstalowane; `npm test` obejmuje tylko `tests/**`.

## Desired End State

`npm run eval` uruchamia pełnego agenta na 4 przypadkach × 4 kolumny modeli i kończy się 0/100. Macierz ×1 i ×3 leży w `results.md`, decyzja o modelu i limicie jest wdrożona w CLI i CI, uzasadnienia w komentarzu PR są jednym zdaniem, a zestaw przechodzi po tej zmianie.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Provider promptfoo | Własny `evals/reviewProvider.ts` → `runReview` | Testuje schemat, regułę werdyktu i limity — dokładnie ścieżkę CI. | Research / lekcja |
| Modele | glm-5.3, deepseek-v4.1-flash, gpt-6-luna | Trzech dostawców w jednym przedziale cenowym; gpt-6-luna nowszy i tańszy niż gpt-5.6-luna. | Plan |
| Grader `llm-rubric` | claude-sonnet-5.5 | Mocniejszy sędzia spoza ocenianej grupy. | Plan |
| Ocena limitu rozumowania | Kolumny `glm-5.3@8000` vs `glm-5.3@no-cap` | Bezpośrednio pokazuje koszt i wpływ limitu na jakość. | Plan |
| Próg `user_id` z body | `accountIsolation ≤ 3` (ostrzej niż reguła ≤ 4) | Pilnuje marginesu, którego zabrakło na PR #30. | Plan |
| Powtórzenia | ×1 w bramce, ×3 do decyzji | Tania bramka, rzetelna decyzja. | Plan |
| Dostawca OpenRouter | Raportowany w metadanych, nie przypinany | Eval mierzy to samo zachowanie co CI. | Plan |
| Eval w CI | Nie — bramka ręczna | Koszt i sekret; `npm test` bez sieci. | Użytkownik |
| Przypadki | user_id z body, czysty diff, logowanie wklejonego tekstu, service-role (sample.diff) | Minimum użytkownika + dwie twarde reguły 10xCards. | Użytkownik / Plan |

## Scope

**In scope:**
- `RunUsage.provider`, `reasoningTokens`, `maxReasoningTokens: null`, `[usage]` w CLI
- `evals/`: provider, 4 fixtures, `promptfooconfig.yaml`, `review.schema.json`; `npm run eval`; test adaptera w `npm test`
- przebiegi ×1 i ×3, `results.md`, decyzja i wdrożenie, CLAUDE.md
- krótsze uzasadnienia z asercją długości; PR

**Out of scope:**
- eval w CI, przypinanie dostawcy, diff React 19 z szablonu, goły `openrouter:` z kopią promptu
- zmiany reguły werdyktu i osi kryteriów; zadanie 4 lekcji

## Architecture / Approach

promptfoo → `reviewProvider.ts` (×4 z różnym `config.model` / `maxReasoningTokens`) → `runReview` → `ProviderResponse { output: review, tokenUsage, cost, metadata: { modelVerdict, provider, reasoningTokens, latencyMs } }`. Asercje: `is-json` ze schematem, `javascript` (werdykt i progi), `llm-rubric` (plik/linia) z graderem Sonnet 5.5. Klucz wyłącznie z `packages/code-reviewer/.env`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Diagnostyka w bibliotece | dostawca, tokeny rozumowania, tryb bez limitu | Zmiana domyślnego zachowania CI (ma zostać 8000) |
| 2. Zestaw evali offline | provider, fixtures, config, `npm run eval`, test adaptera | Ładowanie `.ts` przez promptfoo z importami `.ts` |
| 3. Przebieg ×1 | smoke + macierz 4×4, `results.md`, CLAUDE.md | Grader `openrouter:` / klucz dla gradera / dostęp do `metadata` niepotwierdzone |
| 4. Decyzja ×3 | wybór modelu i limitu, wdrożenie | Zaszumione wyniki przez routing dostawców |
| 5. Krótsze uzasadnienia | prompt + asercja długości, ponowny eval, PR | Krótszy prompt może obniżyć trafność ocen (eval to wykaże) |

**Prerequisites:** klucz OpenRouter w `packages/code-reviewer/.env` (jest), Node ≥ 22.22 (24.21).
**Estimated effort:** ~1–2 sesje; koszt przebiegów ~$0.05–0.35 (×1), ~3× dla ×3, każdy po potwierdzeniu.

## Open Risks & Assumptions

- Czas custom providera i dostęp asercji do `metadata` — potwierdzane w smoke teście fazy 3.
- Kolumna `glm-5.3@no-cap` może nie oddać werdyktu (limit 16k) — to wynik, nie błąd zestawu.
- Jedna próbka na komórkę w bramce może dawać fałszywe alarmy; ×3 tylko do decyzji.

## Success Criteria (Summary)

- `npm run eval` daje macierz 4×4 z kosztem i czasem; `npm test` bez sieci.
- Decyzja o modelu i limicie rozumowania oparta na ×3 i wdrożona w CLI i CI.
- Komentarz AI na PR ma jednozdaniowe uzasadnienia, a zestaw evali przechodzi.
