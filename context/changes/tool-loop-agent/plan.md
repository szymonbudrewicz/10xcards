# Modułowy recenzent ToolLoopAgent z limitem kosztu — plan implementacji

## Overview

Rozbijamy jednoplikowego recenzenta `packages/code-reviewer/src/index.ts` na moduły wielokrotnego użytku (kontrakt, prompty, koszt, agent, CLI), tak by przyszły provider promptfoo (M5L3) mógł zaimportować recenzenta bez efektów ubocznych. Dokładamy twardy limit kosztu na przebieg (wymóg CLAUDE.md „Śledź koszt każdego uruchomienia”) i testy bez sieci, uruchamiane w CI.

## Current State Analysis

- `packages/code-reviewer/src/index.ts` robi wszystko naraz na najwyższym poziomie modułu: ładuje `.env` pakietu (dotenv), czyta diff (argument → stdin → `data/sample.diff`), buduje `ToolLoopAgent` (OpenRouter, `tools: {}`, `isStepCount(2)`, `Output.object`), sumuje koszt po krokach, pisze JSON na stdout i linię `[usage]` na stderr. Import tego pliku = uruchomienie recenzji, więc nie da się go użyć jako biblioteki.
- `src/review-schema.ts` (kopia szablonu `m5l2-review-schema.ts.template`) trzyma razem schemat zod, `REVIEW_JSON_SCHEMA`, typ `Review` **i** `SYSTEM_PROMPT`.
- Kody wyjścia dziś: 0 sukces, 1 brak `OPENROUTER_API_KEY`, każdy inny błąd → nieobsłużone odrzucenie (Node: exit 1).
- Brak limitu kosztu: jedyny sufit to `isStepCount(2)` i limit wydatków na kluczu OpenRouter.
- Brak testów pakietu. Główny Vitest zbiera tylko `tests/**/*.test.ts`; główny `tsconfig.json` wyklucza `packages`. CI (`.github/workflows/ci.yml`) już robi `npm ci` i `typecheck` z `--prefix packages/code-reviewer`.
- Pierwszy płatny przebieg na `data/sample.diff`: 1 krok, 481 in / 6926 out tokenów, $0.013873, werdykt `fail`.

## Desired End State

- `src/index.ts` eksportuje publiczne API (`createReviewer`, `runReview`, `createOpenRouterModel`, schemat i typy, błędy limitów) i nie ma efektów ubocznych przy imporcie.
- `src/cli.ts` jest jedynym miejscem, które czyta env/`.env`, stdin, i pisze na stdout/stderr; skrypt `review` wskazuje na nie.
- Przebieg nie może przekroczyć budżetu bez sygnału: za duży diff jest odrzucany przed wywołaniem modelu, wyjście modelu ma sufit tokenów, pętla zatrzymuje się po przekroczeniu budżetu, a przekroczenie kończy CLI kodem 2 bez JSON na stdout.
- Testy charakteryzujące CLI (napisane na starym `index.ts`) przechodzą bez zmian po refaktorze; testy jednostkowe limitów działają na `MockLanguageModelV4`; wszystko w CI.

### Key Discoveries:

- `StopCondition` jest sprawdzany dopiero po kroku z wynikami narzędzi (`node_modules/ai/docs/03-agents/04-loop-control.mdx:21`, typ w `node_modules/ai/dist/index.d.ts:3481`). Recenzent bez narzędzi kończy w 1 kroku, więc sam `StopCondition` nie ogranicza dzisiejszego przebiegu — stąd limit diffa i `maxOutputTokens` przed wywołaniem.
- Odczyt `output`, gdy ostatni krok skończył się `tool-calls` (np. zatrzymanie przez warunek), rzuca `NoOutputGeneratedError` (`index.d.ts:5410`, klasa `:8453`).
- `ai/test` eksportuje `MockLanguageModelV4` (`node_modules/ai/dist/test/index.d.ts:135`); `ai/package.json` ma eksport `./test`.
- Koszt kroku: `step.providerMetadata.openrouter.usage.cost`, przy `openrouter(model, { usage: { include: true } })` (`@openrouter/ai-sdk-provider/dist/index.d.ts:527`, `OpenRouterUsageAccounting.cost` `:570`).
- `createOpenRouter` przyjmuje `baseURL` — to szew dla fałszywego serwera w testach CLI.
- `context/foundation/lessons.md`: bramki ocenia się po kodzie wyjścia, nie po treści — dlatego testy CLI asercjonują kod wyjścia, a limit ma własny kod 2.

