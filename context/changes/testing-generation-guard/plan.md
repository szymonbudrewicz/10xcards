# Ochrona generowania (rollout Phase 1) — plan implementacji

## Overview

Stawiamy runner testów (Vitest 5.0.5) i dowodzimy testami, że endpoint
`POST /api/generate` chroni płatne AI i wklejony tekst: bez sesji i przy złym
wejściu nie wywołuje AI i zwraca błąd w kształcie `{ error: { code, message } }`,
błędy AI mapuje na czytelne 502/504, wynik obcina do 10 propozycji, a wklejony
tekst nie trafia do logów ani poza wywołanie AI. `npm test` trafia do joba `ci`.
Na koniec jednorazowo uruchamiamy Strykera i utrwalamy wzorce w §6 test-planu.

Ryzyka: #4 i #5 z `context/foundation/test-plan.md` §2.

## Current State Analysis

- Brak runnera i plików testowych; w `package.json` nie ma skryptu `test`.
- Jedyne pokrycie ścieżki generowania to `scripts/smoke.mjs:102-137` (job `smoke`):
  sprawdza tylko status i `error.code`. Nie dowodzi, że AI nie zostało wywołane
  (mock nie liczy wywołań, `scripts/mock-openrouter.mjs:36-63`), nie dotyka limitu
  10 (mock zwraca 3 karty, `mock-openrouter.mjs:16-20`), nie sprawdza `message`
  ani logów, testuje tylko 10 001 (nie granicę 10 000).
- Szczegóły ścieżki i cytaty: `research.md` (Summary, Detailed Findings).

## Desired End State

`npm test` uruchamia w CI (job `ci`) zestaw testów w `tests/`, który pada, gdy:
sprawdzenie sesji zniknie lub przesunie się za wywołanie AI; walidacja pustego
lub za długiego tekstu przestanie działać albo przesunie granicę; błąd AI przestanie
być mapowany na `{ error }` 502/504; obcięcie do 10 propozycji lub odrzucanie pustych
kart zniknie; ktoś zaloguje lub odeśle wklejony tekst albo doda inne wyjście sieciowe.
Każda z tych regresji jest potwierdzona ręcznym „zepsuj kod → pada dokładnie ten test”.

### Key Discoveries:

- Endpoint to eksportowana funkcja `POST(context)`, która czyta tylko
  `context.locals.user` i `context.request` (`src/pages/api/generate.ts:15,21`) —
  wystarczy sztuczny kontekst, bez serwera Astro.
- Jedyne wyjście sieciowe to globalny `fetch` w `src/lib/services/card-generation.ts:83`;
  stub `fetch` = mock na granicy sieci (§4 test-planu) i licznik „AI nie wywołane”.
- `generate.ts:3` importuje wirtualny moduł `astro:env/server`.
- Middleware nie obejmuje `/api/generate` (`src/middleware.ts:4,28`); ochrona to
  wyłącznie `generate.ts:15-17` (zgodnie z `lessons.md`).
- Jedyny log na ścieżce: `generate.ts:60` (`{ code, providerStatus }`); observability
  Workers jest włączone (`wrangler.jsonc:13-15`), więc log = trwały zapis.
- Vite 8.3.0 w projekcie; `vitest@5.0.5` wymaga `vite ^6.4 || ^7 || ^8`, Node `^22.12`
  (CI: Node 22, lokalnie 24.21.0). `@stryker-mutator/vitest-runner@10.0.0` wymaga
  `vitest >=2` (sprawdzone `npm view`, 2026-10-23).

## What We're NOT Doing

- Zachowanie tekstu w polu po błędzie i blokada podwójnego kliknięcia
  (`GenerateForm.tsx:16-17,66`, `useGenerateProposals.ts:25-29`) — to zachowanie
  przeglądarki, należy do §3 Phase 2 (e2e). Bez jsdom/Testing Library w tej fazie.
- Dokładna treść polskich komunikatów — asercje sprawdzają status, `code` i to, że
  `message` jest niepustym stringiem bez wklejonego tekstu (decyzja planu).
