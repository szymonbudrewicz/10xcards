# Recenzent AI w GitHub Actions jako bramka merge — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

Recenzent z `packages/code-reviewer` ocenia dziś diff tylko lokalnie. Przenosimy go do GitHub Actions, żeby każdy PR do `main` dostał ocenę sześciu kryteriów 10xCards, a werdykt `fail` blokował merge. To rdzeń lekcji M5L3 i dowód do odznaki 10xChampion.

## Starting Point

CLI recenzenta działa bez builda, zwraca JSON z werdyktem liczonym regułą w kodzie i ma `renderComment()`. Na GitHubie nie ma jeszcze sekretu, etykiet `ai-cr:*` ani ochrony `main`; kurs dostarcza szablony workflow i composite action pod `master` i inny kontrakt CLI.

## Desired End State

Na każdym PR do `main` jest jeden aktualizowany komentarz bota z tabelą kryteriów, etykieta `ai-cr:passed`/`ai-cr:failed` i check `review`, który jest wymagany do merge. Etykieta `ai-cr:review` ponawia recenzję. Brak werdyktu (klucz, provider, limit) jest opisany w komentarzu i daje czerwony check.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Komentarz przy kolejnych pushach | `gh pr comment --edit-last --create-if-none` | Jeden aktualny komentarz, bez spamu. | Research → użytkownik |
| Ponowna recenzja | Osobny workflow, job `rerun` → `gh run rerun` | Pominięty job liczy się jako sukces, więc `labeled` nie może tworzyć checka `review`. | Research → użytkownik |
| Concurrency | Na poziomie joba `review` | Zdarzenia etykiet nie anulują trwającej recenzji. | Research |
| Lockfile'e | Wykluczone z diffa | Niższy koszt, brak exit 2 przy zmianach zależności. | Research → użytkownik |
| Pusty diff po filtrze | Pass bez modelu, komentarz z adnotacją | Bump zależności nie blokuje się i nic nie kosztuje. | Plan |
| Brak werdyktu (exit 1/2) | Komentarz z przyczyną + czerwony check | Autor wie, że to nie ocena kodu. | Research → użytkownik |
| Uruchomienie agenta | `npm ci` + `npm run review` paczki (bez `dist/`) | Paczka nie ma builda; `tsx` w devDependencies. | Research |
| Klucz | Sekret `OPENROUTER_API_KEY` tylko w akcji | Zgodne z CLI; nazwa szablonu `LLM_PROVIDER_API_KEY` zmieniona. | Research |
| Bramka merge | Wymagany check `review` po 1. zielonym | Werdykt realnie blokuje merge. | Plan |
| Pinowanie `ci.yml` | Poza zakresem | Spójny PR; osobna zmiana. | Plan |

## Scope

**In scope:**
- `npm run comment` w paczce (komentarz z review JSON / brak werdyktu) + testy
- `.github/actions/ai-reviewer/action.yml`, `.github/workflows/review.yml`, `.github/workflows/review-rerun.yml`
- sekret, PR tej zmiany, celowo zły PR, test rerun, zrzuty, wymagany check

**Out of scope:**
- pinowanie akcji w `ci.yml`, PR-y z forków / `pull_request_target`
- wybór modelu po evalach (zadanie 3), komentarze inline, plan review, triage

## Architecture / Approach

Paczka (recenzja, reguła werdyktu, render komentarza — testy bez sieci) → composite action (npm ci, CLI na pliku diffa, outputs `verdict`/`exit-code`/`reason`, klucz tylko tu, nie failuje joba) → workflow `review` (diff bez lockfile'i, komentarz edit-last, etykiety, na końcu „Gate on verdict”). Workflow `rerun` na etykietę ponawia oryginalny przebieg, więc check `review` przelicza się w miejscu. Tekst PR wyłącznie przez `env`/pliki; akcje przypięte do SHA.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Komentarz z pliku JSON | `npm run comment` + testy | Niewielkie: format Markdown tabeli |
| 2. Action + `review.yml` | Recenzja, komentarz, etykiety, bramka | Kolejność kroków: bramka musi być ostatnia, akcja nie może failować joba wcześniej |
| 3. `review-rerun.yml` | Rerun etykietą `ai-cr:review` | `GITHUB_TOKEN` może nie mieć prawa do `gh run rerun` (fallback: komentarz z instrukcją) |
| 4. GitHub i dowód | Sekret, PR pass, PR fail, zrzuty, wymagany check | Płatne przebiegi i zmiany ustawień repo — każdy krok po potwierdzeniu |

**Prerequisites:** zadanie 2 M5L3 w paczce (na tej gałęzi), osobny klucz OpenRouter z limitem wydatków, Docker do actionlint.
**Estimated effort:** ~1 sesja; fazy 1–3 lokalnie, faza 4 zależy od czasu przebiegów CI.

## Open Risks & Assumptions

- Rerun przez `GITHUB_TOKEN` z `actions: write` — niezweryfikowane, sprawdzane w fazie 4.
- `--edit-last` edytuje ostatni komentarz tego samego autora (github-actions[bot]); inne komentarze bota na PR mogłyby zostać nadpisane — dziś bot nie komentuje w tym repo.
- Werdykt modelu może być niestabilny między przebiegami; PR tej zmiany może dostać `fail` — wtedy poprawiamy kod albo dokumentujemy powód.

## Success Criteria (Summary)

- PR do `main` ma jeden komentarz z 6 kryteriami, właściwą etykietę i check `review`, który blokuje merge przy `fail`.
- Celowo zły PR (`user_id` z body) dostaje `fail` i `ai-cr:failed`; zrzuty pipeline'u, logów i komentarza są gotowe.
