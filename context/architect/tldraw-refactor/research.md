---
date: 2026-11-10T11:00:01+01:00
researcher: Claude (Opus 5.5) z użytkownikiem
git_commit: 844f6f484baf305eeea061eeb44a4593d62683e2
branch: main
repository: tldraw/tldraw (lokalny klon, blob:none)
topic: "Refactor opportunities (④): które problemy z Deep Focus przesunięcia kształtu warto naprawić, w jakim kształcie i kolejności"
tags: [research, refactor-opportunities, m4l4, Translating, SelectTool, Editor, ArrowShapeUtil, DragAndDropManager, verified]
status: complete
last_updated: 2026-11-10
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Weryfikacja ast-grep: 23 twierdzenia (20 potwierdzonych, 2 doprecyzowane, 1 obalone); ranking bez zmian"
verification_commit: 844f6f484baf305eeea061eeb44a4593d62683e2
---

# Research: Refactor opportunities przepływu zaznaczenia i przesunięcia kształtu

**Date**: 2026-11-10T11:00:01+01:00
**Researcher**: Claude (Opus 5.5) z użytkownikiem
**Git Commit**: `844f6f484`
**Branch**: main
**Repository**: tldraw/tldraw
**Prior**: `context/changes/selection-translate-flow/research.md` (② Feature overview, ③ Technical debt, weryfikacja ast-grep); `context/map/repo-map.md` (strefy ryzyka 1–2, cykle).

Oznaczenia: **[E]** dowód (`file:line`, commit, PR), **[I]** wniosek, **[U]** niewiadoma. Skróty ścieżek jak w priorze (względem `packages/`):
`TR` = `tldraw/src/lib/tools/SelectTool/childStates/Translating.ts`, `E` = `editor/src/lib/editor/Editor.ts`, `SN` = `editor/src/lib/editor/tools/StateNode.ts`,
`ASU` = `tldraw/src/lib/shapes/arrow/ArrowShapeUtil.tsx`, `DnD` = `tldraw/src/lib/tools/SelectTool/DragAndDropManager.ts`, `S` = `store/src/lib/Store.ts`, `HM` = `editor/src/lib/editor/managers/HistoryManager/HistoryManager.ts`.
Numery `#NNNN` to PR-y w `tldraw/tldraw` (opisy czytane przez `gh pr view`).

## Research Question

Analiza Deep Focus (M4L3) zapisała dług i ryzyka przepływu „kliknij kształt i przeciągnij go”. Które z tych problemów warto naprawić, w jakim docelowym kształcie i w jakiej kolejności? Etap eksploracji: bez refaktoru i bez decyzji. Ranking jest propozycją dla osobnej sesji planowania.

## Lista problemów i klasyfikacja (do audytu)

Źródło: sekcja ③ prioru (pozycje 1–8 + hotspot), luki w testach, Open Questions oraz cykle z mapy. **KANDYDAT** = naprawa zmieniłaby strukturę kodu.

| # | Problem (źródło w priorze) | Klasyfikacja |
|---|---|---|
| C1 | `'select.translating'` jako string w 28 plikach, 9 wejść `setCurrentTool` (③1) | KANDYDAT → po badaniu połączony z C2 |
| C2 | `TranslatingInfo` poza publicznym `index.ts` (③2) | KANDYDAT |
| C3 | Dwie ścieżki hooków `onTranslate*`: gest vs jednorazowa (③3) | KANDYDAT |
| C4 | Reguły w `ASU.onTranslateStart`: wiązanie zostaje, gdy cel zaznaczony; `isPrecise:true` (③4) | KANDYDAT → po badaniu: pytanie domenowe, stop |
| C5 | Kolejność efektów ubocznych `E:603-757` (③5) | KANDYDAT |
| C6 | Ponowny odczyt przez `getShape` po hookach; `onTranslateCancel` bez implementacji (③6) | KANDYDAT → po badaniu: nie-kandydat (zamierzony punkt rozszerzeń) |
| C7 | Taktowanie DnD 60/320 ms, pomijanie klatek (③8) | KANDYDAT |
| C8 | Hotspot `TR` (679 linii) + współzmiany z Resizing/Rotating (③ hotspot) | KANDYDAT |
| C9 | Cykle importów na ścieżce: strzałki (8 plików), `Editor.ts ↔ reparenting.ts` (mapa, korekty L3) | KANDYDAT → po badaniu: korekta mapy, nie refaktor |
| N1 | Gałęzie strażnicze bez testów: read-only `PS:244`, zablokowany cel `DnD:74`, brak zaznaczenia `TR:59-61`, `isToolLocked` `TR:218`, limit przy klonowaniu `TR:169`, `it.todo` `frames.test.ts:1241` (③7) | test → wejście do wykonalności C8 |
| N2 | Brak E2E przeciągnięcia istniejącego kształtu (③7) | test → wejście |
| N3 | `PS.onInterrupt/onCancel` bez testu po nazwie; `Translating` nie nadpisuje `onInterrupt` [U] | test/niewiadoma |
| N4 | Znany błąd `todo` `E:7050-7051` (kształt układany razem z rodzicem przesuwa się 2×) | błąd zachowania → osobna zmiana; wejście do C3 |
| N5 | Ręczne `.mdx` o hookach/stanach niesprawdzane w CI | luka w dokumentacji |
| N6 | Czy rekord grupy (x/y) jest normalizowany po ruchu dzieci [U] | niewiadoma |
| N7 | „Wygląda groźnie, ale tanie”: sygnatury hooków, api-report, barrel, migracje schematu, współzmiany ASU z ShapeUtilami | już pilnowane przez CI |
| N8 | `Editor.ts` jako hotspot objętości (129 commitów) | ten przepływ dotyka tylko przelotek; ryzyko = C5 |

## Summary