## What We're NOT Doing

- Konfiguracja promptfoo / ewaluacji (M5L3).
- Bramka CI na werdykcie `fail`, komentarz do PR-a, czytanie `plan.md`/`lessons.md` przez recenzenta (M5L3).
- Narzędzia dla agenta (`tools` zostaje `{}`) i zmiana treści promptu systemowego (przenosimy go bez edycji).
- Zmiana kontraktu: pola, kryteria i wartości werdyktu w `REVIEW_SCHEMA` bez zmian.
- Wczytywanie reguł repo (`CLAUDE.md`) do `instructions`.
- Zmiana domyślnego modelu (`z-ai/glm-5.3`).

## Implementation Approach

Najpierw zamrażamy obecne zachowanie CLI testami czarnej skrzynki (proces potomny + fałszywy serwer OpenRoutera na loopbacku), potem refaktoryzujemy pod tymi testami, a dopiero na koniec dodajemy nowe zachowanie (limity) z własnymi testami jednostkowymi na atrapie modelu. Biblioteka przyjmuje `LanguageModel` z zewnątrz, więc testy i promptfoo mogą podać dowolny model; CLI składa model OpenRoutera z env.

## Critical Implementation Details

- **Izolacja testów od prawdziwego klucza.** CLI ładuje `packages/code-reviewer/.env`, w którym leży prawdziwy klucz. dotenv nie nadpisuje zmiennych już obecnych w `process.env`, więc testy zawsze przekazują procesowi potomnemu jawne `OPENROUTER_API_KEY` (wartość testową albo pusty string w teście „brak klucza”) oraz `OPENROUTER_BASE_URL` na `127.0.0.1`. Żaden test nie może dotrzeć do openrouter.ai.
- **Testy CLI nie mogą znać nazwy pliku wejściowego.** Wywołują polecenie ze skryptu `review` w `package.json` (przez `tsx` z `node_modules`), dzięki czemu przeniesienie wejścia z `src/index.ts` do `src/cli.ts` w fazie 1 nie zmienia testów.
- **Fałszywy serwer musi mówić formatem OpenRouter chat completions** (nie-streaming), z treścią odpowiedzi jako JSON zgodny z `REVIEW_SCHEMA` i polem `usage.cost`. Kształt odpowiedzi zweryfikuj w źródle `@openrouter/ai-sdk-provider` (schemat parsowania odpowiedzi), nie z pamięci.

## Faza 1: Testy charakteryzujące, potem moduły bez zmiany zachowania

### Overview

Vitest w pakiecie, testy CLI na obecnym `index.ts` (zielone), następnie podział na moduły — te same testy przechodzą bez edycji.

### Changes Required:

#### 1. Szew bazowego URL

**File**: `packages/code-reviewer/src/index.ts`

**Intent**: Pozwolić wskazać inny adres API OpenRoutera, żeby testy mogły użyć lokalnego fałszywego serwera. Jedyna zmiana w starym pliku przed testami.

**Contract**: opcjonalna zmienna `OPENROUTER_BASE_URL` przekazywana jako `baseURL` do `createOpenRouter`; brak zmiennej = domyślny adres providera. Dopisana jako komentarz w `.env.example`.

#### 2. Vitest i testy charakteryzujące

**File**: `packages/code-reviewer/package.json`, `packages/code-reviewer/vitest.config.ts`, `packages/code-reviewer/tests/cli.test.ts`, `packages/code-reviewer/tests/helpers/fake-openrouter.ts`

**Intent**: Zamrozić obserwowalne zachowanie CLI zanim cokolwiek przeniesiemy.

**Contract**:
- devDependency `vitest`, skrypt `test` (`vitest run`), `include: ["tests/**/*.test.ts"]`; `tsconfig.json` pakietu obejmuje też `tests/**/*.ts`.
- `fake-openrouter.ts`: serwer HTTP na `127.0.0.1:0`, zapisuje odebrane ciała żądań, odpowiada skonfigurowaną odpowiedzią (poprawna recenzja z `usage.cost` / błąd HTTP).
- Przypadki w `cli.test.ts` (każdy asercjonuje kod wyjścia, stdout i stderr osobno):
  - diff z pliku (argument) → exit 0; stdout to wyłącznie JSON przechodzący `REVIEW_SCHEMA.parse`; stderr zawiera linię `[usage]` z `cost=$`; treść diffa trafiła do żądania.
  - diff ze stdin → jak wyżej.
  - brak stdin i argumentu → stderr informuje o `data/sample.diff`; exit 0.
  - pusty `OPENROUTER_API_KEY` → exit 1, stderr z komunikatem o kluczu, pusty stdout, zero żądań do serwera.
  - serwer zwraca błąd HTTP 500 → kod wyjścia ≠ 0, pusty stdout.