- Liczenie emoji jako 2 znaków (UTF-16, `src/types.ts:3`) — znana rozbieżność z PRD
  („10 000 znaków”), decyzja produktowa; granicę testujemy literami z BMP. Zapisane
  w §6.6 test-planu.
- Zapytania do bazy o wklejony tekst — endpoint nie importuje Supabase
  (`generate.ts:1-6`); zamiast tego asercja „jedyne wyjście sieciowe to AI”.
- Stryker jako bramka CI — tylko jednorazowe, lokalne uruchomienie (faza 4).
- Zmiany w kodzie produkcyjnym `src/` — wyjątek: tylko jeśli test ujawni realny błąd;
  wtedy STOP i decyzja użytkownika przed poprawką.
- Hooki, e2e, Playwright (lekcje 3–4).

## Implementation Approach

Kolejność wg zależności, jak w case study lekcji: najpierw runner z pierwszą realną
regułą (faza 1 daje dowód, nie samo rusztowanie), potem kontrakt wejścia, potem
granica z AI i prywatność, potem kontrola jakości testów (Stryker), na końcu transfer
wiedzy (cookbook). Wszystkie fazy przez `/10x-implement` — testujemy istniejący kod,
więc nie ma naturalnego „czerwonego” testu przed implementacją (`/10x-tdd` nie pasuje).

Wyrocznia: PRD US-01 (`prd.md:54-56`: puste pole → bez AI; 10 000 znaków; maks. 10),
FR-011 (`prd.md:77`), NFR prywatności (`prd.md:99`), kontrakt kodów z
`context/changes/generate-card-proposals/plan.md:91,103-106`, `lessons.md` (401).
Testy wpisują literały `10_000`, `10_001`, `10` — **nie** importują `MAX_TEXT_LENGTH`
ani `MAX_PROPOSALS` (inaczej test lustrzany).

## Critical Implementation Details

- **Testy poza `src/pages/`.** Każdy plik `.ts` w `src/pages/` Astro traktuje jako
  trasę (np. `generate.test.ts` → `/api/generate.test`). Wszystkie testy i pomocniki
  w katalogu `tests/` w korzeniu repo.
- **`astro:env/server` przez alias, nie `getViteConfig`.** `getViteConfig` ładuje cały
  config Astro z adapterem Cloudflare (`@cloudflare/vite-plugin`, workerd). Zamiast
  tego `resolve.alias` na plik-zaślepkę; testy muszą móc ustawić pusty klucz dla
  przypadku 503 (np. zmienny stan przez `vi.hoisted` + `vi.mock` albo getter w zaślepce).
- **Izolacja stubów.** `fetch` i `console` stubowane per test i przywracane po teście
  (`vi.unstubAllGlobals`, `vi.restoreAllMocks`), żeby licznik wywołań nie przeciekał
  między testami.

## Faza 1: Vitest + pierwsza reguła (401 bez wywołania AI)

### Overview

Runner działa lokalnie i w CI, a pierwszy test dowodzi najważniejszej reguły ryzyka #5.

### Changes Required:

#### 1. Zależność i skrypt

**File**: `package.json`

**Intent**: Dodać runner i jedno polecenie do uruchamiania testów.

**Contract**: devDependency `vitest` w wersji `5.0.5` (dokładnie); skrypt
`"test": "vitest run"`.

#### 2. Konfiguracja Vitest

**File**: `vitest.config.ts`, `tests/stubs/astro-env-server.ts`

**Intent**: Uruchamiać testy z `tests/**/*.test.ts` w środowisku Node, z aliasem `@/`
jak w `tsconfig.json` i z zaślepką wirtualnego modułu Astro.

**Contract**: `test.environment: "node"`, `test.include: ["tests/**/*.test.ts"]`;
`resolve.alias`: `@` → `./src`, `astro:env/server` → zaślepka. Zaślepka eksportuje
`OPENROUTER_API_KEY` (niepusty testowy klucz), `OPENROUTER_BASE_URL`
(np. `http://ai.test/api/v1`), `SUPABASE_URL`, `SUPABASE_KEY` — z możliwością
nadpisania klucza na pusty w pojedynczym teście.