- **Ranking:** ① **C3** ujednolicenie dwóch ścieżek hooków przesunięcia, wzorem rotacji i resize; ② **C1+C2** typowany kontrakt wejścia `select.translating` (start: eksport `TranslatingInfo`); ③ **C8 (zawężone)** wspólny szkielet cyklu życia stanów gestu. [E]+[I]
- **Faworyt z ③ spada.** Największy pod względem objętości hotspot (`TR`, 679 linii) ląduje dopiero na 3. miejscu i w zawężonej formie. Rozrost jest przypadkowy, ale zespół już go spłaca: `GestureShapeChangeTracker` w #9215 i sprzątanie w #10193. [E]
- **Na szczyt trafia C3**, bo jako jedyny łączy trzy rzeczy. Rozjazd ścieżek już spowodował błąd (#10198). Zespół ma gotowy wzorzec docelowy u rodzeństwa: `stage: 'one-off'` w rotacji (`editor/src/lib/utils/rotation.ts:67`) i `skipStartAndEndCallbacks` w resize (`E:8232`, `Resizing.ts:448`). Pierwszy krok to test bez edycji `Editor.ts`. [E]
- **Odrzucone jako refaktor:**
  - C4: decyzja domenowa, temat na M4L5.
  - C5: kolejność zaprojektowana świadomie (#3748); zmiana miałaby koszt L.
  - C6: hook dodany „for completeness” w rodzinie 4 hooków cancel (#6489).
  - C7: dławienie wydajnościowe obecne od początku.
  - C9: oba wskazane importy są użyte tylko jako typ, więc w runtime pętli najpewniej nie ma.

  C4, C5 i C7 dostają tani **guard** (test charakteryzujący). [E]+[I]
- **Korekty prioru:**
  - pod `ASU:596` jest `WeakMap` (`ASU:1257`), a nie `WeakCache`;
  - obserwacja „efekty uboczne po każdym `put`” jest teraz [E];
  - „cykle runtime” z mapy to dla dwóch najmniejszych pętli cykle w grafie importów;
  - C6 przestaje być długiem.

  Szczegóły w sekcji „Korekty prioru”.

## Detailed Findings

### C1 + C2 — wejście w `select.translating` stringiem z nietypowanym `info`

**Obecny kształt.** Rozproszony kontrakt stringowy routowany dynamicznie.
- `setCurrentTool(id: string, info = {})` tylko przekazuje wywołanie do `root.transition` (`E:1928-1929`) [E].
- `SN.transition` dzieli ścieżkę po `'.'`, a gdy dziecka nie ma, rzuca `Error` dopiero w runtime (`SN:140-152`) [E].
- `info` jest `any` i trafia do każdego węzła na ścieżce, nie tylko do liścia (`SN:159`, `SN:291-292`) [E].
- To konwencja całego kodu, nie tylko Translating. Literały `'select.*'` w produkcyjnym `packages/tldraw/src/lib`: `select.idle` 25 (raport: 44), `editing_shape` 9 (raport: 24), `resizing` 7 (raport: 19), `pointing_handle` 5 (raport: 19), `dragging_handle` 6 (raport: 14), `translating` 5 (raport: 9); razem 57 (raport: 129). Liczone ast-grep `'select.X'` jako literał, bez plików testowych. Pierwotny grep -o liczył też 8 plików `.test.` w `lib/`, komentarze i dłuższe stringi [E, ast-grep].
- Żaden typ info stanów potomnych SelectTool nie jest publiczny:
  - `TranslatingInfo` (`TR:28`) i `ResizingInfo` (`Resizing.ts:27`) są tylko eksportami modułów, a `tldraw/src/index.ts:319` eksportuje samo `SelectTool` [E];
  - pola `isCreating`/`creatingMarkId`/`onCreate`/`onInteractionEnd` powtarzają się w obu typach bez wspólnej bazy [E].

**Intencjonalność.** Wzorzec wejścia jest świadomą decyzją nośną, a brak typu to przypadkowa złożoność.
- Oficjalny przykład SDK `interaction-end-callback` (#7143, poprawiony w #10036) zaleca integratorom `editor.setCurrentTool('select.translating', info)`. Kontrakt `info` opisuje tylko prozą: „the pointer event, the target shape, and `isCreating`” [E].
- #6919 dodał do info `onInteractionEnd` jako callback i oznaczył zmianę jako `api`, ale typu nie wyeksportował [E].
- Klasa błędów „złe/niepełne info” ma potwierdzony fix: 8521efc65 (#10190): „a custom tool that hands off to `select.translating` with `isCreating: true` but no `onCreate` callback left the select tool stuck” [E].
- Fixa z powodu literówki w nazwie stanu nie znaleziono [E].
- Że `TranslatingInfo` nigdy nie był publiczny, jest prawdopodobne, ale nie sprawdzone pełnym pickaxe [U].

**Wykonalność.**
- Eksport `TranslatingInfo` z `tldraw/src/index.ts` to zmiana addytywna (nowy wpis w `tldraw/api-report.api.md`), więc koszt **S** [I].
- Typowane ścieżki to zmiana sygnatury publicznego `setCurrentTool` w `editor`. Zgodność wsteczna wymaga zostawienia przeciążenia `string`. Bez migracji danych, koszt **M** [I].
- Blast radius: 9 wejść w 9 plikach, z czego 6 poza `packages/tldraw` (collections, szablon workflow, 4 przykłady) [E, prior].
- Osłony:
  - `typecheck` obejmuje `collections`, `templates/workflow` i `apps/examples` (`build-types` w ich `package.json`, `checks.yml:62`) [E];
  - testy wykonują wejścia rdzenia (`dragFromToolbar-dom.test.tsx`, `NoteShapeTool.test.ts`, `groups.test.tsx`) [E]; czy trafiają dokładnie w linie `setCurrentTool`, nie wiadomo [U];
  - `collections/src/canvas/use-item-drag.ts`, szablon i przykłady nie mają testu jednostkowego [E].
- SDK nie trzyma się semver: wydania minor „may contain breaking changes”, a deprecacje robi się przez `@deprecated` ze stubem (`RELEASES.md:5-8`, np. `ShapeUtil.ts:58,63`) [E].

**Docelowy kształt:** typowany kontrakt wejścia (stała ścieżki + publiczny typ info, ewentualnie helper `startTranslating(editor, info)`).

### C3 — dwie ścieżki wywołania hooków `onTranslate*`

**Obecny kształt.** Dwie niezależne implementacje tego samego kontraktu.
- Gest woła hooki bezpośrednio w `TR`: `handleStart` `TR:262-290`, update `TR:356-373`, `handleEnd` `TR:292-327`, `cancel` `TR:237-247`. Pozycję liczy `moveShapesToPoint` [E].
- Ścieżka jednorazowa `getChangesToTranslateShape` (`E:7018-7044`) woła start→translate→end na kopii roboczej, a wrapper `…ByPageDelta` (`E:7052-7055`) obraca deltę do układu rodzica. Obie ścieżki **nie dzielą kodu** [E].
- Translate jest jedyną z trzech transformacji, w której gest i API edytora mają osobne implementacje. Rodzeństwo już to ujednoliciło [E]:
  - **Rotacja:** `applyRotationToSnapshotShapes({stage: 'start'|'update'|'end'|'one-off'})` (`editor/src/lib/utils/rotation.ts:57-67`, `:103-111`) używają zarówno gest (`Rotating.ts:62-66`), jak i `rotateShapesBy` (`E:7007-7011`).
  - **Resize:** gest woła `editor.getResizeShapePartial(..., {skipStartAndEndCallbacks: true})` (`Resizing.ts:448`), a ścieżka edytora ma te same callbacki za flagą (`E:8232`, `E:8261`).
- ASU trzyma stan między startem a końcem w `WeakMap` (`ASU:1257`, zapis `ASU:599`, odczyt `ASU:645`). Komentarz `ASU:647-650` wprost obsługuje kopię roboczą z nudge/align/distribute [E].
- `ASU.onTranslateStart` pisze do store bezpośrednio (`removeArrowBinding` `ASU:567-572`, `updateArrowTerminal` `ASU:612-627`, `updateBinding` `ASU:629-636`), choć kontrakt mówi „returns a change” (`ShapeUtil.ts:845-852`) [E]. W ścieżce jednorazowej kopia robocza powstaje sprzed tych zapisów, więc `nudgeShapes` może nadpisać zapis terminala (`E:7070-7077`) [I/U, nieuruchamiane].

**Intencjonalność.** Sama ścieżka jednorazowa jest świadoma, a rozjazd semantyki obu ścieżek to przypadkowa złożoność, która już raz dała błąd.
- 231354d (#2424, „Maintain bindings whilst translating arrows”) wprowadził `getChangesToTranslateShape` zamiast rozsianych wywołań samego `onTranslateStart` [E].
- 130dc8016 (#10734) dodał wrapper: „a fix to the parent-space translate had to be pasted into seven places”. Potwierdził też, że `todo` z `E:7050-7051` „is still live” [E].
- cb0a69ef2 (#10198) jest fixem wprost z rozjazdu: „For a one-off move the shape record passed in is a working copy, so the halving gave half the real delta” [E].
- W historii tej ścieżki są co najmniej 2 fixy (#5479, #10198) i 1 refaktor (#10734); to dolne oszacowanie z blame [E].

**Wykonalność.**
- Obie metody edytora są prywatne (`E:7019`, `E:7052`), więc API się nie zmienia. Publiczny jest kontrakt hooków (`ShapeUtil.ts:852-881`) [E].
- Blast radius: 7 metod w `E` (`:7076`, `:7714`, `:7830`, `:7910`, `:7982`, `:8033`, `:8100`), 1 util w rdzeniu (ASU) i 5 przykładów z hookami (prior) [E].
- Testy 7 metod (grep):
  - wiązania strzałek sprawdzają tylko `stackShapes.test.ts:146` i `resizeToBounds.test.tsx:143,194` [E];
  - `nudge`, `pack`, `align` i `distribute` nie mają asercji o strzałkach; `stretch` rysuje strzałkę bez asercji na wiązaniach [E];
  - żaden test nie sprawdza kolejności ani liczby wywołań hooków w trybie jednorazowym [I].
- Wzorzec testu kontraktu już istnieje: `shapeutils.test.ts:357-396` loguje wywołania hooków gestu w tablicy `calls` [E].
- Koszt: testy **S**; ujednolicenie **M**, bo zmienia taktowanie hooków widziane przez zewnętrzne utile, czyli zachowanie publicznego kontraktu [I].

**Docelowy kształt:** jedna implementacja przesunięcia z etapem (`start|update|end|one-off`), wspólna dla gestu i 7 metod edytora, tak jak w rotacji.

### C4 — reguły strzałki w `ASU.onTranslateStart` (stop: domena)

- **Kształt:**
  - decyzja zapada wyłącznie w ASU i czyta *globalne zaznaczenie* (`getSelectedShapeIds`, `isAncestorSelected`, `ASU:582-594`; elbow: `getOnlySelectedShapeId`, `ASU:562`); `isPrecise:true` jest wymuszane w `ASU:629-636` i `ASU:676-683` [E];
  - w ścieżce jednorazowej zbiór przesuwanych kształtów może różnić się od zaznaczenia [I].
- **Intencjonalność:** świadoma decyzja.
  - Reguła „bound shape in selection → do nothing” pochodzi z 29ed921 (2023-04, sprzed publicznego repo, uzasadnienie nieznane [U]).
  - Wariant z przodkiem dodał da35f2b (#3326 „Bindings”).
  - `isPrecise` to funkcja z #2424: „updates the binding to a precise one at that location rather than removing the binding entirely” [E].
- **Stop.** Prawdziwa naprawa wymaga odpowiedzi na pytanie domenowe, a nie strukturalne: co znaczy „strzałka przesuwana razem z celem” i czy wyznacza to zaznaczenie, czy zbiór przesuwanych kształtów. To przedmiot późniejszej analizy domenowej (M4L5). [I]
- **Guard:** test w `arrows-megabus.test.tsx` (strzałka + grupa zawierająca cel, obie zaznaczone → wiązanie zostaje). Istniejące asercje `isPrecise`: `:652-653`, `:688-689` [E].

### C5 — kolejność efektów ubocznych

- **Kształt:** procedura z niejawnym stanem współdzielonym przez domknięcie.
  - Są dwie rejestracje w konstruktorze: `registerOperationCompleteHandler` (`E:603-657`) i `sideEffects.register` (`E:660+`). Dzielą zbiory `invalidParents`, `deletedShapeIds`, `createdShapes`, `invalidBindingTypes`, `deletedBindings` (`E:596-600`) [E].
  - Kolejność wewnątrz handlera jest zaszyta jako procedura (`E:609-655`), a między handlerami wynika z kolejności rejestracji (`store/src/lib/StoreSideEffects.ts:388-393`, `:671-673`), bez priorytetów [E].
  - Obserwacja z prioru jest teraz [E]. `editor.run` → `history.batch` → `transact` (`E:1752-1756`, `HM:107-113`) nie otwiera `store.atomic`. Każdy `put` najwyższego poziomu otwiera własny atomic i na końcu woła `flushAtomicCallbacks` (`S:1308-1340`, pętla do głębokości 100 `S:1274-1303`).
- **Intencjonalność:** kolejność zaprojektowana świadomie.
  - #3748: „`onChildrenChange` is now called after each atomic store operation”, czyli celowe przeniesienie na koniec operacji [E].
  - Odpalanie efektów po każdym `put` w obrębie `run` to raczej skutek uboczny projektu. Zespół zostawił je jako otwarte pytanie w #9455: „Should we batch the changes in order to fire once is a follow-up question” [E].
  - Co najmniej 3 fixy w tym zakresie: #9455, #9456, #6232 [E].
- **Wykonalność:**
  - charakteryzacja **S**: `bindings.test.tsx:40-58` ma logujący `TestBindingUtil` i inline snapshoty kolejności, ale dla usuwania i kopiowania, nie dla gestu przesunięcia [E];
  - jakakolwiek zmiana kolejności to **L**, bo dotyczy rdzenia silnika i wszystkich 8 klas `BindingUtil` (prior) [I].

### C6 — kontrakt hooków / `onTranslateCancel` (nie-kandydat po badaniu)

- `onTranslateCancel` (`ShapeUtil.ts:881`) należy do symetrycznej rodziny `onResizeCancel` (`:843`), `onHandleDragCancel` (`:920`) i `onRotateCancel` (`:958`). Każdy z nich jest wołany w swoim stanie (`Resizing.ts:149`, `Rotating.ts:161`, `TR:245`) [E].
- Implementacje produkcyjne ma tylko `onHandleDragCancel` (3 szablony) [E, grep].
- 4446d5313 (#6489): „This is for completeness, but largely fell out of the needs of the workflow builder starter kit”, notka w `apps/docs/content/releases/v3.15.0.mdx:33` [E].
- Brak implementacji to zamierzony punkt rozszerzeń SDK, a nie martwy kod. Usunięcie łamałoby publiczne API (koszt M) i psuło symetrię rodziny [I].
- Komentarz `TR:279` o ponownym odczycie rekordów to ślad po fixie f510dc2 (#1886). Przyczyną są zapisy do store wewnątrz hooka w ASU, a ten problem należy do C3 [E]+[I].

### C7 — taktowanie DnD

- **Kształt:**
  - stałe modułowe `SLOW_POINTER_LAG_DURATION = 320` i `FAST_POINTER_LAG_DURATION = 60` (`DnD:14-15`); literały `> 10`, `% 3`, `> 0.5` (`DnD:89-101`) [E];
  - próg prędkości `0.5` powtarza się jako literał w 4 (raport: 3) miejscach: `DnD:94`, `TR:611`, `arrowTargetState.ts:201`, `DraggingHandle.tsx:361` [E, ast-grep];
  - interwał wybierany jest raz, przy starcie (`DnD:100`), a strażnik `DnD:38` sprawia, że ponowne wywołanie z `TR:345-349` nic nie robi [E].
- **Intencjonalność:**
  - dławienie przy szybkim ruchu jest świadome i obecne od początku: 29ed921 `LAG_DURATION = 100`, 41601ac (#3249) 20/100 [E];
  - obecne 60/320 i „2 z 3” pochodzą z 6fbbca54f (#6139): „Fixed bugs causing the drag and drop timer to run too often”; uzasadnienie konkretnych wartości [U];
  - późniejsze fixy timerów: #8777, #9458, #10171, #10782 [E].
- **Wykonalność:**
  - `dragAndDrop.test.ts` (9 testów) używa `vi.advanceTimersByTime(300)` (`:121`), ale nie ma przypadku z ponad 10 kształtami ani z prędkością [E, grep];
  - precedens wyniesienia progów do `editor.options` istnieje (`dragDistanceSquared`, `editor/src/lib/options.ts:299`) [E];
  - koszt **S** [I].

### C8 — `Translating.ts` jako hotspot i rodzeństwo gestów

- **Kształt:** stany gestów to klasy-procedury z kopiowanym szkieletem cyklu życia.
  - Rozmiary: TR 679, Resizing 721, Rotating 231 linii [E].
  - Każdy stan robi `extends StateNode` (`TR:36`, `Resizing.ts:37`, `Rotating.ts:19`). Wspólny jest tylko `GestureShapeChangeTracker` (`TR:54`, `Resizing.ts:58`, `Rotating.ts:31`) [E].
  - Ręcznie powtórzony szkielet: `onInteractionEnd` → `setCurrentToolIdMask` w `onEnter` (`TR:65-66`, `Resizing.ts:68-69`, `Rotating.ts:38-39`), obsługa `isToolLocked` w `complete` (`TR:218`, `Resizing.ts:182`; w Rotating jej brak (raport: `Rotating.ts:194-201`), tam `complete` obsługuje tylko `onInteractionEnd`, `Rotating.ts:194-201`) i `cancel` (`TR:250-258`, `Resizing.ts:155-162`, `Rotating.ts:166-173`) [E].
  - **Kopie się rozjechały.** TR woła `setCurrentTool(onInteractionEnd)` (`TR:219`, `:253`), a Resizing `(onInteractionEnd, {})` (`Resizing.ts:158`, `:183`). Te dwa wywołania są równoważne (domyślne `info = {}`, `E:1928`). Rotating przekazuje natomiast `this.info` (`Rotating.ts:169`, `:197`) [E]. Czy to celowe: [U].
  - `moveShapesToPoint` (`TR:565`) i `getTranslatingSnapshot` (`TR:454`) to już funkcje modułu, ale nie są czyste: czytają `editor.inputs`, `getInstanceState()` i `getDocumentSettings()` (`TR:576-592`) [E].
- **Intencjonalność:** przypadkowa złożoność narastająca przez kolejne fixy.
  - Linie: 417 (2023-11) → 510 (#3364) → 538 (#6139) → 553 (#6489) → 579 (#8421) → 642 (#9215) → 679 (HEAD) [E].
  - 39 commitów na obecnej ścieżce, z czego 9 ma „fix” w temacie [E].
  - Zespół już spłaca ten dług. e8f61aced (#9215) wydzielił `GestureShapeChangeTracker` dla translate, resize, rotate i crop: „share the same pattern and the same failure”. To tłumaczy współzmiany TR z Resizing/Rotating z prioru [E]. 5a02fc8ba (#10193) usunął martwy stan i zduplikowane helpery [E].
- **Wykonalność:**
  - zmiana wewnętrzna w `packages/tldraw`: ani `moveShapesToPoint`, ani `TranslatingInfo` nie są w publicznym `index.ts` [E];
  - `moveShapesToPoint` nie ma testu bezpośredniego; pośrednio chroni ją ~35 testów przyciągania, siatki i Shift (`translating.test.ts:468-1649`, `frames.test.ts:614-678`) [E, prior];
  - gałęzie strażnicze z N1 nie mają testów, a to one decydują o bezpieczeństwie [E, prior];
  - koszt pełnego rozbicia TR **M–L**; wspólnego szkieletu cyklu życia **M** (3 pliki, bez API) [I].

### C9 — cykle importów (korekta mapy, nie refaktor)

- `arrowTargetState.ts:22` ma `import { ArrowShapeUtil }`, ale jedynym użyciem jest argument typu `getShapeUtil<ArrowShapeUtil>` (`:112`); pochodzi z 2c1fb1a (#5572) [E].
- `utils/reparenting.ts:4` ma `import { Editor }`, a `Editor` występuje tylko w adnotacjach (`:17`, `:157`, `:211`); pochodzi z 6fbbca5 (#6139) [E].
- W tsconfigach `packages/*` nie ma `verbatimModuleSyntax` ani `preserveValueImports` [E], więc te krawędzie znikają przy kompilacji [I, nie sprawdzono bundla].
- `internal/scripts/check-circular-deps.ts:158-168` kończy się `exit(1)` przy każdym wykrytym cyklu, bez listy wyjątków [E]. Czy przechodzi na HEAD: [U].
- Werdykt: przypadkowe, ale tanie (**S**): zamiana na `import type` i jedno uruchomienie skryptu. To weryfikacja mapy, nie refaktor struktury [I].

## Refactor opportunities (ranked)

### ① C3 — jedna implementacja przesunięcia dla gestu i metod edytora

- **Obecny → docelowy kształt.** Dziś gest (`TR:262-373`) i jednorazowa ścieżka (`E:7018-7055`) to dwie niezależne implementacje kontraktu `onTranslate*`. Docelowo powstaje jeden helper z etapem `start|update|end|one-off`, tak jak `applyRotationToSnapshotShapes` (`rotation.ts:67`), którego używają gest i 7 metod edytora.
- **Dlaczego 1. miejsce (koszt długu vs koszt zmiany).**
  - Dług ma udokumentowane odsetki: fix #10198 wynika wprost z rozjazdu ścieżek, a #10734 opisuje poprawkę wklejaną w 7 miejsc. `todo` `E:7050` nadal jest żywe.
  - Jest też niewyjaśnione ryzyko: możliwe nadpisanie zapisu terminala strzałki w trybie jednorazowym (C3 [U]).
  - Zmiana jest prywatna dla `Editor.ts` i ma gotowy wzorzec u rodzeństwa, więc nie trzeba wymyślać nowej abstrakcji.
- **Blast radius.** 7 metod w `E` (`:7076`, `:7714`, `:7830`, `:7910`, `:7982`, `:8033`, `:8100`), gest w `TR`, `ASU` (WeakMap `ASU:1257`, zapisy w hooku `ASU:567-636`) i 5 przykładów z hookami. Kontrakt `ShapeUtil.ts:852-881` jest publiczny, więc zmiana taktowania to zmiana zachowania widziana przez zewnętrzne utile.
- **Szkic inkrementalnej ścieżki.**
  1. Test kontraktu: sekwencja i liczba hooków w trybie jednorazowym dla 7 metod, bez edycji `Editor.ts`.
  2. Test strzałki zaznaczonej bez celu przy nudge/align (`isPrecise` i odpięcie). Rozstrzyga też [U] o nadpisaniu terminala.
  3. Wydzielenie helpera z etapem za istniejącym wrapperem `…ByPageDelta`, który jest już jedynym punktem wejścia 7 metod (Branch by Abstraction na prywatnym szwie).
  4. Przepięcie gestu w `TR` na helper (osobny commit).
  5. `todo` z N4 zostaje osobną zmianą zachowania.
- **Pierwszy krok-prerekwizyt.** Test charakteryzujący w `packages/tldraw/src/test/shapeutils.test.ts`, wzorem `:357-396`: `it.each` po 7 metodach, z oczekiwanym logiem `calls == ['start','change','end']` w jednym wywołaniu.

### ② C1+C2 — typowany kontrakt wejścia w `select.translating`

- **Obecny → docelowy kształt.** Dziś integratorzy wchodzą w stan stringiem i `info: any`, a kontrakt opisuje proza w przykładzie (#7143). Docelowo `TranslatingInfo` jest publiczny i jest stała/helper wejścia. Opcjonalnie dochodzi przeciążenie `setCurrentTool` z typem.
- **Dlaczego 2. miejsce.**
  - Wzorzec jest świadomie wypchnięty do integratorów (decyzja nośna, której nie ruszamy). Za to brak typu ma potwierdzony koszt: fix #10190, czyli zawieszone narzędzie przy `isCreating` bez `onCreate`.
  - Pierwszy krok jest najtańszy w całym rankingu: addytywny eksport (**S**).
  - Niżej niż C3, bo bolesna literówka w ścieżce nie wystąpiła w historii, a pełne typowanie ścieżek to konwencja całego kodu (`select.idle` 44 literały), więc zakres łatwo się rozlewa.
- **Blast radius.** 9 wejść w 9 plikach, 6 poza `packages/tldraw`. Dochodzi `tldraw/api-report.api.md`, a przy przeciążeniu także `editor/api-report.api.md`.
- **Szkic inkrementalnej ścieżki.**
  1. Test charakteryzujący wejścia z `info`.
  2. Eksport `TranslatingInfo` (addytywny) i regeneracja api-report.
  3. Przepięcie 9 wywołań na typ (`satisfies TranslatingInfo`), osobno rdzeń i osobno pakiety zewnętrzne.
  4. Opcjonalnie helper/stała i `@deprecated`-free przeciążenie.

  Stringów `select.*` w innych stanach nie ruszamy.
- **Pierwszy krok-prerekwizyt.** Test w `packages/tldraw/src/test/translating.test.ts`: `setCurrentTool('select.translating', {isCreating: true, onCreate, onInteractionEnd})` kończy w `isIn('select.translating')`, a nieznana ścieżka rzuca (`SN:140-152`).

### ③ C8 (zawężone) — wspólny szkielet cyklu życia stanów gestu

- **Obecny → docelowy kształt.** Dziś Translating, Resizing i Rotating ręcznie powtarzają obsługę `onInteractionEnd`/`isToolLocked`/cancel i te kopie już się rozjechały (`Rotating.ts:169,197` vs `TR:219,253`). Docelowo jeden współdzielony helper cyklu życia gestu, wzorem `GestureShapeChangeTracker`. **Nie** pełne rozbicie `TR`.
- **Dlaczego 3. miejsce.**
  - Złożoność jest przypadkowa i rośnie (417 → 679 linii, 9 fixów), a zespół już idzie tą drogą (#9215, #10193), więc kierunek ma precedens.
  - Niżej, bo bez testów gałęzi strażniczych (N1) zmiana jest ryzykowna, a rozjazd w Rotating to [U]: może być celowy.
  - Pełna dekompozycja `moveShapesToPoint` ma największą powierzchnię zachowań przy najmniejszym udokumentowanym koszcie błędów.
- **Blast radius.** 3 pliki w `packages/tldraw` (wewnętrzne, bez API). Pośrednio `onInteractionEnd` z przykładów i z #6919.
- **Szkic inkrementalnej ścieżki.**
  1. Testy gałęzi strażniczych z N1 (`isToolLocked` `TR:218`, brak zaznaczenia `TR:59-61`, limit przy klonowaniu `TR:169`).
  2. Test `onInteractionEnd` (string i callback) dla wszystkich trzech stanów, który utrwala obecny rozjazd.
  3. Wydzielenie helpera i przepinanie stanu po stanie (Strangler, osobne commity).
  4. Decyzja, czy ujednolicić rozjazd z Rotating, jako osobna zmiana zachowania.
- **Pierwszy krok-prerekwizyt.** Testy gałęzi strażniczych w `packages/tldraw/src/test/translating.test.ts`.

### Rozważone i odrzucone

| Kandydat | Dlaczego nie (jako refaktor) | Co zamiast |
|---|---|---|
| C4 reguły strzałki w ASU | Świadoma decyzja (#2424, #3326). Prawdziwa naprawa to pytanie domenowe (zaznaczenie vs zbiór przesuwanych kształtów) | Analiza domenowa (M4L5); guard: test w `arrows-megabus.test.tsx` |
| C5 kolejność efektów | Zaprojektowana (#3748); zmiana to L w rdzeniu i 8 `BindingUtil`; batchowanie to otwarte pytanie zespołu (#9455) | Guard: inline snapshot logu `calls` dla gestu przesunięcia w grupie w `bindings.test.tsx` |
| C6 `onTranslateCancel` | Zamierzony punkt rozszerzeń „for completeness” (#6489), rodzina 4 hooków; usunięcie łamie API | Przeniesiony do nie-kandydatów; test kontraktu już jest |
| C7 taktowanie DnD | Świadome dławienie wydajnościowe od pierwszej wersji; 1 plik | Guard: test 11 kształtów (60 vs 320 ms) i pomijania klatek w `dragAndDrop.test.ts`; opcjonalnie wspólna stała progu 0.5 |
| C9 cykle importów | Krawędzie powrotne użyte tylko jako typ; w runtime pętli najpewniej nie ma | Korekta mapy; `import type` + `pnpm check-circular-deps` jako weryfikacja |
| C1 pełne typowanie wszystkich ścieżek `select.*` | Konwencja całego kodu (≥ 129 literałów w produkcji), poza przepływem | Zawężone do ② (tylko `select.translating`) |
| C8 pełne rozbicie `TR` / czysta `moveShapesToPoint` | Największa powierzchnia zachowań, brak testu bezpośredniego, dług częściowo spłacany | Zawężone do ③; ewentualnie później |

Guardy z tabeli (C4, C5, C7) są tanie, addytywne i niezależne od rankingu.

## Weryfikacja twierdzeń (ast-grep)

ast-grep 0.51.1 (natywny `ast-grep.exe`), uruchamiany osobno dla `-l ts` i `-l tsx` na HEAD `844f6f484`. Tam, gdzie twierdzenie dotyczy produkcji, odfiltrowano testy (`.test.`, `/test/`, `e2e`). Każde zero potwierdzono grepem. Skrypt: `scratchpad/verify/sg.mjs`.

**Wpadka narzędziowa (zanotowana jako lekcja):** pierwsze przejście dało **0 trafień we wszystkich 27 sprawdzeniach**. Skrypt Node wołał `execFileSync('ast-grep')`, a na Windowsie nie uruchamia to shima npm `.cmd`; `catch` po cichu zamieniał błąd w `[]`. Po przełączeniu na natywny plik `.exe` i rzucaniu błędu zamiast `catch` wyniki są poprawne. Bez reguły „każde zero potwierdź grepem” raport dostałby 27 fałszywych „brak wystąpień”.

| # | Twierdzenie | Werdykt | Dowód (plik:linia) | Metoda |
|---|---|---|---|---|
| A1 | Wrapper `…ByPageDelta`: 7 wywołań w `Editor.ts` | **potwierdzone** | `E:7076, 7714, 7830, 7910, 7982, 8033, 8100` | `this.getChangesToTranslateShapeByPageDelta($$$A)` |
| A2 | `getChangesToTranslateShape`: 1 wywołanie bezpośrednie (we wrapperze) | **potwierdzone** | `E:7054` | `this.getChangesToTranslateShape($$$A)` |
| A3 | Gest (`TR`) nie woła ścieżki jednorazowej | **potwierdzone** (zero) | 0 trafień; grep `getChangesToTranslateShape` w `TR`: 0 | `property_identifier` regex `^getChangesToTranslateShape` |
| A4 | `applyRotationToSnapshotShapes` współdzielony przez gest i `rotateShapesBy` (`stage: 'one-off'`) | **potwierdzone** | `E:7007` (`one-off`), `Rotating.ts:62, 124, 183` | `applyRotationToSnapshotShapes($$$A)` |
| A5 | Gest Resizing wywołuje ścieżkę edytora z `skipStartAndEndCallbacks: true` | **potwierdzone** | `Resizing.ts:448`, `Resizing.ts:436` (`getResizeShapePartial`); `E:8376` | `pair` z kluczem `skipStartAndEndCallbacks`; `$O.getResizeShapePartial($$$A)` |
| B1 | `ASU.onTranslateStart` zapisuje do store bezpośrednio | **potwierdzone** (5 zapisów) | `ASU:569, 573` (`removeArrowBinding`), `ASU:614, 623` (`updateArrowTerminal`), `ASU:635` (`updateBinding`) | `call_expression` `inside: method_definition name=onTranslateStart` |
| B2 | Stan między startem a końcem w `WeakMap` (`ASU:1257`) | **potwierdzone** | `ASU:1257` | `const shapeAtTranslationStart = new WeakMap<$$$T>()` |
| B3 | `isPrecise: true` w `onTranslateStart` i `onTranslate` | **potwierdzone** | `ASU:637`, `ASU:683` | `pair` `isPrecise: true` `inside` metody `onTranslate(Start)?` |
| C1 | `setCurrentTool('select.translating', …)`: 9 prod. w 9 plikach, 6 poza `packages/tldraw` | **potwierdzone** | rdzeń: `PointingHandle.ts:140`, `note/toolStates/Pointing.ts:90`, `useTools.tsx:461`; poza: `collections/…/use-item-drag.ts:61`, `templates/workflow/…/useDragToCreate.ts:104`, `InteractionEndExample.tsx:29`, `StickerExample.tsx:205`, `PinExample.tsx:322`, `CubicBezierShapeExample.tsx:241` | `$E.setCurrentTool('select.translating', $$$A)` |
| C2 | Literały `select.*` w prod `tldraw/src/lib`: 129 | **doprecyzowane: 57** (25/9/7/5/6/5) | lista w C1+C2 powyżej; grep na literałach w cudzysłowie: 57 | `'select.X'` jako wzorzec literału + grep `['"]select\.X['"]` |
| C3 | `TranslatingInfo`/`ResizingInfo` poza `tldraw/src/index.ts` | **potwierdzone** (zero) | 0 trafień; grep w `index.ts`: 0 | `identifier` regex `^(TranslatingInfo\|ResizingInfo)$` |
| C4 | Oba typy są eksportami modułów | **potwierdzone** po poprawce wzorca | `TR:28`, `Resizing.ts:27` | `export interface …` dał 0 (fałszywe zero, grep pokazał `export type`); poprawione na `export type $N = $T` |
| D1 | `setCurrentTool(onInteractionEnd…)`: TR bez info, Resizing `{}`, Rotating `this.info` | **potwierdzone** | `TR:219, 253`; `Resizing.ts:158, 183`; `Rotating.ts:169, 197` | dwa wzorce: z `$$$A` i jednoargumentowy |
| D2 | Każdy stan gestu `extends StateNode`, brak wspólnej bazy | **potwierdzone** | `TR:36`, `Resizing.ts:37`, `Rotating.ts:19` | `class $C extends StateNode { $$$B }` |
| D3 | `GestureShapeChangeTracker` w TR, Resizing, Rotating (+ crop) | **potwierdzone** (5 prod.) | `TR:54`, `Resizing.ts:58`, `Rotating.ts:31`, `TranslatingCrop.ts:26`, `Cropping.ts:34` | `new GestureShapeChangeTracker($$$A)` |
| D4 | `isToolLocked` obsługiwane w `complete` wszystkich trzech stanów | **obalone** | `TR:218`, `Resizing.ts:182`; Rotating: 0 trafień, grep `isToolLocked` w `Rotating.ts`: 0 | `property_identifier ^isToolLocked$` |
| E1 | Rodzina 4 hooków cancel w `ShapeUtil` | **potwierdzone** | `ShapeUtil.ts:843, 881, 920, 958` | `property_identifier` `inside: method_signature` |
| E2 | Implementacje `on*Cancel` poza testami: tylko `onHandleDragCancel` (3 szablony) | **potwierdzone** | `templates/workflow/…/ConnectionShapeUtil.tsx:277`, `templates/image-pipeline/…:289`, `templates/branching-chat/…:220`; grep `on(Translate\|Resize\|Rotate)Cancel(` poza testami i deklaracjami: 0 | `method_definition` name regex |
| F1 | Próg prędkości `0.5` jako literał w 3 miejscach | **doprecyzowane: 4** | `DnD:94`, `TR:611`, `arrowTargetState.ts:201`, `DraggingHandle.tsx:361` (ast-grep: 7 trafień = te 4 miejsca + zagnieżdżone `binary_expression`) | `binary_expression` regex `velocity … [<>] 0.5` |
| G1 | `arrowTargetState.ts`: `ArrowShapeUtil` użyty tylko jako typ | **potwierdzone** (zero użyć wartości) | wartość: 0; typ: `:112`; grep: tylko `:22` (import) i `:112` | `identifier` poza `import_specifier` vs `type_identifier` |
| G2 | `reparenting.ts`: `Editor` użyty tylko jako typ | **potwierdzone** (zero użyć wartości) | wartość: 0; typ: `:17, 157, 211`; grep: tylko `:4` (import) i te 3 | jw. |
| H1 | Wiązania strzałek w testach 7 metod tylko w `stackShapes` i `resizeToBounds` | **potwierdzone** | `createBindings` w `commands/`: `stackShapes.test.ts` 1, `resizeToBounds.test.tsx` 2 (pozostałe trafienia to `clipboard`/`deleteShapes`, spoza 7 metod) | `$E.createBindings($$$A)` |
| H2 | Wzorzec testu kontraktu hooków w `shapeutils.test.ts` | **potwierdzone** | `shapeutils.test.ts:361, 365, 369` (+ cancel) | `assignment_expression` left `\.onTranslate…` |

**Korekta z przeglądu planu (2026-11-10, `reviews/plan-review.md` F2):** H1 jest **obalone**. Weryfikacja przeszukała tylko `src/test/commands/`, a wiązania strzałek w ścieżce jednorazowej testuje też `packages/tldraw/src/lib/shapes/arrow/ArrowShapeUtil.test.ts:196` (nudge), `:216` (align), `:240` (distribute) i `:278` (grupa+nudge). Lekcja: zakres ścieżek wzorca to część twierdzenia; „tylko X” wymaga przeszukania całego obszaru testów (`src/test/` i `src/lib/**/*.test.*`).

**Wpływ na ranking** (sekcji „Refactor opportunities (ranked)” nie zmieniano):

- **②: liczba w uzasadnieniu.** Tekst „`select.idle` 44 literały” i wiersz „C1 pełne typowanie … (≥ 129 literałów)” w tabeli odrzuconych mają być 25 i 57. Argument „konwencja całego kodu” stoi dalej: 57 literałów w 25 plikach `lib/` plus pakiety zewnętrzne. Pozycji nie podważa.
- **③: obalone D4 wzmacnia kandydata.** Kopie szkieletu gestu rozjechały się w dwóch miejscach, nie w jednym. Rotating przekazuje `this.info` do `onInteractionEnd` i nie obsługuje `isToolLocked`. Czy to błąd (narzędzie zablokowane po obrocie wraca do `select.idle`?), czy celowe zachowanie, nie wiadomo. **Do decyzji na etapie planowania:** czy ③ ma wyższy koszt długu, niż zakłada ranking, i czy rozjazd w Rotating to osobna zmiana zachowania.
- **①: wszystkie twierdzenia strukturalne potwierdzone co do sztuki.** Dotyczy to A1–A5 i B1–B3. Dowód B1 (5 zapisów do store w hooku, który ma „zwracać zmianę”) jest teraz pełną listą linii. Otwarte pytanie o nadpisanie terminala w trybie jednorazowym zostaje [U] do testu.
- **C7 (odrzucony):** 4 zamiast 3 miejsc z progiem `0.5`. Opcjonalna wspólna stała jest nieco cenniejsza, werdykt bez zmian.

## Code References

- `packages/editor/src/lib/editor/Editor.ts:7018-7055` — ścieżka jednorazowa hooków przesunięcia + wrapper + `todo`
- `packages/editor/src/lib/utils/rotation.ts:57-111` — wzorzec `stage: 'one-off'` (rotacja)
- `packages/editor/src/lib/editor/Editor.ts:8226-8264`, `packages/tldraw/src/lib/tools/SelectTool/childStates/Resizing.ts:448` — wzorzec `skipStartAndEndCallbacks` (resize)
- `packages/tldraw/src/lib/tools/SelectTool/childStates/Translating.ts:28-34`, `:206-327` — `TranslatingInfo`, cykl życia gestu
- `packages/tldraw/src/lib/shapes/arrow/ArrowShapeUtil.tsx:559-688`, `:1257` — hooki strzałki, WeakMap
- `packages/editor/src/lib/editor/tools/StateNode.ts:140-166` — routing ścieżek stanów
- `packages/editor/src/lib/editor/Editor.ts:596-760` — rejestracja efektów ubocznych
- `packages/store/src/lib/Store.ts:1274-1346` — `flushAtomicCallbacks`
- `packages/tldraw/src/lib/tools/SelectTool/DragAndDropManager.ts:14-15`, `:88-101` — taktowanie
- `packages/tldraw/src/test/shapeutils.test.ts:357-396` — wzorzec testu kontraktu hooków
- `internal/scripts/check-circular-deps.ts:158-168` — bramka cykli w CI

## Architecture Insights

- Zespół spłaca dług gestów wzorcem „wyciągnij wspólny mechanizm do edytora” (rotacja: snapshot i etapy w `editor`; #9215: change tracker). Translate został w tyle i to jest naturalny kierunek dla ① i ③. [E]+[I]
- Publiczne kontrakty SDK (ścieżki stanów, `info`, hooki) są opisywane prozą w przykładach, a nie typami. Tam koncentrują się błędy integracji (#10190, #9225). [E]+[I]
- Repo ma silne bramki statyczne (typecheck, api-check, check-circular-deps). Długi, które przeżywają, to te, których bramki nie widzą: stringi, `any`, taktowanie, kolejność efektów. [I]

## Korekty prioru

| Twierdzenie z `selection-translate-flow/research.md` lub mapy | Werdykt |
|---|---|
| „WeakCache, `ASU:596`” | **doprecyzowane:** `WeakMap` (`ASU:1257`), zapis `ASU:599` |
| [I] efekty uboczne po każdym `put`, nie raz na `run` | **potwierdzone [E]:** `E:1752-1756`, `HM:107-113`, `S:1308-1340` |
| Mapa: cykle runtime `arrowTargetState ↔ ASU`, `Editor ↔ reparenting` | **doprecyzowane:** krawędzie powrotne użyte tylko jako typ; cykl w grafie importów, w runtime najpewniej brak [I] |
| ③6: `onTranslateCancel` bez implementacji jako dług | **obalone jako dług:** zamierzony punkt rozszerzeń (#6489) w rodzinie 4 hooków |
| ③3: „util trzymający stan musi działać w obu trybach; żaden test nie sprawdza” | **potwierdzone i wzmocnione:** fix #10198 wynikał dokładnie z tego |
| Współzmiany TR ↔ Resizing/Rotating jako „wspólny kod gestów” | **potwierdzone:** wspólny commit #9215 (GestureShapeChangeTracker) |

## Historical Context (from prior changes)

- `context/changes/selection-translate-flow/research.md`: prior tej zmiany (② i ③), czytany jako zebrane dowody.
- W `context/archive/` klonu tldraw nie ma wcześniejszych zmian (jest tylko `README.md`).
- ADR-ów w repo nie ma. Są `packages/{state,store,sync-core,validate}/SPEC.md` i `packages/state/ARCHITECTURE.md`; żaden nie omawia przepływu translate. Store SPEC opisuje semantykę `atomic`, istotną dla C5.

## Related Research

- `context/changes/selection-translate-flow/research.md`: Deep Focus (M4L3)
- `context/map/repo-map.md`: Mapa projektu (M4L2)

## Open Questions

- [U] Czy w trybie jednorazowym `nudgeShapes`/`alignShapes` nadpisuje zapis `updateArrowTerminal` zrobiony w `ASU.onTranslateStart` (C3). Rozstrzygnie to test z kroku 2 ścieżki ①.
- [U] Czy przekazywanie `this.info` przez Rotating do `onInteractionEnd` (`Rotating.ts:169,197`) jest celowe.
- [U] Czy `pnpm check-circular-deps` przechodzi na HEAD i jaki jest pełny skład 8-plikowego cyklu strzałek.
- [U] Uzasadnienie wartości 60/320 ms (#6139 go nie podaje).
- [U] Historia sprzed 29ed921 (2023-04, prywatne repo): pierwotne źródło reguły C4 i wzorca wejścia C1.
- Nic nie było uruchamiane (bez buildów i testów). Pickaxe `git log -S` w klonie blobless przerwano po ponad 3 minutach; zamiast niego użyto blame przez GitHub GraphQL i opisów PR-ów.
