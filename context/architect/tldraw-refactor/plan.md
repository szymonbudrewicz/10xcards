# Siatka bezpieczeństwa pod ujednolicenie ścieżek hooków przesunięcia (C3): plan implementacji

> Wersja po `/10x-plan-review` (2026-11-10, `reviews/plan-review.md`). Przegląd (F1) wykazał, że helper z dwiema semantykami rekordów nie byłby prawdziwą unifikacją. Ta zmiana dostarcza więc tylko siatkę testów. Naprawa i helper to dwie kolejne, osobne zmiany (zob. „Następne zmiany”).

## Overview

Gest przesunięcia (`Translating.ts`) i 7 metod edytora (nudge, stack, pack, align, distribute, stretch, resizeToBounds) wywołują kontrakt `ShapeUtil.onTranslate*` dwiema niezależnymi implementacjami. Rozjazd już raz dał błąd (#10198) i wymusił wklejanie poprawek w 7 miejsc (#10734). Docelowo zostanie jedna implementacja wzorem `applyRotationToSnapshotShapes`, ale jej warunkiem jest zmiana zachowania ścieżki jednorazowej. Ta zmiana tylko utrwala obecne zachowanie obu ścieżek i sąsiednich kontraktów, łącznie ze znanym błędem, bez dotykania `src/lib`.

## Current State Analysis

- **Gest:** woła hooki bezpośrednio w `TR`:
  - `handleStart` (`Translating.ts:262-290`): `onTranslateStart(shape)` dla każdego `movingShape`, zebrane partiale idą w jedno `updateShapes`;
  - update (`Translating.ts:356-373`): `onTranslate(initial, current)`, gdzie `current` pochodzi ze store, a kształty usunięte w trakcie są pomijane;
  - `handleEnd` (`Translating.ts:292-327`): `onTranslateEnd(initial, current)`;
  - `cancel` (`Translating.ts:237-247`): `onTranslateCancel`.
- **Ścieżka jednorazowa:** `getChangesToTranslateShape` (`Editor.ts:7018-7044`, prywatna) łączy start→x/y→translate→end na kopii roboczej, bez odczytu ze store. Jedynym wywołującym jest wrapper `getChangesToTranslateShapeByPageDelta` (`Editor.ts:7052-7055`) z 7 wywołaniami (`Editor.ts:7076, 7714, 7830, 7910, 7982, 8033, 8100`) (research A1–A3; przegląd planu potwierdził, że innych wywołań hooków nie ma).
- **Wzorzec docelowy działa inaczej niż ścieżka jednorazowa.** W `applyRotationToSnapshotShapes` (`editor/src/lib/utils/rotation.ts:57-111`) najpierw idzie `updateShapes` z nowymi pozycjami, a etap `one-off` to start+update+end w jednej pętli na rekordach czytanych ze store (`rotation.ts:97-111`). Dlatego tam unifikacja jest prawdziwa, a tutaj wymaga najpierw zmiany zachowania (F1 z przeglądu).
- **Potwierdzony błąd** (sonda w planowaniu, plik tymczasowy usunięty):
  - `ASU.onTranslateStart` zapisuje terminal strzałki do store (`ArrowShapeUtil.tsx:614,623`, `updateArrowTerminal`) i zwraca `undefined`;
  - ścieżka jednorazowa zwraca kopię zbudowaną ze starego `initialShape`, więc `updateShapes` (`Editor.ts:7078`) nadpisuje ten zapis;
  - po odpięciu od celu `props.start` wraca do wartości nieaktualnej (nudge: `{-999,-999}`, gest: `{0,0}`).
- **Testy, które już tworzą siatkę:**
  - kolejność `start/change…/end` i `cancel` gestu dla jednego utila (`shapeutils.test.ts:355-430`);
  - wiązania strzałek w ścieżce jednorazowej: nudge (`ArrowShapeUtil.test.ts:196`), align (`:216`), distribute (`:240`), grupa+nudge (`:278`), oraz `stackShapes.test.ts:146`, `resizeToBounds.test.tsx:143,194`.

  *Korekta:* research (H1) twierdził, że wiązania mają tylko stack i resizeToBounds. Było to fałszywe, bo ast-grep przeszukał wyłącznie `src/test/commands/` (F2 z przeglądu).

## Desired End State

- Obecne zachowanie obu ścieżek kontraktu `onTranslate*` jest utrwalone testami:
  - gest: argumenty, wiele kształtów, partiale ze startu, kształt usunięty w trakcie, cancel;
  - ścieżka jednorazowa: sekwencja i argumenty dla 7 metod;
  - sąsiednie kontrakty: reguła wiązania strzałki z zaznaczonym przodkiem celu i kolejność efektów wiązań podczas gestu.
- Znany błąd ma dwa testy z literałami: test pinujący obecną wartość (`{-999,-999}`) i `it.fails` oczekujący poprawnej (`{0,0}`). Każda zmiana wyniku daje czerwony test, a przyszła naprawa ma jednoznaczny sygnał wejścia i wyjścia.
- `src/lib` bez zmian; `pnpm test-ci` i `pnpm lint` zielone.

### Key Discoveries:

- Vitest obsługuje `it.fails` (test przechodzi, gdy ciało rzuca), ale w repo nie ma precedensu. Samo `it.fails` przechodzi przy każdej porażce, dlatego jest sparowane z testem pinującym (F3 z przeglądu).
- Fake timery **nie są globalne.** `packages/tldraw/vitest.config.ts` ustawia tylko `fakeTimers.toFake`, a pliki same wołają `vi.useFakeTimers()` (`stackShapes.test.ts:5`, `ArrowShapeUtil.test.ts:17`). `shapeutils.test.ts` tego nie robi (F5 z przeglądu).
- Fixture `shapeutils.test.ts:28-61` ma `box2` jako dziecko `frame1`. Zaznaczenie rodzica razem z dzieckiem w metodach jednorazowych uruchamia `todo` z `Editor.ts:7050-7051` (podwójne przesunięcie) i podwaja log. Log `calls` w istniejących testach jest per util, a nie per kształt (F5).

## What We're NOT Doing

- **Żadnych zmian w `packages/*/src/lib`** ani w api-report: ta zmiana to wyłącznie testy.
- **Naprawa błędu strzałki i zmiana semantyki etapu `one-off`:** osobna zmiana nr 1 (zob. niżej).
- **Helper `applyTranslateHooks` i przepięcie gestu:** osobna zmiana nr 2, zależna od nr 1.
- **`todo` z `Editor.ts:7050-7051`** (podwójne przesunięcie), `onTranslateCancel` w helperze, matematyka pozycji gestu (`moveShapesToPoint`, C8), kolejność efektów (C5, tylko guard), C1/C2, C7, C9.
- Testy strzałek w ścieżce jednorazowej poza tym, co już istnieje (`ArrowShapeUtil.test.ts:196-299`), i poza parą pin + `it.fails`.
- E2E przeciągnięcia.

## Implementation Approach

„Dodaj test, zanim dotkniesz”: obie fazy są czystymi dodatkami w plikach testowych, po jednym commicie na fazę, odwracalnymi samodzielnie. Kolejność od liści do korzenia:
1. Kontrakty sąsiednie (strzałki z grupą, efekty wiązań).
2. Kontrakt hooków obu ścieżek i para pin + `it.fails`.

Testy charakteryzujące utrwalają stan zastany. Świadomie przypinamy też błąd, bo to on jest punktem wejścia następnej zmiany.

## Następne zmiany (kolejność ustalona w przeglądzie, F1 Fix A)

1. **Naprawa ścieżki jednorazowej** (nowa zmiana `/10x-new`). Etap `one-off` w `Editor.getChangesToTranslateShape` przechodzi na semantykę rotacji: start → zapis do store → update → end na rekordach ze store. Sygnałem jest para testów z tej zmiany: test pinujący `{-999,-999}` zostaje usunięty, a `it.fails` zamieniony na `it`. To zmiana zachowania (kontrakt hooków widziany przez zewnętrzne utile), więc wymaga notki w `apps/docs/content/releases/next.mdx`. Do zmierzenia: koszt dodatkowych zapisów do store w 7 metodach (blind spot F1).
2. **Helper z jedną semantyką** (kolejna zmiana, po nr 1). `applyTranslateHooks({stage: 'start'|'update'|'end'|'one-off'})` w `editor/src/lib/utils/translation.ts`, `@internal`, wzorem `rotation.ts`; przepięcie `Editor.ts` i `Translating.ts`. Weryfikacja publicznych typów: `grep -c "declare function applyTranslateHooks" packages/editor/api/public.d.ts` = 0. Sam `grep -c applyTranslateHooks` zwróci 1, bo api-extractor zostawia komentarz „Excluded from this release type” (`omitTrimmingComments` domyślnie `false`, `internal/config/api-extractor.json:276-282`; F4 z przeglądu). Oczekiwany diff api-report: jeden wpis `@internal` w `editor/api-report.api.md`.

## Phase 1: Guardy na ścieżce C3

### Overview

Utrwalamy dwa sąsiednie kontrakty, przez które przejdą kolejne zmiany: regułę wiązań strzałki zależną od zaznaczenia (C4) i kolejność efektów ubocznych wiązań podczas gestu (C5). Same testy.

### Changes Required:

#### 1. Reguła strzałki z grupą

**File**: `packages/tldraw/src/test/arrows-megabus.test.tsx`

**Intent**: Utrwalić zachowanie `ASU.onTranslateStart` (`ArrowShapeUtil.tsx:582-594`) dla wariantu gestu „przodek celu zaznaczony”. Istniejący test `ArrowShapeUtil.test.ts:278` pokrywa grupę tylko w ścieżce nudge.

**Contract**: Nowy `describe` z dwoma przypadkami gestu:
- (a) strzałka związana z kształtem wewnątrz grupy; zaznaczone strzałka i grupa; przeciągnięcie: wiązanie zostaje, `isPrecise` bez zmian;
- (b) zaznaczona tylko strzałka, przeciągnięcie w obrębie celu: wiązanie zostaje z `isPrecise: true`.

Asercje istniejącym stylem pliku (`:652-653`, `:688-689`).

#### 2. Kolejność efektów wiązań przy geście

**File**: `packages/tldraw/src/test/bindings.test.tsx`

**Intent**: Utrwalić pełny log wywołań `TestBindingUtil` (`bindings.test.tsx:40-58`) podczas gestu przesunięcia kształtu `to` w grupie. Dziś snapshoty obejmują tylko usuwanie i kopiowanie.

**Contract**: Nowy test: pointerDown → 2× pointerMove → pointerUp na kształcie związanym, z `calls.length = 0` przed gestem i `toMatchInlineSnapshot` na całym logu (`onAfterChange*Shape`, `onOperationComplete`). Snapshot generuje pierwszy przebieg i jest przeglądany ręcznie.

### Success Criteria:

#### Automated Verification:

- Nowe testy przechodzą: `cd packages/tldraw && npx vitest run src/test/arrows-megabus.test.tsx src/test/bindings.test.tsx`
- Pełny zestaw testów przechodzi: `pnpm test-ci`
- Lint przechodzi: `pnpm lint`
- `git diff --stat` dotyka wyłącznie dwóch plików testowych

#### Manual Verification:

- Inline snapshot kolejności efektów przejrzany: kolejność odpowiada opisowi `Editor.ts:609-655` (afterChange wiązań → onOperationComplete)

**Implementation Note**: Po zielonej automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie, zanim przejdziesz do fazy 2.

---

## Phase 2: Charakteryzacja obu ścieżek hooków

### Overview

Siatka bezpieczeństwa dla zmian nr 1 i nr 2: kontrakt hooków gestu poza samą kolejnością, kontrakt ścieżki jednorazowej dla 7 metod oraz para pin + `it.fails` dla znanego błędu strzałki. Same testy.

### Changes Required:

#### 1. Kontrakt hooków gestu

**File**: `packages/tldraw/src/test/shapeutils.test.ts`

**Intent**: Uzupełnić `:355-430` o to, czego istniejące testy nie sprawdzają, a co zmiana nr 2 przeniesie do helpera.

**Contract**: Nowe przypadki w `describe` z testami translating:
- argumenty: `onTranslateStart(initial)`, `onTranslate(initial, current)` i `onTranslateEnd(initial, current)`, gdzie `initial` to rekord z początku gestu, a `current` to bieżący rekord ze store z nowym x/y;
- przy dwóch zaznaczonych kształtach każdy dostaje własne wywołania;
- partial zwrócony z `onTranslateStart` (np. zmiana propsa) jest widoczny w store po pierwszym ruchu;
- kształt usunięty w trakcie gestu (`deleteShapes` między ruchami) nie dostaje kolejnych `onTranslate` ani `onTranslateEnd`;
- po Escape `onTranslateCancel` dostaje `(initial, current)` i nie ma `onTranslateEnd`.

Log `calls` kluczować id kształtu (np. `` `${id}:start` ``), a nie tylko nazwą hooka.

#### 2. Kontrakt hooków ścieżki jednorazowej

**File**: `packages/tldraw/src/test/shapeutils.test.ts`

**Intent**: Utrwalić sekwencję i argumenty hooków w trybie jednorazowym dla każdego z 7 wywołujących wrapper (`Editor.ts:7076, 7714, 7830, 7910, 7982, 8033, 8100`).

**Contract**: `it.each` po `nudgeShapes`, `stackShapes`, `packShapes`, `alignShapes`, `distributeShapes`, `stretchShapes`, `resizeToBounds`, z danymi dobranymi tak, żeby każda metoda faktycznie przesunęła kształt:
- log `calls` dla kształtu to `['start', 'change', 'end']` w jednym wywołaniu metody;
- `onTranslate` dostaje jako drugi argument kopię z nowym x/y, której jeszcze nie ma w store;
- partial z `onTranslateStart` jest widoczny w kopii przekazanej do `onTranslate`.

Zastrzeżenia (F5):
- nie przekazywać rodzica razem z dzieckiem (w fixture `box2` jest dzieckiem `frame1`, `:28-61`), bo uruchamia to `todo` z `Editor.ts:7050-7051`;
- log kluczowany id kształtu;
- jeśli metoda używa timerów, `vi.useFakeTimers()` i `vi.advanceTimersByTime` jak w `stackShapes.test.ts:5,178` (w tym pliku timery nie są włączone).

#### 3. Para pin + `it.fails` dla błędu strzałki

**File**: `packages/tldraw/src/lib/shapes/arrow/ArrowShapeUtil.test.ts`

**Intent**: Przypiąć znany błąd ścieżki jednorazowej dokładną wartością tak, żeby każda zmiana wyniku (regresja albo naprawa) dała czerwony test. Istniejące testy nudge/align/distribute/grupa (`:196-299`) pokrywają już zachowanie wiązań i zostają bez zmian (F2).

**Contract**: Wspólny setup:
- prostokąt 100×100 w (0,0);
- strzałka w (50,50) z `props.start = {x:-999, y:-999}` (nieaktualna wartość, którą związany terminal ignoruje) i początkiem związanym ze środkiem prostokąta;
- zaznaczona tylko strzałka;
- `nudgeShapes([arrow], {x:500, y:0})`, po którym wiązanie startu znika.

Dwa testy:
- **pin** (`it`): `props.start` toEqual `{x:-999, y:-999}`;
- **`it.fails`**: `props.start` toEqual `{x:0, y:0}`, czyli pozycja uchwytu, jaką daje ten sam ruch gestem (wartość z sondy planowania).

Komentarz nad parą:
- opis błędu: zapis `updateArrowTerminal` w `onTranslateStart` nadpisany kopią roboczą z `Editor.ts:7019-7044`;
- odwołanie do `context/changes/refactor-opportunities/plan.md` („Następne zmiany”, nr 1);
- instrukcja: naprawa usuwa pin i zamienia `it.fails` na `it`; test pinujący świadomie utrwala błąd.

### Success Criteria:

#### Automated Verification:

- Nowe testy przechodzą, a `it.fails` raportuje „expected fail”: `cd packages/tldraw && npx vitest run src/test/shapeutils.test.ts src/lib/shapes/arrow/ArrowShapeUtil.test.ts`
- Pełny zestaw testów przechodzi: `pnpm test-ci`
- Lint przechodzi: `pnpm lint`
- `git diff --stat` dotyka wyłącznie plików testowych

#### Manual Verification:

- Sprawdzenie odwrotne: po chwilowej zamianie `it.fails` na `it` test pada z asercją `{x:-999,y:-999}` vs `{x:0,y:0}`, a nie z innego powodu (setup, wyjątek). Sprawdzić i cofnąć.
- Dane `it.each` przejrzane: każda z 7 metod przesuwa co najmniej jeden kształt i żaden przypadek nie zaznacza rodzica z dzieckiem

**Implementation Note**: Po zielonej automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie. To ostatnia faza tej zmiany. Następna to zmiana nr 1 z sekcji „Następne zmiany”.

---

## Testing Strategy

### Unit Tests:

- Faza 1:
  - wiązanie strzałki przy zaznaczonym przodku celu (gest);
  - log efektów wiązań podczas gestu w grupie.
- Faza 2:
  - kontrakt hooków gestu: argumenty, wiele kształtów, partiale ze startu, kształt usunięty w trakcie, cancel;
  - kontrakt jednorazowy dla 7 metod;
  - para pin + `it.fails` dla błędu strzałki.

### Integration Tests:

- Nie dotyczy: brak warstwy integracyjnej dla przepływu; E2E przeciągnięcia nie istnieje (research N2) i jest poza zakresem.

### Manual Testing Steps:

1. Przejrzeć inline snapshot z fazy 1.
2. Wykonać sprawdzenie odwrotne `it.fails` z fazy 2 i cofnąć je.
3. Przejrzeć dane `it.each`.

## Performance Considerations

Nie dotyczy: zmiana dodaje wyłącznie testy.

## Migration Notes

Brak migracji danych, zmian schematu i zmian API. Wycofanie: revert commitu fazy 2, potem fazy 1.

## References

- Przegląd planu: `context/changes/refactor-opportunities/reviews/plan-review.md`
- Research (ranking ④, weryfikacja ast-grep): `context/changes/refactor-opportunities/research.md`
- Deep Focus (②, ③): `context/changes/selection-translate-flow/research.md`
- Wzorzec docelowy: `packages/editor/src/lib/utils/rotation.ts:57-111` (`one-off` na rekordach ze store: `:97-111`), `packages/editor/src/index.ts:511`
- Ścieżka jednorazowa: `packages/editor/src/lib/editor/Editor.ts:7018-7055`
- Gest: `packages/tldraw/src/lib/tools/SelectTool/childStates/Translating.ts:237-373`
- Istniejąca siatka: `packages/tldraw/src/test/shapeutils.test.ts:355-430`, `packages/tldraw/src/lib/shapes/arrow/ArrowShapeUtil.test.ts:196-299`
- Historia: #2424 (wprowadzenie ścieżki jednorazowej), #10198 (fix z rozjazdu ścieżek), #10734 (wrapper „pasted into seven places”), #9215 (precedens wspólnego mechanizmu gestów)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Guardy na ścieżce C3

#### Automated

- [ ] 1.1 Nowe testy przechodzą (arrows-megabus, bindings)
- [ ] 1.2 Pełny zestaw testów przechodzi: `pnpm test-ci`
- [ ] 1.3 Lint przechodzi: `pnpm lint`
- [ ] 1.4 `git diff --stat` dotyka wyłącznie dwóch plików testowych

#### Manual

- [ ] 1.5 Inline snapshot kolejności efektów przejrzany

### Phase 2: Charakteryzacja obu ścieżek hooków

#### Automated

- [ ] 2.1 Nowe testy przechodzą, a `it.fails` raportuje „expected fail”
- [ ] 2.2 Pełny zestaw testów przechodzi: `pnpm test-ci`
- [ ] 2.3 Lint przechodzi: `pnpm lint`
- [ ] 2.4 `git diff --stat` dotyka wyłącznie plików testowych

#### Manual

- [ ] 2.5 Sprawdzenie odwrotne: `it.fails` zamienione na `it` pada z asercją `{-999,-999}` vs `{0,0}` (sprawdzone i cofnięte)
- [ ] 2.6 Dane `it.each` przejrzane: każda z 7 metod przesuwa kształt, bez rodzica z dzieckiem
