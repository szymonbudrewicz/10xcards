# Recenzent AI w GitHub Actions jako bramka merge — plan implementacji

## Overview

Podłączamy recenzenta z `packages/code-reviewer` (M5L2 + zadanie 2 M5L3) do GitHub Actions. Na każdym PR do `main` composite action uruchamia agenta na diffie, a workflow publikuje jeden (edytowany) komentarz z oceną sześciu kryteriów, ustawia etykietę `ai-cr:passed`/`ai-cr:failed` i failuje check `review` przy werdykcie `fail`. Etykieta `ai-cr:review` uruchamia recenzję ponownie przez osobny workflow. Wymagania: `context/changes/ci-cd-code-review/requirements.md`; fakty: `research.md` w tym folderze.

## Current State Analysis

- CLI recenzenta działa bez builda (`tsx`), czyta diff z pliku (`packages/code-reviewer/src/cli.ts:24-35`), wymaga `OPENROUTER_API_KEY` z env (`cli.ts:55-59`), przyjmuje `PR_TITLE`/`PR_BODY` (`cli.ts:66-70`), stdout = JSON recenzji, exit 0/1/2 (`cli.ts:85-89`). Pusty diff powoduje fallback na `data/sample.diff` (`cli.ts:33-34`) — w CI niedopuszczalny.
- `verdict` jest wynikiem reguły w kodzie (`src/verdict.ts`); `renderComment()` (`src/comment.ts`) daje tabelę kryteriów, ale nie ma punktu wejścia z pliku.
- Szablony kursu: `.claude/config-templates/m5l3-action.yml.template` (zakłada `dist/review.js`, `LLM_PROVIDER_API_KEY`) i `m5l3-review.yml.template` (gałąź `master`, `concurrency` na poziomie workflow, `labeled` w tym samym workflow, nowy komentarz co przebieg, komentarz tylko z `summary`).
- GitHub (2026-11-19): brak sekretów, brak etykiet `ai-cr:*`, brak ochrony `main`, domyślne uprawnienia tokena `read`.
- Istniejący `.github/workflows/ci.yml` — osobny, nie zmieniamy.

## Desired End State

- PR do `main` (opened/synchronize/reopened) uruchamia workflow `AI Code Review` z jobem `review`; na PR jest dokładnie jeden komentarz bota z werdyktem, tabelą 6 kryteriów (ocena + uzasadnienie) i podsumowaniem, aktualizowany przy kolejnych pushach.
- Etykieta `ai-cr:passed` (zielona) lub `ai-cr:failed` (czerwona) odpowiada aktualnemu werdyktowi; check `review` jest czerwony przy `fail` i przy braku werdyktu.
- Brak werdyktu (brak klucza, błąd providera, limit) → komentarz z przyczyną, czerwony check, żadna z etykiet `passed/failed`.
- Diff bez `package-lock.json`; diff pusty po filtrze → komentarz „brak zmian do recenzji poza lockfile'ami”, `ai-cr:passed`, zielony check, bez wywołania modelu.
- Dodanie etykiety `ai-cr:review` → job `rerun` w workflow `AI Code Review (rerun)` ponawia ostatni przebieg `review` dla head SHA i zdejmuje etykietę; inne etykiety nie tworzą checka `review`.
- `review` jest wymaganym checkiem na `main` (po pierwszym zielonym przebiegu).
- Zrzuty do 10xChampion: widok pipeline'u z jobem, logi joba, komentarz LLM — z PR-a `pass` i z celowo złego PR-a `fail` + `ai-cr:failed`.

### Key Discoveries:

