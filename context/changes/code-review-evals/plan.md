# Evale recenzenta AI w promptfoo — plan implementacji

## Overview

Zestaw evali promptfoo w `packages/code-reviewer/evals/` uruchamia pełnego agenta (`runReview`) na czterech stałych diffach i porównuje cztery kolumny: `z-ai/glm-5.3` z limitem rozumowania 8000, `z-ai/glm-5.3` bez osobnego limitu, `deepseek/deepseek-v4.1-flash` i `openai/gpt-6-luna` (wszystkie przez OpenRouter), z graderem `anthropic/claude-sonnet-5.5`. Wynik (pass/fail, koszt, czas) służy do decyzji o modelu i limicie rozumowania, a zestaw zostaje bramką regresji (`npm run eval`) przed zmianami promptu i modelu. Na końcu, sprawdzone tym zestawem, skracamy uzasadnienia w komentarzu PR. Źródła: `context/changes/code-review-evals/research.md`, lekcja M5L3 („Testowanie zmian w agentach z promptfoo”, zadanie 3), `.claude/prompts/m5l3-promptfoo.md`, `.claude/config-templates/m5l3-promptfooconfig.yaml.template`.

## Current State Analysis

- `runReview(input, { model, limits })` (`packages/code-reviewer/src/agent.ts`) — biblioteka bez efektów ubocznych przy imporcie (`tests/library.test.ts`), zwraca `{ review, modelVerdict, usage }`; `RunUsage` ma `modelId, steps, inputTokens, outputTokens, costUsd`, ale nie ma dostawcy OpenRouter ani tokenów rozumowania.
- `maxReasoningTokens` (domyślnie 8000, `src/limits.ts`) jest zawsze wysyłany jako `providerOptions.openrouter.reasoning.max_tokens` (`src/agent.ts`); nie da się wyłączyć osobnego limitu rozumowania.
- Provider OpenRouter zwraca nazwę dostawcy w `providerMetadata.openrouter.provider` (`node_modules/@openrouter/ai-sdk-provider/dist/index.js:4520`).
- Vitest obejmuje tylko `tests/**/*.test.ts` (`vitest.config.ts`); `tsconfig.json` paczki obejmuje `src/**`, `tests/**`, `vitest.config.ts`; root ESLint lintuje `packages/`.
- Brak promptfoo w paczce; promptfoo 0.126.0 wymaga Node `>=22.22.0` (lokalnie 24.21).
- Werdykt bramki CI pochodzi z reguły (`src/verdict.ts`: oś twarda ≤ 4 lub dowolna ≤ 3 → fail); `modelVerdict` to werdykt samego modelu.
- Obserwacje z CI (`context/changes/ci-cd-code-review/plan.md`, notka fazy 4): `glm-5.3` raz zużył 16 000 tokenów wyjścia na rozumowanie; koszt podobnego wejścia wahał się $0.007–0.047; na PR #30 (`user_id` z body) `accountIsolation` = 4/10, dokładnie próg reguły.

## Desired End State

- `npm run eval --prefix packages/code-reviewer` uruchamia promptfoo na 4 przypadkach × 4 kolumny i kończy się kodem 0 albo 100 (niezaliczony test); `npm test` nadal nie woła sieci.
- Macierz wyników (pass/fail, koszt, czas, dostawca, tokeny rozumowania) dla przebiegu ×1 i ×3 zapisana w `context/changes/code-review-evals/results.md`.
- Podjęta i wdrożona decyzja o domyślnym modelu recenzenta i limicie rozumowania (CLI + akcja CI), potwierdzona przebiegiem evala.
- Uzasadnienia w komentarzu PR są krótkie (jedno zdanie, egzekwowane asercją), a zestaw evali przechodzi po tej zmianie.
- CLAUDE.md opisuje `npm run eval` jako bramkę przed zmianą promptu lub modelu.

### Key Discoveries:

- Lekcja: providerem w repozytorium przykładów jest własny `file://./reviewProvider.ts`, który uruchamia całego agenta — goły `openrouter:` pomija schemat, regułę werdyktu i limity.
- promptfoo: custom provider `.ts` przez `file://`, `export default class … { id(); callApi(prompt, context) }`, `context.vars`; ten sam plik wielokrotnie z różnym `config`/`label`; `ProviderResponse { output, tokenUsage, cost, error, metadata }`; exit 100 przy niezaliczonym teście; `PROMPTFOO_DISABLE_TEMPLATING=true` dla diffów z `{{ }}` (research, sekcja Summary).
- Niepotwierdzone (research, Open Questions 1–2): czy promptfoo samo mierzy czas custom providera; czy grader `openrouter:` działa bez dodatkowej konfiguracji; dodatkowo — czy asercja `javascript` widzi `metadata` odpowiedzi providera.

## What We're NOT Doing

- Eval w CI (koszt, sekret) — bramka jest ręczna, przed zmianą promptu lub modelu.
- Przypinanie dostawcy OpenRouter — tylko raportowanie dostawcy w metadanych (decyzja użytkownika).
- Diff z migracją React 16 → 19 z szablonu kursu — generyczny wobec kryteriów 10xCards.
- Goły provider `openrouter:` z kopią promptu w `prompts/review.txt`.
- Zmiany reguły werdyktu, osi kryteriów ani progów w `src/verdict.ts`.
- Zadanie 4 lekcji (narzędzia agenta).

## Implementation Approach

Najpierw biblioteka dostaje dwie brakujące informacje o przebiegu (dostawca, tokeny rozumowania) i tryb „bez osobnego limitu rozumowania” — bez zmiany domyślnego zachowania CLI i CI. Potem zestaw evali powstaje i jest weryfikowany offline (test adaptera na fałszywym OpenRouterze, walidacja configu). Płatne przebiegi zaczynają się od taniego smoke testu (1 przypadek × 1 model), który rozstrzyga trzy niepotwierdzone założenia, a dopiero potem pełna macierz ×1 i ×3. Zmiany promptu wchodzą wyłącznie po zielonym zestawie i są nim ponownie sprawdzane.

## Critical Implementation Details

- **Sekret**: `reviewProvider.ts` wczytuje `packages/code-reviewer/.env` (jak `src/cli.ts`), nigdy `.dev.vars` ani root `.env`; grader promptfoo czyta ten sam `OPENROUTER_API_KEY` z env procesu — skrypt `npm run eval` musi go dostarczyć bez wypisywania (np. `dotenv` wczytany w providerze nie wystarcza graderowi, jeśli promptfoo tworzy go wcześniej — zweryfikować w smoke teście fazy 3; fallback: skrypt uruchamia promptfoo przez `node --env-file=.env`).
- **Kolejność płatnych przebiegów**: smoke (1 przypadek × `deepseek-v4.1-flash`, ~$0.01) przed pełną macierzą; każdy płatny przebieg po potwierdzeniu z użytkownikiem i z szacunkiem kosztu.

## Phase 1: Diagnostyka przebiegu w bibliotece

### Overview

`RunUsage` raportuje dostawcę OpenRouter i tokeny rozumowania; `maxReasoningTokens: null` wyłącza osobny limit rozumowania. Domyślne zachowanie (8000) bez zmian.

### Changes Required:

#### 1. Limity i agent

**File**: `packages/code-reviewer/src/limits.ts`, `packages/code-reviewer/src/agent.ts`

**Intent**: Umożliwić kolumnę „bez limitu rozumowania” w evalu i dać evalom oraz CI informację, który dostawca obsłużył wywołanie i ile tokenów poszło na rozumowanie.

**Contract**: `ReviewLimits.maxReasoningTokens: number | null` (`null` → brak `providerOptions.openrouter.reasoning`; domyślnie 8000). `RunUsage` dostaje `provider?: string` (z `providerMetadata.openrouter.provider` ostatniego kroku; pusty string → `undefined`) i `reasoningTokens?: number` (z usage AI SDK). Uzupełniane także w `usage` błędów `OutputTokenLimitError`/`NoReviewOutputError`, gdy dane są dostępne.

