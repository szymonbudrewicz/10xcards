<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Tabela fiszek z izolacją danych per użytkownik (F-01)

- **Plan**: context/changes/cards-table-with-isolation/plan.md
- **Mode**: Deep
- **Date**: 2026-10-19
- **Verdict**: REVISE → SOUND po poprawkach (wszystkie ustalenia naprawione)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
6/6 istniejących ścieżek ✓, nowe pliki poprawnie nieistniejące ✓, symbole ✓, brief↔plan ✓, Progress↔Success Criteria ✓

## Findings

### F1 — Lint nie przejdzie dla skryptu używającego `URL`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2
- **Detail**: `scriptsConfig` w `eslint.config.js` zna tylko `console`, `process`, `fetch`, `URLSearchParams`; `new URL` i `crypto` dają `no-undef` (sprawdzone próbnym plikiem).
- **Fix**: Dopisać do Phase 2 zmianę `eslint.config.js` (globalne `URL`, `crypto`).
- **Decision**: FIXED (Fix in plan; Phase 2 pkt 3, kryterium 2.7)

### F2 — Uprawnienia `authenticated` zależą od domyślnych; asercja `anon` niejednoznaczna

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, Phase 2
- **Detail**: Migracja odbiera uprawnienia `anon`, ale `authenticated` polega na domyślnych grantach (hostowane mogą się różnić; niesprawdzone). Po `revoke` `anon` dostaje błąd uprawnień, nie pustą listę.
- **Fix**: Jawny grant dla `authenticated`; dla `anon` akceptować błąd lub pustą listę, nigdy wiersze.
- **Decision**: FIXED (Fix in plan; migracja, Critical Implementation Details, kroki `anon`, kontrola katalogu w fazie 4)

### F3 — Faza 4 pomija hasło do bazy przy `db push`

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4, pkt 1
- **Detail**: `link`/`db push` wymagają tokenu i hasła do bazy; plan nie mówił, że wpisuje je człowiek w zwykłym terminalu.
- **Fix**: Dopisać uwagę do kontraktu pkt 1.
- **Decision**: FIXED (Fix in plan)

### F4 — Roadmapa obiecuje test na dwóch kontach „na produkcji"

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: roadmap.md F-01 Outcome vs plan
- **Detail**: Plan dowodzi izolacji na dwóch kontach tylko lokalnie (CI), a na produkcji sprawdza konfigurację.
- **Fix**: Zmienić Outcome F-01 w roadmapie.
- **Decision**: FIXED (Fix in plan; tylko linia Outcome w roadmap.md)