- `GITHUB_TOKEN` nie uruchamia nowych workflow swoimi zdarzeniami, więc dodawanie etykiet przez workflow nie zapętla recenzji (research, „Szablon workflow vs repo”).
- Pominięty przez `if` job raportuje się jako sukces dla wymaganych checków — dlatego `labeled` nie może trafiać do workflow z jobem `review` (research, Ryzyko 1).
- `gh` 2.102 ma `gh pr comment --edit-last --create-if-none` (sprawdzone lokalnie `gh pr comment --help`).
- Akcje przypięte w szablonach: `actions/checkout` v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`, `actions/setup-node` v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1` (zweryfikowane z tagami).
- Lokalnie brak `actionlint`, jest Docker → lint workflow obrazem `rhysd/actionlint` przypiętym do wersji.

## What We're NOT Doing

- Przypinanie akcji w `ci.yml` do SHA (znana luka względem twardej zasady z CLAUDE.md; osobna zmiana).
- `pull_request_target` / recenzje PR-ów z forków (brak sekretów to oczekiwane zachowanie: komentarz „brak klucza”).
- Wybór modelu na podstawie evali — model to input akcji z domyślnym `z-ai/glm-5.3`; zmiana po zadaniu 3 (promptfoo) to jedna linia.
- Komentarze inline, plan review (`10x-impl-review-ci`), triage, metryki kosztu poza logami.
- Zmiany w kryteriach/prompcie recenzenta (zadanie 2 jest już zrobione).

## Implementation Approach

Trzy warstwy: paczka (logika: recenzja, reguła, render komentarza — testowalna bez sieci), composite action (uruchomienie agenta i wyciągnięcie `verdict` + kodu wyjścia, jedyne miejsce z kluczem API), workflow (zdarzenia GitHuba, diff, komentarz, etykiety, bramka). Re-run etykietą w osobnym workflow ponawia oryginalny przebieg, więc check `review` przelicza się w miejscu. Niezaufany tekst PR przechodzi wyłącznie przez `env` i pliki.

## Critical Implementation Details

- **Kolejność kroków bramki**: komentarz i etykiety wykonują się z `if: always()` przed krokiem bramki; krok akcji nie może failować joba przed nimi — akcja zwraca kod wyjścia CLI jako output (`continue-on-error` na kroku akcji albo zapis `exit-code` zamiast `set -e`), a o czerwonym checku decyduje wyłącznie ostatni krok „Gate on verdict”.
- **Rerun przez `GITHUB_TOKEN`**: zakładamy, że `gh run rerun` z `permissions: actions: write` działa dla przebiegu `pull_request`; niezweryfikowane — sprawdzane w fazie 4. Fallback, jeśli API odmówi: job `rerun` komentuje instrukcję „Re-run jobs” z linkiem do przebiegu i kończy się błędem (bez cichego sukcesu).

## Phase 1: Komentarz z pliku JSON w paczce

### Overview

Punkt wejścia, który z pliku z recenzją (albo z przyczyną braku werdyktu) produkuje Markdown komentarza — żeby workflow nie składał komentarza inline w `node -e`.

### Changes Required:

#### 1. Skrypt komentarza

**File**: `packages/code-reviewer/src/comment-cli.ts` (nowy), `packages/code-reviewer/package.json`

**Intent**: CLI `npm run comment` wypisuje na stdout Markdown komentarza: z pliku review JSON (walidowanego `REVIEW_SCHEMA`) przez `renderComment`, albo komunikat bez werdyktu dla podanej przyczyny.