#### 2. CLI

**File**: `packages/code-reviewer/src/cli.ts`, `packages/code-reviewer/.env.example`

**Intent**: `[usage]` pokazuje `provider=` i `reasoning=`, żeby logi CI tłumaczyły rozrzut kosztu; `REVIEW_MAX_REASONING_TOKENS=0` oznacza brak osobnego limitu (walidacja „mniejszy niż limit wyjścia” dotyczy tylko wartości > 0).

**Contract**: format `[usage] model=… provider=… steps=… in=… out=… reasoning=… cost=…` (nieznane pola jako `?`).

#### 3. Testy

**File**: `packages/code-reviewer/tests/agent.test.ts`, `packages/code-reviewer/tests/cli.test.ts`, `packages/code-reviewer/tests/helpers/fake-openrouter.ts`

**Intent**: Testy bez sieci: `maxReasoningTokens: null` nie wysyła `reasoning`; `provider` i `reasoningTokens` trafiają do `usage` i do `[usage]`; `REVIEW_MAX_REASONING_TOKENS=0` akceptowane i bez `reasoning` w żądaniu.

**Contract**: fałszywy OpenRouter zwraca pole `provider` i `completion_tokens_details.reasoning_tokens`.

### Success Criteria:

#### Automated Verification:

- Testy paczki przechodzą: `npm test --prefix packages/code-reviewer`
- Typecheck paczki przechodzi: `npm run typecheck --prefix packages/code-reviewer`
- Lint repo przechodzi: `npm run lint`

#### Manual Verification:

- Przegląd z użytkownikiem: domyślne zachowanie CLI/CI bez zmian (8000), nowy format `[usage]`

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznej weryfikacji.

---

## Phase 2: Zestaw evali offline

### Overview

promptfoo, provider-adapter, fixtures, config z asercjami i skrypt `npm run eval` — zweryfikowane bez płatnych wywołań.

> Zmiany przy przeglądzie 2.5 (2026-11-19, decyzja użytkownika): wszystkie przypadki mają `title` i `body` w `vars`; próg ≤ 3 dla wszystkich trzech przypadków fail (`accountIsolation` dla user-id i service-role, `privacySecretsAiCost` dla pasted-text); piąty przypadek pass `clean-ui-empty-state.diff` (role tokenów, `cn()`, `Card`/`Button` z `src/components/ui/`). Macierz ma więc 5 przypadków × 4 kolumny: kryteria 3.2 i 4.1 oznaczają odpowiednio 20 i 60 komórek (zamiast 16 i 48). Adaptacje: asercja zgodności `modelVerdict` z regułą dodana już w tej fazie (dostęp do `metadata` potwierdzony offline); `tsx` przeniesiony do `dependencies`, a akcja i `review.yml` instalują paczkę z `--omit=dev` (promptfoo nie trafia do joba recenzji).

### Changes Required:

#### 1. Zależność i skrypty

**File**: `packages/code-reviewer/package.json`, `packages/code-reviewer/package-lock.json`, `packages/code-reviewer/tsconfig.json`

**Intent**: promptfoo jako devDependency (wersja przypięta dokładnie, 0.126.0 lub aktualna przy implementacji); skrypt `eval` z `PROMPTFOO_DISABLE_TEMPLATING=true promptfoo eval -c evals/promptfooconfig.yaml --no-cache` (przekazujący kod wyjścia, działający na Windows i Linux); `evals/**/*.ts` w `include` tsconfig.

**Contract**: `npm run eval` → exit 0 (wszystko zaliczone), 100 (niezaliczony test), 1 (błąd); dodatkowe argumenty przekazywane do promptfoo (`-- --repeat 3`, `--filter-providers`, `--filter-pattern`).

#### 2. Provider-adapter

**File**: `packages/code-reviewer/evals/reviewProvider.ts`

**Intent**: Cienki adapter `context.vars → runReview → ProviderResponse`, żeby eval testował dokładnie ścieżkę CI (prompt, schemat, reguła werdyktu, limity).