#### 3. Podział na moduły

**File**: `packages/code-reviewer/src/review-schema.ts`, `src/prompts/system.ts`, `src/prompts/review.ts`, `src/cost.ts`, `src/model.ts`, `src/agent.ts`, `src/cli.ts`, `src/index.ts`, `package.json`

**Intent**: Oddzielić kontrakt, prompty, koszt i agenta od I/O, żeby recenzent był biblioteką.

**Contract**:
- `review-schema.ts`: tylko `REVIEW_SCHEMA`, `REVIEW_JSON_SCHEMA`, `type Review` (bez `SYSTEM_PROMPT`); zaktualizuj komentarz nagłówka, który dziś mówi o prompcie.
- `prompts/system.ts`: `SYSTEM_PROMPT` przeniesiony bez zmiany treści. `prompts/review.ts`: `buildReviewPrompt(diff: string): string` (dzisiejszy szablon `Zrecenzuj ten diff:\n\n${diff}`).
- `cost.ts`: `totalCost(steps): number | undefined` (logika z dzisiejszego `index.ts`).
- `model.ts`: `createOpenRouterModel({ apiKey, modelId, baseURL? }): LanguageModel` z włączonym `usage: { include: true }`.
- `agent.ts`: `createReviewer({ model })` → `ToolLoopAgent` (instrukcje, `tools: {}`, `Output.object(REVIEW_SCHEMA)`, `isStepCount(2)`); `runReview(diff, { model }) → Promise<{ review: Review; usage: RunUsage }>`, gdzie `RunUsage = { modelId, steps, inputTokens?, outputTokens?, costUsd? }`. Bez env, bez konsoli.
- `cli.ts`: dzisiejsze I/O (dotenv z `.env` pakietu, odczyt diffa, model z env `REVIEW_MODEL`/`OPENROUTER_API_KEY`/`OPENROUTER_BASE_URL`, linia `[usage]` w tym samym formacie, JSON na stdout). Skrypt `review` → `tsx src/cli.ts`.
- `index.ts`: tylko re-eksporty publicznego API; pole `exports` w `package.json` wskazuje `./src/index.ts`.

### Success Criteria:

#### Automated Verification:

- Testy charakteryzujące przechodzą na starym `index.ts` (przed podziałem): `npm test --prefix packages/code-reviewer`
- Po podziale te same testy przechodzą bez zmian w `tests/`: `npm test --prefix packages/code-reviewer` i `git diff --stat <sha-przed-podziałem> -- packages/code-reviewer/tests` jest pusty
- Typy: `npm run typecheck --prefix packages/code-reviewer`
- Lint: `npx eslint packages/code-reviewer`
- Import `src/index.ts` nie uruchamia recenzji (test: dynamiczny import modułu nie wysyła żądania do fałszywego serwera i nic nie pisze na stdout)

#### Manual Verification:

- Przegląd: `src/agent.ts` i `src/index.ts` nie odwołują się do `process.env`, `process.stdin`, `console`

**Implementation Note**: Commit testów charakteryzujących osobno, przed podziałem — jego SHA jest punktem odniesienia dla kryterium „testy bez zmian”.

---

## Faza 2: Limit kosztu

### Overview

Trzy warstwy limitu i osobny kod wyjścia dla przekroczenia budżetu.

### Changes Required:

#### 1. Limity w bibliotece

**File**: `packages/code-reviewer/src/limits.ts`, `src/cost.ts`, `src/agent.ts`, `src/index.ts`

**Intent**: Ograniczyć koszt pojedynczego przebiegu z góry (warstwy 1–2) i zatrzymać pętlę po przekroczeniu budżetu (warstwa 3, na przyszłe narzędzia).