#### 3. Pomocnik kontekstu endpointu

**File**: `tests/helpers/api-context.ts`

**Intent**: Jedno miejsce, które buduje sztuczny `APIContext` dla `POST` z
`locals.user` (obiekt albo `null`) i `Request` z dowolnym ciałem (JSON albo surowy tekst).

**Contract**: funkcja przyjmuje `{ user, body | rawBody }` i zwraca obiekt rzutowany na
`APIContext`; oraz pomocnik stubujący `fetch` (zwraca `vi.fn`) z odpowiedzią OpenRouter
w kształcie `{ choices: [{ message: { content: "<JSON>" } }] }`.

#### 4. Pierwszy test — 401

**File**: `tests/api/generate.test.ts`

**Intent**: Udowodnić, że anonimowe żądanie z poprawnym tekstem dostaje 401 i AI nie
zostaje wywołane.

**Contract**:
- Zachowanie: `locals.user = null`, ciało `{ text: "Fotosynteza zachodzi w chloroplastach." }`
  → status 401, `body.error.code === "unauthorized"`, `body.error.message` niepusty string,
  stub `fetch` wywołany 0 razy.
- Regresja: usunięte sprawdzenie sesji albo przesunięte za wywołanie AI.
- Źródło: `lessons.md` (401 JSON), research §Risk #5, `generate.ts:15-17`.
- Brzeg: poprawny tekst w ciele — dowód, że to sesja, a nie walidacja, blokuje AI.
- Antywzorzec unikany: sama asercja statusu bez dowodu braku wywołania AI.

#### 5. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Uruchamiać testy w jobie `ci` przy każdym PR.

**Contract**: krok `- run: npm test` w jobie `ci` po `npx astro check`, przed `npm run build`.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi i pokazuje test 401
- `npx astro check` przechodzi (testy i config są typowane)
- `npm run lint` przechodzi
- `npm run build` przechodzi (Astro nie tworzy trasy z plików testowych)

#### Manual Verification:

- Celowe psucie: przesunięcie sprawdzenia sesji w `generate.ts` pod wywołanie AI (lub jego usunięcie) → pada test 401; po cofnięciu zielono
- Job `ci` na PR pokazuje krok `npm test` jako zielony

**Implementation Note**: po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Faza 2: Kontrakt walidacji wejścia

### Overview

Dowód dla ryzyka #4 (wejście) i #5 (brak AI przy odrzuceniu): każde odrzucenie wejścia
kończy się błędem `{ error }` bez wywołania AI, a granica 10 000 jest dokładnie tam,
gdzie mówi PRD.

### Changes Required:

#### 1. Testy walidacji

**File**: `tests/api/generate.test.ts`

**Intent**: Sparametryzowane testy odrzuceń i jeden test granicy przepuszczanej.

**Contract** (zalogowany `locals.user`, stub `fetch`):
- `it.each` odrzuceń → 400, `code`, 0 wywołań `fetch`, `message` niepusty i bez wklejonego tekstu:
  - `""` i `"  \n\t "` → `text_empty`
  - 10 001 znaków (litery z BMP, z unikalnym znacznikiem na początku) → `text_too_long`
  - surowe ciało niebędące JSON-em, `{ text: 123 }`, `{}` → `invalid_request`
- Granica: dokładnie 10 000 znaków → nie 400; `fetch` wywołany dokładnie raz, status 200.
- Brak klucza AI (zaślepka z pustym kluczem) → 503 `ai_not_configured`, 0 wywołań `fetch`.
- Regresja: zniknięcie `trim()`, `>` zamienione na `>=` (lub odwrotnie), walidacja po
  wywołaniu AI, interpolacja tekstu do komunikatu.
- Źródło: PRD US-01 (`prd.md:54-55`), kontrakt kodów (`generate-card-proposals/plan.md:103-106`),
  research §Risk #4.