**Contract**: `export default class` z `constructor(options)` czytającym `options.config.model` (wymagany) i `options.config.maxReasoningTokens` (`number | null`, domyślnie limit biblioteki); `id()` zwraca `review:<model>`; `callApi(_prompt, context)` czyta `context.vars.diff` (+ opcjonalne `title`, `body`), wczytuje `.env` paczki, woła `runReview` i zwraca `{ output: review, tokenUsage: { total, prompt, completion }, cost: usage.costUsd, metadata: { modelVerdict, provider, reasoningTokens, latencyMs, costUsd } }`; błędy biblioteki → `{ error: "<NazwaKlasy>: <message>" }` (bez treści diffa i bez klucza). Czas mierzony w adapterze (`latencyMs`).

#### 3. Fixtures

**File**: `packages/code-reviewer/evals/fixtures/*.diff`

**Intent**: Cztery stałe diffy w formacie `git diff`, oparte na realnym kodzie repo.

**Contract**:
- `user-id-from-body.diff` — diff z PR #30 (`src/pages/api/cards/by-user.ts`, `user_id` z body, `console.log(body)`, brak testu).
- `clean-small.diff` — mała, zgodna z konwencjami zmiana w `src/lib/` z testem w `tests/` (oczekiwany pass).
- `pasted-text-logging.diff` — `src/pages/api/generate.ts` loguje wklejony tekst (`console.log` treści wejściowej); reszta poprawna.
- `service-role-bulk-delete.diff` — kopia `packages/code-reviewer/data/sample.diff`.

#### 4. Config promptfoo

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml`, `packages/code-reviewer/evals/review.schema.json`

**Intent**: Ta sama macierz co w szablonie kursu, ale z providerem-agentem, czterema kolumnami i asercjami wg kryteriów 10xCards.

**Contract**:
- `providers`: `file://reviewProvider.ts` ×4 z `label`: `glm-5.3@8000` (`model: z-ai/glm-5.3`), `glm-5.3@no-cap` (`maxReasoningTokens: null`), `deepseek-v4.1-flash`, `gpt-6-luna`.
- `prompts`: jeden prompt-placeholder `{{diff}}` (provider ignoruje prompt, czyta `vars`).
- `defaultTest.options.provider: openrouter:anthropic/claude-sonnet-5.5`; `defaultTest.assert`: `is-json` z `value: file://review.schema.json`; `javascript`: każda ocena w skali 1–10; `llm-rubric`: każde uzasadnienie z oceną < 7 wskazuje konkretny plik lub linię z diffa, a nie ogólnik.
- Asercje `javascript` przyjmują `output` jako obiekt albo string (`typeof output === "string" ? JSON.parse(output) : output`).
- `tests`: `user-id-from-body` → `verdict === "fail" && accountIsolation.score <= 3` + `llm-rubric`: recenzja wskazuje `user_id` z body / brak sprawdzenia sesji; `clean-small` → `verdict === "pass"`; `pasted-text-logging` → `verdict === "fail" && privacySecretsAiCost.score <= 4` + `llm-rubric`: wskazuje logowanie wklejonego tekstu; `service-role-bulk-delete` → `verdict === "fail" && accountIsolation.score <= 4`.
- Asercja zgodności modelu z regułą (`metadata.modelVerdict === output.verdict`) — sposób dostępu do `metadata` w asercji potwierdzany w smoke teście fazy 3; do tego czasu poza configiem.
- `review.schema.json` = `REVIEW_JSON_SCHEMA` zapisany do pliku; test pilnuje, że plik nie rozjeżdża się ze schematem.

#### 5. Test adaptera i schematu (bez sieci)

**File**: `packages/code-reviewer/tests/eval-provider.test.ts`

**Intent**: `npm test` (i CI) pilnuje kontraktu adaptera bez promptfoo i bez sieci: fałszywy OpenRouter (`OPENROUTER_BASE_URL`), wywołanie `callApi` z `vars.diff`.