**Contract**:
- `ReviewLimits = { maxDiffChars: number; maxOutputTokens: number; maxCostUsd: number }`, domyślne `DEFAULT_LIMITS = { 200_000, 16_000, 0.10 }`.
- Błędy: `ReviewLimitError` (bazowy) → `DiffTooLargeError { diffChars, maxDiffChars }`, `BudgetExceededError { costUsd?, maxCostUsd }`; eksportowane z `index.ts`.
- `cost.ts`: `costBudget(maxCostUsd): StopCondition` — `true`, gdy `totalCost(steps) >= maxCostUsd`.
- `runReview(diff, { model, limits? })`:
  1. diff dłuższy niż `maxDiffChars` → `DiffTooLargeError` **bez** wywołania modelu;
  2. agent dostaje `maxOutputTokens` i `stopWhen: [isStepCount(2), costBudget(maxCostUsd)]`;
  3. po przebiegu: `costUsd > maxCostUsd` → `BudgetExceededError` (wynik odrzucony); `NoOutputGeneratedError` przy `costUsd >= maxCostUsd` → `BudgetExceededError`; ten sam błąd przy koszcie poniżej budżetu propaguje się bez zmian.
  4. brak kosztu od providera → wynik zwracany, `usage.costUsd` = `undefined` (CLI ostrzega).

#### 2. CLI

**File**: `packages/code-reviewer/src/cli.ts`, `.env.example`

**Intent**: Konfiguracja limitów z env i rozróżnialny kod wyjścia.

**Contract**:
- Env: `REVIEW_MAX_COST_USD`, `REVIEW_MAX_DIFF_CHARS`, `REVIEW_MAX_OUTPUT_TOKENS`; niepoprawna wartość (nie liczba, ≤ 0) → exit 1 z komunikatem, bez wywołania modelu.
- `ReviewLimitError` → stderr z przyczyną (i kosztem, jeśli znany), pusty stdout, **exit 2**. Brak klucza / błąd providera → exit 1 (bez zmian).
- Brak kosztu od providera → linia `[usage]` z `cost=?` i dodatkowe ostrzeżenie na stderr; exit 0.
- `.env.example`: trzy zmienne z wartościami domyślnymi w komentarzu.

#### 3. Testy limitów

**File**: `packages/code-reviewer/tests/agent.test.ts`, `tests/cli.test.ts`

**Intent**: Udowodnić każdą warstwę bez płacenia.

**Contract**:
- `agent.test.ts` na `MockLanguageModelV4` (`ai/test`), z `providerMetadata.openrouter.usage.cost` w odpowiedzi atrapy:
  - poprawna recenzja → `review` zgodny ze schematem, `usage.costUsd` = suma po krokach;
  - diff o długości `maxDiffChars + 1` → `DiffTooLargeError`, atrapa nie została wywołana; diff o długości dokładnie `maxDiffChars` → przechodzi;
  - `maxOutputTokens` trafia do wywołania modelu (sprawdzone w opcjach odebranych przez atrapę);
  - koszt kroku > budżet → `BudgetExceededError`; koszt = budżet → wynik zwrócony;
  - `costBudget`: zwraca `false` poniżej i `true` od progu; ignoruje kroki bez kosztu.
- `cli.test.ts` — nowe przypadki (istniejące bez zmian): fałszywy serwer zwraca `usage.cost` powyżej `REVIEW_MAX_COST_USD` → exit 2, pusty stdout; diff powyżej `REVIEW_MAX_DIFF_CHARS` → exit 2, zero żądań do serwera; `REVIEW_MAX_COST_USD=abc` → exit 1.

### Success Criteria:

#### Automated Verification:

- Testy pakietu przechodzą: `npm test --prefix packages/code-reviewer`
- Testy charakteryzujące z fazy 1 nadal przechodzą bez zmian istniejących przypadków
- Typy: `npm run typecheck --prefix packages/code-reviewer`
- Lint: `npx eslint packages/code-reviewer`

#### Manual Verification:

- `.env.example` opisuje trzy limity i ich wartości domyślne

---

## Faza 3: CI i weryfikacja

### Overview

Testy pakietu w CI i jeden płatny przebieg na prawdziwym modelu.

### Changes Required:

#### 1. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Uruchamiać testy recenzenta przy każdym PR-ze.

**Contract**: w jobie `ci` krok `npm test --prefix packages/code-reviewer` po istniejącym `npm ci --prefix packages/code-reviewer` (instalacja w katalogu pakietu musi poprzedzać testy; jeśli krok instalacji zostanie przesunięty, testy idą za nim). Testy nie potrzebują sekretów.

#### 2. Dokumentacja użycia