- Brzeg: granica 10 000/10 001, same białe znaki, nie-JSON.
- Antywzorzec unikany: literały `10_000`/`10_001` zamiast `MAX_TEXT_LENGTH`; jeden
  `it.each` zamiast kopii.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi z testami walidacji
- `npx astro check` i `npm run lint` przechodzą

#### Manual Verification:

- Celowe psucie: `>` → `>=` w warunku długości w `generate.ts` → pada test granicy 10 000; po cofnięciu zielono
- Celowe psucie: usunięcie `.trim()` z warunku pustego tekstu → pada przypadek białych znaków; po cofnięciu zielono

**Implementation Note**: po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Faza 3: Granica z AI i prywatność

### Overview

Dowód dla ryzyka #4 (błąd AI, limit 10) i #5 (logi, wyjście sieciowe) na poziomie
serwisu (unit) i endpointu.

### Changes Required:

#### 1. Testy serwisu

**File**: `tests/services/card-generation.test.ts`

**Intent**: Normalizacja wyniku i klasyfikacja błędów `generateCardProposals` przy
stubowanym `fetch`.

**Contract**:
- AI zwraca 12 poprawnych kart → wynik ma 10 elementów, to pierwsze 10 w kolejności.
- Karty z pustym (po `trim`) przodem lub tyłem są odrzucane; białe znaki na brzegach obcięte.
- `it.each` błędów → `CardGenerationError` z `code: "ai_failed"`: HTTP 500 (z
  `providerStatus: 500`), brak `choices`, `content` niebędący JSON-em, JSON niezgodny ze schematem.
- `fetch` odrzuca błędem o nazwie `TimeoutError` lub `AbortError` → `code: "ai_timeout"`.
- Wyjście sieciowe: dokładnie jedno wywołanie na `<baseUrl>/chat/completions`; pusty
  `baseUrl` → domyślny `https://openrouter.ai/api/v1`.
- Regresja: usunięty `.slice`, usunięty filtr pustych kart, błąd parsowania przepuszczony
  jako sukces, timeout sklasyfikowany jako `ai_failed`.
- Źródło: PRD US-01 (maks. 10), kontrakt serwisu `generate-card-proposals/plan.md:91`.
- Brzeg: 12 kart (ponad limit), puste karty, śmieciowa odpowiedź.
- Antywzorzec unikany: literał `10` zamiast `MAX_PROPOSALS`; brak asercji na prywatnych
  szczegółach (np. treści promptu).

#### 2. Testy endpointu — błędy AI i prywatność

**File**: `tests/api/generate.test.ts`

**Intent**: Mapowanie błędów AI na odpowiedź i brak wycieku wklejonego tekstu.

**Contract**:
- AI zwraca 500 → 502 `ai_failed`; `fetch` odrzuca `TimeoutError` → 504 `ai_timeout`;
  śmieciowa treść → 502 `ai_failed`; każda odpowiedź w kształcie `{ error: { code, message } }`.
- Prywatność (`it.each` po gałęziach: 401, 400 pusty/za długi/nie-JSON, 503, 502, 504,
  oraz sukces 200): wejście zawiera unikalny znacznik; szpieg na `console.log/info/warn/error/debug`
  — żaden argument (po serializacji) nie zawiera znacznika; tekst odpowiedzi nie zawiera znacznika.
- Wyjście sieciowe (sukces): `fetch` wywołany dokładnie raz, URL zaczyna się od bazowego
  URL z zaślepki + `/chat/completions`.
- Regresja: `console.error(text)` lub logowanie obiektu błędu z treścią, echo tekstu
  w komunikacie, dodatkowe wywołanie sieciowe (np. zapis do Supabase), zmiana mapowania 502/504.
- Źródło: PRD NFR (`prd.md:99`), CLAUDE.md Conventions, `generate-card-proposals/plan.md:49`,
  research §Risk #5.
- Brzeg: każda gałąź błędu, nie tylko sukces.
- Antywzorzec unikany: zapytanie do bazy bez czego zepsuć; test tylko ścieżki szczęśliwej.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi z testami serwisu i prywatności
- `npx astro check` i `npm run lint` przechodzą