**Contract**: sprawdza `output` (zgodny z `REVIEW_SCHEMA`), `tokenUsage`, `cost`, `metadata.provider`/`latencyMs`/`modelVerdict`, mapowanie błędu limitu na `error`, brak `reasoning` w żądaniu przy `maxReasoningTokens: null`, oraz że `evals/review.schema.json` równa się `REVIEW_JSON_SCHEMA`.

### Success Criteria:

#### Automated Verification:

- Testy paczki (w tym test adaptera) przechodzą bez sieci: `npm test --prefix packages/code-reviewer`
- Typecheck obejmuje `evals/` i przechodzi: `npm run typecheck --prefix packages/code-reviewer`
- Lint repo przechodzi: `npm run lint`
- promptfoo akceptuje config: `npx promptfoo validate -c evals/promptfooconfig.yaml` (w `packages/code-reviewer`; jeśli brak `validate` w tej wersji — równoważne polecenie z `--help`)

#### Manual Verification:

- Przegląd fixtures i asercji z użytkownikiem (czy przypadki i progi odpowiadają kryteriom)

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznej weryfikacji.

---

## Phase 3: Pierwszy płatny przebieg (×1)

### Overview

Smoke test rozstrzyga niepotwierdzone założenia, potem pełna macierz ×1; wyniki i instrukcja w repo.

### Changes Required:

#### 1. Smoke i pełny przebieg

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml` (tylko jeśli smoke wymusi poprawki)

**Intent**: Smoke (`--filter-providers deepseek --filter-pattern user-id`, ~$0.01) potwierdza: grader `openrouter:` działa, klucz dociera do gradera, czas jest raportowany (natywnie albo z `metadata.latencyMs`), asercja widzi `metadata` (wtedy dołączamy asercję zgodności modelu z regułą). Potem pełna macierz 4×4 (~$0.05–0.35). Każdy przebieg po potwierdzeniu z użytkownikiem.

**Contract**: wynik JSON promptfoo (`-o`) zapisany w scratchpadzie, nie w repo.

#### 2. Wyniki i dokumentacja

**File**: `context/changes/code-review-evals/results.md`, `CLAUDE.md`

**Intent**: Macierz (przypadek × kolumna: pass/fail, nieudane asercje, koszt, czas, dostawca, tokeny rozumowania) i suma kosztu przebiegu; CLAUDE.md: `npm run eval` — płatna bramka regresji przed zmianą promptu lub modelu recenzenta, klucz z `.env` paczki, exit 100 = niezaliczony test.

**Contract**: wpis CLAUDE.md w sekcji Commands obok recenzenta.

### Success Criteria:

#### Automated Verification:

- Smoke kończy się kodem 0 albo 100 (nie 1) i raportuje wynik gradera dla `llm-rubric`
- Pełny przebieg ×1 kończy się kodem 0 albo 100; wynik JSON zawiera 16 komórek (4 przypadki × 4 kolumny)
- `results.md` zawiera macierz 4×4 i sumę kosztu

#### Manual Verification:

- Użytkownik ogląda macierz (`npx promptfoo view` albo `results.md`) i potwierdza, że wyniki są wiarygodne

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznej weryfikacji.

---

## Phase 4: Decyzja o modelu i limicie rozumowania (×3)

### Overview

Przebieg `--repeat 3` mierzy stabilność; użytkownik decyduje o modelu i limicie; decyzja wdrożona i potwierdzona evalem.

### Changes Required:

#### 1. Przebieg ×3 i decyzja

**File**: `context/changes/code-review-evals/results.md`

**Intent**: Pass rate na komórkę (z 3), mediana kosztu i czasu, rozrzut dostawców i tokenów rozumowania; rekomendacja + decyzja użytkownika (model domyślny, `maxReasoningTokens`) z uzasadnieniem.

**Contract**: sekcja „Decyzja” w `results.md`.

#### 2. Wdrożenie decyzji

**File**: `packages/code-reviewer/src/cli.ts` (domyślny `REVIEW_MODEL`), `.github/actions/ai-reviewer/action.yml` (domyślny input `model`), `packages/code-reviewer/src/limits.ts` (jeśli zmienia się limit), `CLAUDE.md`/`.env.example` (jeśli opisują model)

**Intent**: Jeden domyślny model i limit w CLI, akcji CI i dokumentacji; bez zmian, jeśli decyzja to status quo.

**Contract**: domyślny model identyczny w `cli.ts` i `action.yml`.

### Success Criteria:

#### Automated Verification:

- Przebieg `npm run eval -- --repeat 3` kończy się kodem 0 albo 100; wynik zawiera 48 komórek
- Po wdrożeniu: testy, typecheck i lint przechodzą
- Przebieg potwierdzający ×1 dla wybranej konfiguracji kończy się kodem 0

#### Manual Verification:

- Użytkownik zatwierdza decyzję o modelu i limicie rozumowania na podstawie macierzy ×3

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie ręcznej weryfikacji.

---

## Phase 5: Krótsze uzasadnienia

### Overview

Zmiana promptu i opisu pola `reason` na jedno zdanie, egzekwowana asercją i sprawdzona ponownym evalem; potem push i PR.

### Changes Required:

#### 1. Prompt i schemat

**File**: `packages/code-reviewer/src/prompts/system.ts`, `packages/code-reviewer/src/review-schema.ts`, `packages/code-reviewer/evals/review.schema.json`

**Intent**: Model pisze jedno zdanie uzasadnienia (z plikiem/linią przy ocenie < 7), żeby komentarz PR był czytelny.

**Contract**: opis `reason` i prompt mówią „jedno zdanie, maksymalnie 250 znaków”; bez limitu w schemacie (`maxLength`), żeby nie odrzucać całej recenzji przez jedno długie zdanie; `review.schema.json` zregenerowany.

#### 2. Asercja długości

**File**: `packages/code-reviewer/evals/promptfooconfig.yaml`

**Intent**: Bramka regresji pilnuje długości uzasadnień deterministycznie, bez kosztu gradera.

**Contract**: `defaultTest.assert` `javascript`: każde `reason` ≤ 250 znaków i bez więcej niż jednego zdania (heurystyka: najwyżej jeden znak `.`/`!`/`?` kończący zdanie poza ścieżkami plików i liczbami).

#### 3. Push i PR

**File**: (GitHub) gałąź `feat/m5l3-code-review-evals`

**Intent**: PR do `main` z opisem odwołującym się do `context/changes/code-review-evals/`; przechodzi przez recenzenta AI (wymagany check `review`).

### Success Criteria:

#### Automated Verification:

- Testy, typecheck i lint przechodzą
- Przebieg `npm run eval` dla wybranej konfiguracji z nową asercją długości kończy się kodem 0
- Check `review` na PR jest zielony

#### Manual Verification:

- Użytkownik ogląda komentarz AI na PR i potwierdza, że uzasadnienia są czytelne

**Implementation Note**: Po fazie zatrzymaj się na potwierdzenie ręcznej weryfikacji.

---

## Testing Strategy

### Unit Tests:

- Biblioteka: `maxReasoningTokens: null`, `provider`, `reasoningTokens` w `usage` (fałszywy OpenRouter i `MockLanguageModelV4`).
- Adapter evali: mapowanie `ProviderResponse`, błędy, `review.schema.json` vs `REVIEW_JSON_SCHEMA` — w `npm test`, bez sieci.

### Integration Tests:

- promptfoo z prawdziwymi modelami — wyłącznie ręcznie przez `npm run eval` (płatne), nie w `npm test` ani w CI.

### Manual Testing Steps:

1. Smoke: 1 przypadek × `deepseek-v4.1-flash` z graderem.
2. Pełna macierz ×1, potem ×3.
3. Po zmianie promptu: pełny eval wybranej konfiguracji z asercją długości.

## Performance Considerations

Szacunek na przebieg ×1 (4 przypadki × 4 kolumny + grader Sonnet 5.5 dla 1–2 `llm-rubric` na przypadek): ~$0.05–0.35, zależnie od routingu `glm-5.3`; ×3 ≈ trzykrotność. Czas: równoległość promptfoo (`-j`) domyślna; kolumna `glm-5.3@no-cap` może trwać do kilku minut przy długim rozumowaniu.

## Migration Notes

Nie dotyczy (nowe pliki; domyślne zachowanie CLI i CI bez zmian do fazy 4). Wycofanie: usunięcie `evals/` i devDependency promptfoo.

## References

- Research: `context/changes/code-review-evals/research.md`
- Szablon kursu: `.claude/config-templates/m5l3-promptfooconfig.yaml.template`, prompt `.claude/prompts/m5l3-promptfoo.md`
- Agent: `packages/code-reviewer/src/agent.ts`, limity `src/limits.ts`, reguła `src/verdict.ts`, schemat `src/review-schema.ts`
- Kontekst CI: `context/changes/ci-cd-code-review/plan.md` (notka fazy 4), PR #29, #30

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Diagnostyka przebiegu w bibliotece

#### Automated

- [x] 1.1 Testy paczki przechodzą: `npm test --prefix packages/code-reviewer` — df05e6a
- [x] 1.2 Typecheck paczki przechodzi: `npm run typecheck --prefix packages/code-reviewer` — df05e6a
- [x] 1.3 Lint repo przechodzi: `npm run lint` — df05e6a

#### Manual

- [x] 1.4 Przegląd z użytkownikiem: domyślne zachowanie CLI/CI bez zmian (8000), nowy format `[usage]` — df05e6a

### Phase 2: Zestaw evali offline

#### Automated

- [x] 2.1 Testy paczki (w tym test adaptera) przechodzą bez sieci: `npm test --prefix packages/code-reviewer` — 633fa77
- [x] 2.2 Typecheck obejmuje `evals/` i przechodzi: `npm run typecheck --prefix packages/code-reviewer` — 633fa77
- [x] 2.3 Lint repo przechodzi: `npm run lint` — 633fa77
- [x] 2.4 promptfoo akceptuje config: `npx promptfoo validate -c evals/promptfooconfig.yaml` — 633fa77

#### Manual

- [x] 2.5 Przegląd fixtures i asercji z użytkownikiem — 633fa77

### Phase 3: Pierwszy płatny przebieg (×1)

#### Automated

- [x] 3.1 Smoke kończy się kodem 0 albo 100 (nie 1) i raportuje wynik gradera dla `llm-rubric` — 2106024
- [x] 3.2 Pełny przebieg ×1 kończy się kodem 0 albo 100; wynik JSON zawiera 16 komórek — 2106024
- [x] 3.3 `results.md` zawiera macierz 4×4 i sumę kosztu — 2106024

#### Manual

- [x] 3.4 Użytkownik ogląda macierz i potwierdza, że wyniki są wiarygodne — 2106024

### Phase 4: Decyzja o modelu i limicie rozumowania (×3)

#### Automated

- [x] 4.1 Przebieg `npm run eval -- --repeat 3` kończy się kodem 0 albo 100; wynik zawiera 48 komórek — 34cd24c
- [x] 4.2 Po wdrożeniu: testy, typecheck i lint przechodzą — 34cd24c
- [x] 4.3 Przebieg potwierdzający ×1 dla wybranej konfiguracji kończy się kodem 0 — 34cd24c

#### Manual

- [x] 4.4 Użytkownik zatwierdza decyzję o modelu i limicie rozumowania na podstawie macierzy ×3 — 34cd24c

### Phase 5: Krótsze uzasadnienia

#### Automated

- [x] 5.1 Testy, typecheck i lint przechodzą — 88a8049
- [x] 5.2 Przebieg `npm run eval` dla wybranej konfiguracji z nową asercją długości kończy się kodem 0 — 88a8049
- [x] 5.3 Check `review` na PR jest zielony — 5415df3

#### Manual

- [x] 5.4 Użytkownik ogląda komentarz AI na PR i potwierdza, że uzasadnienia są czytelne — 5415df3