**Contract**: `npm run comment --silent --prefix packages/code-reviewer -- --review <plik.json>` → `renderComment(review)`; `-- --no-verdict <reason>` gdzie `reason ∈ {missing_key, provider_error, limit, invalid_output, empty_diff}` → krótki komentarz (nagłówek `## AI Code Review: ⚠️ brak werdyktu` albo dla `empty_diff` `## AI Code Review: ✅ pass` z adnotacją, że diff zawierał tylko lockfile'e) z jednym zdaniem przyczyny i wskazówką (np. „dodaj sekret OPENROUTER_API_KEY”, „zobacz logi joba”). Nieznany argument/niepoprawny JSON → exit 1, stderr. Każdy komentarz kończy się ukrytym markerem `<!-- ai-cr -->` (identyfikacja komentarza bota).

#### 2. Funkcja renderowania braku werdyktu

**File**: `packages/code-reviewer/src/comment.ts`, `packages/code-reviewer/src/index.ts`

**Intent**: Treść komentarzy bez werdyktu żyje obok `renderComment`, żeby była testowalna i eksportowana.

**Contract**: `renderNoVerdictComment(reason: NoVerdictReason): string`, typ `NoVerdictReason` eksportowany z `src/index.ts`; `renderComment` dodaje marker `<!-- ai-cr -->`.

#### 3. Testy i dokumentacja

**File**: `packages/code-reviewer/tests/comment-cli.test.ts` (nowy), `CLAUDE.md`

**Intent**: Testy CLI komentarza (plik review → tabela; każdy `--no-verdict` reason → właściwy nagłówek; zły JSON → exit 1, pusty stdout). CLAUDE.md: jedno zdanie o `npm run comment` w opisie recenzenta.

**Contract**: wzorzec jak `tests/cli.test.ts` (uruchomienie przez `tests/helpers/run-cli.ts`, asercje osobno na exit code, stdout, stderr).

### Success Criteria:

#### Automated Verification:

- Testy paczki przechodzą: `npm test --prefix packages/code-reviewer`
- Typecheck paczki przechodzi: `npm run typecheck --prefix packages/code-reviewer`
- Lint repo przechodzi: `npm run lint`

#### Manual Verification:

- `npm run comment` na `scratchpad/sample-review.json` daje czytelną tabelę 6 kryteriów w podglądzie Markdown

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznej weryfikacji.

---

## Phase 2: Composite action + workflow `review.yml`

### Overview

Lokalna akcja `.github/actions/ai-reviewer` i workflow `AI Code Review` na podstawie szablonów kursu, zaadaptowane do repo i decyzji użytkownika.

### Changes Required:

#### 1. Composite action

**File**: `.github/actions/ai-reviewer/action.yml` (nowy; źródło: `m5l3-action.yml.template`)

**Intent**: Instaluje paczkę recenzenta i uruchamia CLI na pliku z diffem; nie failuje joba, tylko zwraca wynik, żeby workflow mógł skomentować także brak werdyktu.

**Contract**: inputs `api-key` (required), `pr-title` (required), `pr-body` (default ""), `diff-file` (required), `model` (default `z-ai/glm-5.3`); outputs `verdict` (`pass`|`fail`|""), `review-file`, `exit-code`, `reason` (pusty albo `NoVerdictReason`). Kroki: `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0` (Node 24, cache npm na lockfile paczki), `npm ci --prefix "$GITHUB_WORKSPACE/packages/code-reviewer"`, uruchomienie `npm run review --silent --prefix … -- "$DIFF_FILE"` ze stdout do `$RUNNER_TEMP/ai-review.json` i stderr widocznym w logach. Env: `OPENROUTER_API_KEY`, `PR_TITLE`, `PR_BODY`, `REVIEW_MODEL` (niezaufany tekst tylko przez env). Mapowanie wyniku: exit 0 + `verdict ∈ {pass, fail}` → `verdict`; exit 0 bez poprawnego `verdict` → `reason=invalid_output`; exit 2 → `limit`; exit 1 przy pustym kluczu → `missing_key` (wykrywane przed uruchomieniem, bez wywołania CLI); inny exit → `provider_error`.

#### 2. Workflow recenzji

**File**: `.github/workflows/review.yml` (nowy; źródło: `m5l3-review.yml.template`)

**Intent**: Recenzja każdego PR do `main` z jednym edytowanym komentarzem, etykietami i bramką na `verdict`.

**Contract**:
- `name: AI Code Review`; `on.pull_request.branches: [main]`, `types: [opened, synchronize, reopened]` (bez `labeled`).
- `permissions`: `contents: read`, `pull-requests: write`, `issues: write`.
- job `review` (nazwa joba = nazwa wymaganego checka), `concurrency` na poziomie joba: grupa `ai-review-${{ github.event.pull_request.number }}`, `cancel-in-progress: true`.
- checkout `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` z `fetch-depth: 0`.
- diff: `git diff "origin/$BASE_REF...HEAD" -- . ':(exclude)package-lock.json' ':(exclude)**/package-lock.json' > "$RUNNER_TEMP/pr.diff"`; output `empty=true`, gdy plik jest pusty (po `trim`).
- akcja `./.github/actions/ai-reviewer` tylko gdy `empty != 'true'`; `api-key: ${{ secrets.OPENROUTER_API_KEY }}`, tytuł/opis z `github.event.pull_request`.
- krok „Comment and label” (`if: always()`): komentarz z `npm run comment` (`--review` przy werdykcie, `--no-verdict empty_diff` przy pustym diffie, `--no-verdict <reason>` przy braku werdyktu) przez `gh pr comment "$PR" --edit-last --create-if-none --body-file …`; `gh label create ai-cr:passed --color 0E8A16 --force` i `ai-cr:failed --color B60205 --force`; przy werdykcie (lub pustym diffie = pass) dodaj właściwą i zdejmij przeciwną etykietę; przy braku werdyktu zdejmij obie.
- krok „Gate on verdict”: sukces wyłącznie dla `verdict == pass` albo pustego diffa; w każdym innym przypadku `exit 1` z komunikatem `AI review verdict: <verdict|reason>`.
- Wszystkie wartości z `github.event.*` w krokach `run` wyłącznie przez `env`.

### Success Criteria:

#### Automated Verification:

- actionlint bez błędów dla nowych plików: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -color` (wersja obrazu sprawdzona przy implementacji)
- Żadne `${{ github.event.* }}` nie występuje wewnątrz bloku `run:` w `review.yml` i `action.yml` (grep)
- Każde `uses:` zewnętrznej akcji ma pełne SHA i komentarz z tagiem (grep)
- Lokalna symulacja kroku diffa na tej gałęzi daje diff bez `package-lock.json`: `git diff origin/main...HEAD -- . ':(exclude)package-lock.json' ':(exclude)**/package-lock.json' | grep -c '^diff --git a/.*package-lock.json'` → 0

#### Manual Verification:

- Przegląd `review.yml`/`action.yml` z użytkownikiem względem szablonów i decyzji (różnice wyjaśnione)

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznej weryfikacji.

---

## Phase 3: Workflow `review-rerun.yml`

### Overview

Ponowna recenzja na żądanie etykietą `ai-cr:review`, bez tworzenia pominiętych checków `review`.

### Changes Required:

#### 1. Workflow rerun

**File**: `.github/workflows/review-rerun.yml` (nowy)

**Intent**: Dodanie etykiety `ai-cr:review` ponawia ostatni przebieg `AI Code Review` dla head SHA PR-a, a następnie zdejmuje etykietę.

**Contract**: `name: AI Code Review (rerun)`; `on.pull_request.types: [labeled]`, `branches: [main]`; `permissions`: `actions: write`, `pull-requests: write`, `issues: write`; job `rerun` z `if: github.event.label.name == 'ai-cr:review'`. Kroki: znajdź `databaseId` ostatniego przebiegu `gh run list --workflow review.yml --commit "$HEAD_SHA" --event pull_request --limit 1`; brak przebiegu → komentarz z wyjaśnieniem + `exit 1`; jest → `gh run rerun <id>` (przy przebiegu w toku najpierw `gh run cancel` i oczekiwanie na zakończenie, albo komunikat, że recenzja już trwa); zawsze `gh pr edit "$PR" --remove-label ai-cr:review`. Fallback, gdy `rerun` zwróci błąd uprawnień: komentarz z linkiem do przebiegu i instrukcją „Re-run jobs”, `exit 1`. Bez checkout repo (niepotrzebny).

### Success Criteria:

#### Automated Verification:

- actionlint bez błędów dla `review-rerun.yml` (to samo polecenie co w fazie 2)
- Job w `review-rerun.yml` nie nazywa się `review` (grep)

#### Manual Verification:

- Przegląd z użytkownikiem: inne etykiety tworzą tylko pominięty `rerun`, nie `review`

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznej weryfikacji.

---

## Phase 4: Uruchomienie na GitHubie i dowód

### Overview

Pierwsze żywe przebiegi, zrzuty do 10xChampion i włączenie bramki merge. Każdy krok wychodzący na zewnątrz (sekret, push, PR, ustawienia repo, płatne przebiegi) — po potwierdzeniu z użytkownikiem.

### Changes Required:

#### 1. Sekret i PR tej zmiany

**File**: (GitHub) sekret Actions `OPENROUTER_API_KEY`; PR z gałęzi `feat/m5l3-ci-code-review`

**Intent**: Użytkownik dodaje sekret (np. `gh secret set OPENROUTER_API_KEY` — wartość wpisuje sam, osobny klucz z limitem wydatków); commit + push + PR tej zmiany (bez `lessons/`) uruchamia pierwszą recenzję — oczekiwany `pass` albo uzasadniony `fail`.

**Contract**: PR opisuje cel i odwołuje się do `context/changes/ci-cd-code-review/` (kryterium 5).

#### 2. Celowo zły PR

**File**: gałąź `demo/ai-cr-fail` z małym endpointem biorącym `user_id` z body (łamie kryterium 2)

**Intent**: Dowód ścieżki `fail`: czerwony check, `ai-cr:failed`, komentarz wskazujący plik/linię. PR zamykany bez merge po zrzutach.

**Contract**: zmiana pod `src/pages/api/` bez testów; nie trafia na `main`.

#### 3. Rerun i bramka

**File**: (GitHub) etykieta `ai-cr:review`; ochrona gałęzi `main`

**Intent**: Sprawdzenie re-runu etykietą (założenie o `GITHUB_TOKEN`); po pierwszym zielonym `review` ustawienie go jako wymaganego checka na `main` (po potwierdzeniu, `gh api` na branch protection).

### Success Criteria:

#### Automated Verification:

- Przebieg `review` na PR tej zmiany kończy się werdyktem (`gh run view --json conclusion`) i na PR jest dokładnie jeden komentarz z markerem `<!-- ai-cr -->` po co najmniej dwóch pushach (`gh api …/comments`)
- Przebieg `review` na PR `demo/ai-cr-fail` ma `conclusion: failure`, a PR ma etykietę `ai-cr:failed` (`gh pr view --json labels`)
- `gh api repos/{owner}/{repo}/branches/main/protection` wymienia check `review`

#### Manual Verification:

- Komentarz LLM na obu PR-ach pokazuje 6 kryteriów z oceną i uzasadnieniem; w złym PR wskazany plik/linia z `user_id`
- Dodanie `ai-cr:review` ponawia `review` dla tego samego SHA i zdejmuje etykietę; dodanie innej etykiety nie zmienia checka `review`
- Zrzuty: widok pipeline'u z jobem, logi joba, komentarz LLM — z PR-a `pass` i z PR-a `fail`

**Implementation Note**: Po fazie zatrzymaj się na potwierdzenie ręcznej weryfikacji.

---

## Testing Strategy

### Unit Tests:

- `renderNoVerdictComment` dla każdego `NoVerdictReason`; marker `<!-- ai-cr -->` w obu rodzajach komentarza.
- CLI komentarza: kody wyjścia i rozdzielenie stdout/stderr (wzorzec `tests/cli.test.ts`).

### Integration Tests:

- Brak lokalnych testów workflow (GHA); weryfikacja przez actionlint, grepy kontraktów i żywe przebiegi w fazie 4.

### Manual Testing Steps:

1. PR tej zmiany: komentarz, etykieta, check; drugi push edytuje ten sam komentarz.
2. PR `demo/ai-cr-fail`: `fail`, `ai-cr:failed`, czerwony check.
3. Etykieta `ai-cr:review` na jednym z PR-ów: rerun i zdjęcie etykiety; inna etykieta nie rusza checka `review`.

## Performance Considerations

Koszt przebiegu ~$0.006–0.016 przy `z-ai/glm-5.3` (pomiary M5L2/M5L3); limit $0.10 i 200 000 znaków diffa z paczki obowiązują w CI bez zmian. Wykluczenie lockfile'i obniża rozmiar diffa przy zmianach zależności.

## Migration Notes

Nie dotyczy (nowe pliki; `ci.yml` bez zmian). Wycofanie: usunięcie wymaganego checka z ochrony `main` i plików workflow.

## References

- Wymagania: `context/changes/ci-cd-code-review/requirements.md`
- Research: `context/changes/ci-cd-code-review/research.md`
- Szablony: `.claude/config-templates/m5l3-review.yml.template`, `.claude/config-templates/m5l3-action.yml.template`
- CLI recenzenta: `packages/code-reviewer/src/cli.ts:24-89`, komentarz `packages/code-reviewer/src/comment.ts`, reguła `packages/code-reviewer/src/verdict.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Komentarz z pliku JSON w paczce

#### Automated

- [x] 1.1 Testy paczki przechodzą: `npm test --prefix packages/code-reviewer` — 99d7344
- [x] 1.2 Typecheck paczki przechodzi: `npm run typecheck --prefix packages/code-reviewer` — 99d7344
- [x] 1.3 Lint repo przechodzi: `npm run lint` — 99d7344

#### Manual

- [x] 1.4 `npm run comment` na `scratchpad/sample-review.json` daje czytelną tabelę 6 kryteriów w podglądzie Markdown — 99d7344

### Phase 2: Composite action + workflow `review.yml`

#### Automated

- [x] 2.1 actionlint bez błędów dla nowych plików — 2a29830
- [x] 2.2 Żadne `${{ github.event.* }}` nie występuje wewnątrz bloku `run:` w `review.yml` i `action.yml` — 2a29830
- [x] 2.3 Każde `uses:` zewnętrznej akcji ma pełne SHA i komentarz z tagiem — 2a29830
- [x] 2.4 Lokalna symulacja kroku diffa na tej gałęzi daje diff bez `package-lock.json` — 2a29830

#### Manual

- [x] 2.5 Przegląd `review.yml`/`action.yml` z użytkownikiem względem szablonów i decyzji — 2a29830

### Phase 3: Workflow `review-rerun.yml`

#### Automated

- [x] 3.1 actionlint bez błędów dla `review-rerun.yml`
- [x] 3.2 Job w `review-rerun.yml` nie nazywa się `review`

#### Manual

- [x] 3.3 Przegląd z użytkownikiem: inne etykiety tworzą tylko pominięty `rerun`, nie `review`

### Phase 4: Uruchomienie na GitHubie i dowód

#### Automated

- [ ] 4.1 Przebieg `review` na PR tej zmiany kończy się werdyktem i na PR jest dokładnie jeden komentarz z markerem po co najmniej dwóch pushach
- [ ] 4.2 Przebieg `review` na PR `demo/ai-cr-fail` ma `conclusion: failure`, a PR ma etykietę `ai-cr:failed`
- [ ] 4.3 Ochrona `main` wymienia check `review`

#### Manual

- [ ] 4.4 Komentarz LLM na obu PR-ach pokazuje 6 kryteriów z oceną i uzasadnieniem; w złym PR wskazany plik/linia z `user_id`
- [ ] 4.5 Dodanie `ai-cr:review` ponawia `review` dla tego samego SHA i zdejmuje etykietę; inna etykieta nie zmienia checka `review`
- [ ] 4.6 Zrzuty: widok pipeline'u z jobem, logi joba, komentarz LLM — z PR-a `pass` i z PR-a `fail`