#### Manual Verification:

- Celowe psucie: usunięcie `.slice(0, MAX_PROPOSALS)` w serwisie → pada test 12 → 10; po cofnięciu zielono
- Celowe psucie: dodanie `text` do obiektu w `console.error` w `generate.ts` → padają testy prywatności; po cofnięciu zielono

**Implementation Note**: po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Faza 4: Stryker — jednorazowa kontrola jakości testów

### Overview

Sprawdzić, czy testy z faz 1–3 łapią celowe zmiany w kodzie, i świadomie zdecydować
o każdym mutancie, który przeżył.

### Changes Required:

#### 1. Instalacja i konfiguracja

**File**: `package.json`, `stryker.config.json`, `.gitignore`

**Intent**: Stryker z runnerem Vitest, zawężony do dwóch modułów tej fazy.

**Contract**: devDependencies `@stryker-mutator/core@10.0.0` i
`@stryker-mutator/vitest-runner@10.0.0`; skrypt `"test:mutation": "stryker run"`;
`stryker.config.json`: `testRunner: "vitest"`, `mutate`:
`src/lib/services/card-generation.ts`, `src/pages/api/generate.ts`; reportery
`progress`, `clear-text`, `html`; `thresholds.break: null`. `.gitignore`: `reports/`,
`.stryker-tmp/`. Bez kroku w CI.

#### 2. Przegląd mutantów

**File**: `context/changes/testing-generation-guard/stryker-report.md`

**Intent**: Zapisać wynik i decyzję dla każdego żywego mutanta.

**Contract**: mutation score; tabela żywych mutantów (plik:linia, mutator, decyzja:
„asercja dodana” / „równoważny” / „świadomie pominięty” + jedno zdanie dlaczego).
Asercje dopisywane tylko dla mutantów oznaczających błąd widoczny dla użytkownika lub
biznesu, bez przypinania szczegółów implementacji; bez pogoni za 100%.

### Success Criteria:

#### Automated Verification:

- `npm run test:mutation` kończy się kodem 0 i generuje raport HTML
- `npm test`, `npx astro check` i `npm run lint` przechodzą po ewentualnych nowych asercjach

#### Manual Verification:

- Przejrzany raport HTML; każdy żywy mutant ma decyzję w `stryker-report.md`

**Implementation Note**: po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Faza 5: Cookbook i synchronizacja

### Overview

Trwały transfer wiedzy do kolejnych faz i agentów.

### Changes Required:

#### 1. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: Wypełnić wzorce, które ta faza dostarczyła, i zaktualizować status.

**Contract**: §6.1 (unit: stub `fetch`, literały z PRD, `it.each`), §6.2 (endpoint: sztuczny
`APIContext`, `locals.user`, licznik `fetch`, szpieg `console` ze znacznikiem; testy w
`tests/`, nie w `src/pages/`), §6.6 (notatka Phase 1: emoji = 2 znaki jako znana
rozbieżność; tekst w polu → Phase 2; Stryker ad hoc). §3 Phase 1 Status → `complete`.
§4: Vitest „installed”, wiersz Stryker 10.0.0 (checked: data). §5: unit + integration
→ „required (wired)” w jobie `ci`.

#### 2. Reguły dla agenta

**File**: `CLAUDE.md`

**Intent**: Agent wie, jak testujemy w tym repo.

**Contract**: w Commands: `npm test` (Vitest, `tests/`), `npm run test:mutation`
(Stryker, tylko selektywnie dla modułu z ryzyka, nie gonimy 100%, żywe mutanty
oceniane pojedynczo); zastąpić zdanie „No unit-test runner is configured”; jedno zdanie:
testy nie mogą leżeć w `src/pages/` (Astro robi z nich trasy).

### Success Criteria:

#### Automated Verification:

- `npm test`, `npx astro check`, `npm run lint` przechodzą
- `context/foundation/test-plan.md` §6.1 i §6.2 nie zawierają już „TBD — see §3 Phase 1”

#### Manual Verification:

- Przeczytany §6 test-planu i notka w `CLAUDE.md` — zrozumiałe dla kogoś, kto dodaje następny test

---

## Testing Strategy

### Unit Tests:

- `generateCardProposals`: limit 10, odrzucanie pustych kart, klasyfikacja błędów,
  timeout, adres wywołania.

### Integration Tests:

- `POST /api/generate` wywołany bezpośrednio z sztucznym kontekstem: 401, walidacja,
  503, mapowanie 502/504, prywatność logów i odpowiedzi, wyjście sieciowe.
  Pełny przepływ HTTP przez middleware i build pokrywa istniejący smoke (bez zmian).

### Manual Testing Steps:

1. Każda faza: wskazane „celowe psucie” → pada dokładnie oczekiwany test → cofnięcie.
2. PR: job `ci` z krokiem `npm test` zielony.

## Performance Considerations

Testy bez sieci i bez serwera — sekundy. Stryker tylko lokalnie i jednorazowo.

## Migration Notes

Nie dotyczy (brak zmian danych i kodu produkcyjnego).

## References

- Research: `context/changes/testing-generation-guard/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (ryzyka #4, #5), §3 Phase 1
- Kontrakt endpointu: `context/changes/generate-card-proposals/plan.md:91,103-112`
- Endpoint: `src/pages/api/generate.ts:13-67`; serwis: `src/lib/services/card-generation.ts:78-133`
- Lekcja: wzorzec faz z case study (środowisko + reguła → reguły → stuby → cookbook)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest + pierwsza reguła (401 bez wywołania AI)

#### Automated

- [x] 1.1 `npm test` przechodzi i pokazuje test 401 — 2c80001
- [x] 1.2 `npx astro check` przechodzi (testy i config są typowane) — 2c80001
- [x] 1.3 `npm run lint` przechodzi — 2c80001
- [x] 1.4 `npm run build` przechodzi (Astro nie tworzy trasy z plików testowych) — 2c80001

#### Manual

- [x] 1.5 Celowe psucie sprawdzenia sesji → pada test 401; po cofnięciu zielono — 2c80001
- [ ] 1.6 Job `ci` na PR pokazuje krok `npm test` jako zielony

### Phase 2: Kontrakt walidacji wejścia

#### Automated

- [x] 2.1 `npm test` przechodzi z testami walidacji — 8965cca
- [x] 2.2 `npx astro check` i `npm run lint` przechodzą — 8965cca

#### Manual

- [x] 2.3 Celowe psucie `>` → `>=` → pada test granicy 10 000; po cofnięciu zielono — 8965cca
- [x] 2.4 Celowe psucie (usunięcie `.trim()`) → pada przypadek białych znaków; po cofnięciu zielono — 8965cca

### Phase 3: Granica z AI i prywatność

#### Automated

- [x] 3.1 `npm test` przechodzi z testami serwisu i prywatności
- [x] 3.2 `npx astro check` i `npm run lint` przechodzą

#### Manual

- [x] 3.3 Celowe psucie (usunięcie `.slice`) → pada test 12 → 10; po cofnięciu zielono
- [x] 3.4 Celowe psucie (`text` w `console.error`) → padają testy prywatności; po cofnięciu zielono

### Phase 4: Stryker — jednorazowa kontrola jakości testów

#### Automated

- [ ] 4.1 `npm run test:mutation` kończy się kodem 0 i generuje raport HTML
- [ ] 4.2 `npm test`, `npx astro check` i `npm run lint` przechodzą po nowych asercjach

#### Manual

- [ ] 4.3 Każdy żywy mutant ma decyzję w `stryker-report.md`

### Phase 5: Cookbook i synchronizacja

#### Automated

- [ ] 5.1 `npm test`, `npx astro check`, `npm run lint` przechodzą
- [ ] 5.2 §6.1 i §6.2 test-planu bez „TBD — see §3 Phase 1”

#### Manual

- [ ] 5.3 §6 test-planu i notka w `CLAUDE.md` zrozumiałe dla kolejnego autora testu