**File**: `CLAUDE.md` (sekcja Commands)

**Intent**: Agent i ludzie wiedzą, jak uruchomić recenzenta i jego testy oraz co znaczą kody wyjścia.

**Contract**: jedna pozycja: `git diff | npm run review --prefix packages/code-reviewer`, `npm test --prefix packages/code-reviewer`, kody 0/1/2, klucz w `packages/code-reviewer/.env`.

### Success Criteria:

#### Automated Verification:

- CI na PR-ze zielone (`ci` i `smoke`): `gh pr checks <nr>`
- Log joba `ci` zawiera krok testów recenzenta z wynikiem pass

#### Manual Verification:

- Płatny przebieg `npm run review --prefix packages/code-reviewer` (bez stdin) na prawdziwym kluczu: exit 0, stdout to sam JSON zgodny ze schematem, stderr z `[usage]` i kosztem poniżej $0.10
- Przebieg z `REVIEW_MAX_COST_USD=0.001`: exit 2, pusty stdout, komunikat o budżecie na stderr

---

## Testing Strategy

### Unit Tests:

- `agent.test.ts` na `MockLanguageModelV4`: sumowanie kosztu, trzy warstwy limitu z przypadkami granicznymi (`maxDiffChars` vs `maxDiffChars + 1`, koszt = budżet vs > budżet), przekazanie `maxOutputTokens`.

### Integration Tests:

- `cli.test.ts`: proces potomny + fałszywy serwer OpenRoutera na `127.0.0.1`; kod wyjścia, stdout i stderr asercjonowane osobno. Żadnego ruchu poza loopback.

### Manual Testing Steps:

1. `npm run review --prefix packages/code-reviewer` → JSON + `[usage]` z kosztem.
2. `REVIEW_MAX_COST_USD=0.001` → exit 2.
3. `git diff | npm run review --prefix packages/code-reviewer` na prawdziwej zmianie → JSON.

## Performance Considerations

Testy CLI uruchamiają `tsx` w procesie potomnym (~1 s na przypadek); przy ~8 przypadkach to kilka sekund w CI.

## Migration Notes

Wejście CLI zmienia się z `src/index.ts` na `src/cli.ts`; `npm run review` działa jak wcześniej. Bezpośrednie `npx tsx packages/code-reviewer/src/index.ts` przestaje uruchamiać recenzję (teraz to moduł biblioteki) — nikt poza dokumentacją tej zmiany tego nie używa.

## References

- Lekcja: `.claude/prompts/m5l2-agent.md` (krok „Plan”)
- Kod: `packages/code-reviewer/src/index.ts`, `packages/code-reviewer/src/review-schema.ts`
- AI SDK: `packages/code-reviewer/node_modules/ai/docs/03-agents/04-loop-control.mdx`, `.claude/skills/ai-sdk/SKILL.md`
- Reguły: `context/foundation/lessons.md` (bramki po kodzie wyjścia)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Testy charakteryzujące, potem moduły bez zmiany zachowania

#### Automated

- [x] 1.1 Testy charakteryzujące przechodzą na starym index.ts — c968ca6
- [x] 1.2 Po podziale te same testy przechodzą bez zmian w tests/ — d09e2bc
- [x] 1.3 Typy pakietu przechodzą — d09e2bc
- [x] 1.4 Lint pakietu przechodzi — d09e2bc
- [x] 1.5 Import src/index.ts nie uruchamia recenzji — d09e2bc

#### Manual

- [x] 1.6 agent.ts i index.ts bez process.env, stdin i console — d09e2bc

### Phase 2: Limit kosztu

#### Automated

- [x] 2.1 Testy pakietu przechodzą — b55bd40
- [x] 2.2 Testy charakteryzujące z fazy 1 nadal przechodzą — b55bd40
- [x] 2.3 Typy pakietu przechodzą — b55bd40
- [x] 2.4 Lint pakietu przechodzi — b55bd40

#### Manual

- [x] 2.5 .env.example opisuje trzy limity — b55bd40

### Phase 3: CI i weryfikacja

#### Automated

- [ ] 3.1 CI na PR-ze zielone
- [ ] 3.2 Log joba ci zawiera testy recenzenta

#### Manual

- [x] 3.3 Płatny przebieg na sample.diff: exit 0, JSON, koszt poniżej $0.10
- [x] 3.4 Przebieg z REVIEW_MAX_COST_USD=0.001 kończy się exit 2
