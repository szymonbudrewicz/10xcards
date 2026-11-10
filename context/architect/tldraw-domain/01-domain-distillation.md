---
title: "Destylacja domeny: zaznaczenie, przesuwanie, strzałki i wiązania w tldraw"
created: 2026-11-10
type: domain-distillation
repository: tldraw/tldraw (lokalny klon, HEAD 844f6f484)
scope: "manipulacja kształtami: zaznaczenie, przesuwanie (gest i metody jednorazowe), strzałki, wiązania, grupy/rodzice w zakresie wpływu na strzałki"
method: "2 równoległe sub-agenty tylko do odczytu: (A) same dokumenty, (B) sam kod na ślepo, bez dostępu do dokumentów; synteza i weryfikacja cytatów w sesji głównej"
prior: "context/changes/refactor-opportunities/research.md — C4 odrzucony jako pytanie domenowe"
---

# Destylacja domeny: zaznaczenie, przesuwanie, strzałki i wiązania

Oznaczenia: **[E]** dowód (`plik:linia`, zweryfikowany w sesji głównej), **[I]** wniosek, **[U]** niewiadoma. Stałe identyfikatory: `T-` pojęcie, `B-` granica kontekstu, `I-` niezmiennik, `D-` rozjazd, `Q-` pytanie.

Skróty (względem `packages/`): `ASU` = `tldraw/src/lib/shapes/arrow/ArrowShapeUtil.tsx`, `ABU` = `tldraw/src/lib/bindings/arrow/ArrowBindingUtil.ts`, `SH` = `tldraw/src/lib/shapes/arrow/shared.ts`, `ATS` = `tldraw/src/lib/shapes/arrow/arrowTargetState.ts`, `TR` = `tldraw/src/lib/tools/SelectTool/childStates/Translating.ts`, `ED` = `editor/src/lib/editor/Editor.ts`, `SU` = `editor/src/lib/editor/shapes/ShapeUtil.ts`, `BU` = `editor/src/lib/editor/bindings/BindingUtil.ts`. Dokumenty: `SF/` = `apps/docs/content/sdk-features/`, `R/` = `apps/docs/content/releases/`.

## Krok 0: kontekst projektu

- **Brak PRD.** tldraw nie ma dokumentu wymagań w sensie 10xDevs. Jako materiał źródłowy służą:
  - dokumentacja SDK (`SF/*.mdx`, statusy `published`; wyjątek: `SF/arrow-shape.mdx` ma `status: draft`);
  - `README.md` i `AGENTS.md`;
  - noty wydań (`R/*.mdx`) i tematy commitów jako historia decyzji.

  To **ograniczenie**: „intencję produktu” odtwarzamy z dokumentacji API, a nie z wizji biznesowej.
- **Stack:** TypeScript i React. Pakiety tworzą warstwy:
  - `tlschema`: dane, walidatory, migracje;
  - `editor`: silnik, store, hooki `ShapeUtil`/`BindingUtil`;
  - `tldraw`: domyślne kształty, narzędzia, UI.
- **Logika biznesowa tego obszaru** żyje w `tldraw` (ASU, ABU, narzędzia), a orkiestracja w `editor` (`ED`). `tlschema` nie zawiera żadnych reguł zachowania (B: 4 pliki, same dane i migracje).
- **Metoda.** Agent A czytał tylko `.mdx`/`.md` i historię. Agent B czytał tylko kod (TSDoc dozwolony) i nie widział słownika z dokumentów. Zgodność poniżej jest więc wynikiem porównania, a nie echem wejścia.

## Krok 1: Ubiquitous Language

### 1a. Pojęcia

| ID | Pojęcie | Definicja | Źródło w dokumentach | W kodzie |
|---|---|---|---|---|
| T-01 | **Binding (wiązanie)** | Trwała, kierunkowa relacja dwóch kształtów, zapisana jako osobny rekord (`fromId`, `toId`, `props`), a nie pole kształtu | `SF/bindings.mdx:41` | `tlschema/src/bindings/TLBaseBinding.ts:63-67` |
| T-02 | **from / to** | Strzałka jest zawsze `from`, cel jest `to`. Kierunek decyduje, które hooki odpalają | `SF/bindings.mdx:41` | `ED:759-766` |
| T-03 | **Terminal** | Koniec strzałki (`start`/`end`). Na terminal przypada najwyżej jedno wiązanie | `SF/arrow-shape.mdx:90` | `TLArrowBinding.ts:60`; nadmiar sprzątany w `SH:184-187` |
| T-04 | **Związany terminal** | Pozycję liczy się z wiązania, a prop `start`/`end` jest ignorowany | `SF/arrow-shape.mdx:71` | `SH:144-162` |
| T-05 | **normalizedAnchor (kotwica)** | Punkt 0–1 w granicach geometrii celu | `SF/arrow-shape.mdx:98` | `TLArrowBinding.ts:65`; liczona w 3 miejscach: `ASU:668-673`, `ABU:160-163`, `ATS:350` |
| T-06 | **isPrecise** | `true`: celuj w kotwicę. `false`: celuj w środek | `SF/arrow-shape.mdx:99` | `SH:89-93` |
| T-07 | **isExact** | Grot wchodzi w kształt aż do kotwicy | `SF/arrow-shape.mdx:100` | `TLArrowBinding.ts:70` |
| T-08 | **Selection (zaznaczenie)** | `selectedShapeIds` stanu instancji strony; reszta jest z niego wyprowadzana | `SF/selection.mdx:26` | `ED:2153` |
| T-09 | **Translating (gest)** | Stan `select.translating`, gdy użytkownik przeciąga kształty | `SF/tools.mdx:42` | `TR` |
| T-10 | **Nudge i operacje układu** | Ruch klawiszami (`nudgeShapes`) oraz align/distribute/stack/pack/stretch/resizeToBounds | `SF/grid.mdx:62`; `SF/shape-transforms.mdx:23` | `ED:7068-7076`, `ED:7714-8100` |
| T-11 | **Shapes moving together (klaster)** | Kształty z **listy wejściowej** połączone rekurencyjnie wiązaniami strzałek. Poruszają się jako jedna jednostka | `SF/shape-transforms.mdx:130-132` | `ED:7478-7490` (`shapesMovingTogether`) |
| T-12 | **Moving shapes (gest)** | Zaznaczone kształty (bez potomków) w chwili startu przeciągania | — (dokumenty milczą) | `TR:455-463` |
| T-13 | **Isolation (izolacja)** | Rozdzielenie związanych kształtów (usunięcie, kopia, duplikat). Przed usunięciem wiązania zależny kształt „zapieka” swój stan | `SF/bindings.mdx:73-80` | `BU:104-121`, `ABU:111-125` |
| T-14 | **Unbind / remove binding** | Usunięcie wiązania terminala. W translate nie ma izolacji: `removeArrowBinding`, a pozycję wcześniej zamraża `updateArrowTerminal` | — | `SH:210`, `ASU:614-638`, `ASU:685-687` |
| T-15 | **canBind** | Weto obu kształtów przy tworzeniu i aktualizacji wiązania. Strzałka nie wiąże się z grupą ani ze strzałką | `SF/bindings.mdx:88`; `SF/groups.mdx:181` | `ASU:196-199`, `ED:6960-6978` |
| T-16 | **canBeLaidOut** | Weto udziału kształtu w operacji układu. Strzałka odmawia flipa, gdy jej celu nie ma w `shapes` | `SF/shape-transforms.mdx:101` | `ASU:219-229` |
| T-17 | **Reparent strzałki** | Wiązanie aktualizuje „pozycję i rodzica” strzałki | `SF/bindings.mdx:70` | `ABU:168-261` |
| T-18 | **Working copy (kopia robocza)** | Rekord w pamięci, na który ścieżka jednorazowa nakłada wyniki hooków. Zapis do store następuje na końcu | — (dokumenty milczą) | `ED:7019-7046`; komentarz `ASU:647-650` |

### 1b. „BRAK w kodzie” i „BRAK w dokumentach”

| Pojęcie | Status | Gdzie szukano |
|---|---|---|
| **„Strzałka przesuwana razem z celem”** jako nazwany byt, predykat lub typ | **BRAK w kodzie.** Istnieją dwa nienazwane predykaty (zob. B-01, D-02) | `grep -rn "MovingTogether\|movingTogether\|movesWith\|isMovingWith"`: tylko `ED:7478+` (klastry layoutu); ASU używa `getSelectedShapeIds` (`ASU:582`) |
| Reguła losu wiązania przy translate/nudge **samej strzałki** | **BRAK w dokumentach.** Mówią tylko, który hook odpala (`SF/bindings.mdx:43`) | `SF/bindings.mdx`, `SF/arrow-shape.mdx`, `SF/selection.mdx`, `SF/shape-transforms.mdx` |
| Moving shapes (gest) jako pojęcie | **BRAK w dokumentach** | `SF/tools.mdx`, `SF/selection.mdx`, `SF/drag-and-drop.mdx` |
| „Straight arrow” jako wartość `kind` | **BRAK w kodzie.** To stan pochodny łuku: `\|bend\| < 8*scale` (`SH:27-30`) | `TLArrowShape.ts:21,51` |

### 1c. Słowa wieloznaczne, czyli „3×Account” tej domeny

| ID | Słowo | Znaczenie w kontekście A | Znaczenie w kontekście B | Dowód |
|---|---|---|---|---|
| **B-01** | **selection** | **Kontekst interakcji (UI):** co użytkownik zaznaczył (`getSelectedShapeIds`) | **Kontekst transformacji:** zbiór kształtów, które w tej operacji się ruszają. W geście pokrywa się z A (`TR:458`); w metodach jednorazowych to parametr `ids` (`ED:7068`), a ASU i tak czyta A (`ASU:582`) | `ED:2153`; `TR:458`; `ASU:582-594` |
| B-02 | **translate** | Gest: wiele `onTranslate` na klatkę, zapis do store co klatkę (`TR:262-375`) | API jednorazowe: start→translate→end synchronicznie na kopii roboczej (`ED:7019-7046`) | jw. |
| B-03 | **precise / imprecise** | Prop wiązania: celuj w kotwicę lub w środek (`SF/arrow-shape.mdx:99`, `SH:89-93`) | Stan wejścia „użytkownik przeciąga precyzyjnie, np. Alt” (`SF/handles.mdx:77`). Do tego „imprecise = środek **lub krawędź**” (`SF/default-shapes.mdx:475`) | jw. |
| B-04 | **terminal** | Rola końca (dyskryminator wiązania) | Pozycja punktu (`props.start`) albo styl grotu | `TLArrowBinding.ts:60`; `SF/arrow-shape.mdx:53` |
| B-05 | **nudge** | Ruch klawiszami (`nudgeShapes`) | Wektor korekty ze snappingu (`snapData.nudge`) | `SF/grid.mdx:62` vs `SF/snapping.mdx:108-111` |
| B-06 | **isolate** | Izolacja przy usunięciu/kopii z hookiem „zapiekania” (`BU:104-121`) | Prywatne `withIsolatedShapes`: tymczasowe odcięcie przy kopii i eksporcie, cofane potem (`ED:11731-11770`) | jw. |

**B-01 to główna granica tego obszaru.** Słowo „zaznaczenie” w kodzie strzałek pełni podwójną rolę: stanu UI i zbioru przesuwanych kształtów. Kontekst *interakcji* (co widzi i wybrał użytkownik) i kontekst *transformacji* (co zmienia się w tej operacji) zlewają się w jednym wywołaniu `getSelectedShapeIds()`. Pozostałe kontrakty transformacji już je rozdzielają: `canBeLaidOut` (`ASU:224`), klastry (`ED:7478-7490`) i `withIsolatedShapes` (`ED:11749-11756`) pytają o zbiór operacji. [E]+[I]

## Krok 2: subdomeny

| Kategoria | Obszar | Uzasadnienie (cele produktu) |
|---|---|---|
| **Core** | Silnik płótna: model kształtów, hierarchia, zaznaczenie, **mechanizm wiązań** (`BindingUtil`, side effects) | „feature-complete infinite canvas engine designed to be the foundation for any canvas app” (`README.md:25`); `packages/editor` jako fundament (`AGENTS.md:22`) |
| **Core (dla użytkownika końcowego)** | Strzałki jako konektory, które **utrzymują połączenie**, gdy cokolwiek się rusza | Dla tablicy diagramowej to sens produktu. Dokumenty traktują strzałkę jako jedną z implementacji wiązań (`R/v2.2.0.mdx:27-29`), ale reguła T1 „relacje strzałek zostają nienaruszone” (`SF/shape-transforms.mdx:132`) to obietnica produktowa. [I] |
| **Supporting** | Operacje układu, snapping, siatka, drag-and-drop, ramki, blokada | Funkcje zbudowane na rdzeniu (`SF/shape-transforms.mdx:23`, `SF/snapping.mdx:22`) |
| **Generic** | Rich text (TipTap/ProseMirror), packing (potpack), reaktywność (`@tldraw/state`), store, walidacja | Zewnętrzne lub wewnętrzne biblioteki ogólnego przeznaczenia (`SF/rich-text.mdx:25`, `SF/shape-transforms.mdx:83`) |

Uwaga: strzałki są w SDK „Supporting”, a w produkcie tablicy „Core”. To nie błąd klasyfikacji. Te same pliki służą dwóm odbiorcom: deweloperowi SDK i użytkownikowi tablicy. [I]

## Krok 3: kandydaci na agregaty i niezmienniki

Kandydat: **Arrow Connection**, czyli strzałka razem z jej (≤2) wiązaniami terminali jako jedna granica spójności. Dziś to trzy osobne rekordy (kształt i 2 wiązania), a reguły są rozłożone na ASU, ABU, `SH` i `ED`.

| ID | Niezmiennik | Źródło | Status w kodzie |
|---|---|---|---|
| I-01 | Na terminal przypada najwyżej jedno wiązanie | `SF/arrow-shape.mdx:90` | **egzekwowany** (sprzątanie nadmiaru, `SH:184-187`) |
| I-02 | Związany terminal wynika z wiązania, a prop jest ignorowany | `SF/arrow-shape.mdx:71` | **egzekwowany** (`SH:144-162`) |
| I-03 | Wiązanie przeżywa ruch, resize i rotację celu | `SF/arrow-shape.mdx:71`; `SF/bindings.mdx:70` | **egzekwowany** (ABU, hooki `onAfterChangeToShape`) |
| I-04 | Brak wiązań między stronami; usunięty cel oznacza odpięcie z zapieczeniem punktu | `SF/bindings.mdx:32`, `:78` | **egzekwowany** (`ABU:280-293`, `ABU:111-125`) |
| I-05 | Strzałka nie wiąże się z grupą ani ze strzałką | `SF/groups.mdx:181` | **egzekwowany** (`canBind`, `ASU:196-199`) |
| **I-06** | **Gdy strzałka i jej cel poruszają się razem, wiązanie zostaje nienaruszone** | `SF/shape-transforms.mdx:132` (dla układu); dla translate brak dokumentu (G3) | **egzekwowany niespójnie**: translate definiuje „razem” przez **zaznaczenie** (`ASU:582-594`), layout i flip przez **zbiór operacji** (`ED:7478-7490`, `ASU:224-227`). `nudgeShapes(ids)` z `ids ≠ selection` daje wynik zależny od zaznaczenia [I, nieuruchamiane] |
| **I-07** | **Gdy strzałka rusza się bez celu, terminal zostaje związany (precyzyjnie), dopóki trafia w cel; poza celem odpina się z zachowaniem pozycji** | `R/v5.5.0.mdx:125` (pośrednio); historia: `231354d93` (#2424) | **gest: egzekwowany** (`ASU:596-687`). **Ścieżka jednorazowa: naruszany**: zamrożona pozycja jest nadpisywana kopią roboczą, więc po odpięciu `props.start` wraca do nieaktualnej wartości (potwierdzone sondą w M4L4, `refactor-opportunities/plan.md`, „Potwierdzony błąd”) |
| I-08 | Związane kształty aktualizuje się przez `BindingUtil`, a nie doraźną mutacją | `AGENTS.md:120-121` | **częściowo naruszany**: ASU zapisuje wiązania w hooku `onTranslateStart`, którego kontrakt to „zwróć zmianę” (`SU:845-852` vs `ASU:569-638`); `frames.ts:44-60` dubluje regułę reparentingu ABU |
| I-09 | Strzałka elbow przesuwana sama traci wiązania | — (dokumenty milczą); komentarz „we can't maintain the bindings well **just yet**” (`ASU:562`) | **egzekwowany, ale deklarowany jako tymczasowy** |

## Krok 4: rozjazdy MODEL vs KOD

| ID | Dokument mówi X | Kod robi Y | Dowód | Co naprawić |
|---|---|---|---|---|
| **D-01** | O losie wiązania decydują zmiany kształtów (hooki), usunięcie, kopia, zmiana strony i `canBind`; **zaznaczenie nie występuje** | W translate o losie wiązania decyduje **globalne zaznaczenie** (oraz zaznaczony przodek celu) | `SF/bindings.mdx:41-44`, `:70` vs `ASU:582-594` | **Decyzja właściciela (Q-01).** Żadna późniejsza decyzja nie dezaktualizuje dokumentu |
| **D-02** | „Ruszają się razem” = kształty z listy wejściowej połączone wiązaniami | Dwa predykaty tej samej reguły: zbiór operacji (layout/flip) oraz zaznaczenie (translate/nudge) | `SF/shape-transforms.mdx:130-132`; `ED:7478-7490`; `ASU:224-227` vs `ASU:582-594` | **Kod.** Jeden predykat „moving together” w kontekście transformacji; kierunek zależy od Q-01 |
| **D-03** | Od #2424 wiązanie przy translate jest **zachowywane** (precyzyjnie) | Komentarze opisują regułę z 2021 („deletes bindings on translation”): „If no bound shapes are in the selection, **unbind** any bound shapes” (`ASU:580-581`); test: „unbinds box1” przy asercji, że wiązanie zostaje (`ArrowShapeUtil.test.ts:199-204`, powtórzone w `:219`, `:246`) | `2673a97cc` (2021) → `231354d93` (#2424, 2024) | **Komentarze w kodzie** (późniejsza decyzja jest cytowalna) |
| D-04 | — (dokumenty milczą o translate i nudge samej strzałki) | Reguły I-07 i I-09 istnieją tylko w kodzie | `SF/bindings.mdx:43`; `ASU:561-687` | **Dokument**, po Q-01 |
| D-05 | „imprecise” = środek (`SF/arrow-shape.mdx:99`) / „środek **lub krawędź**” (`SF/default-shapes.mdx:475`) / „snap to the shape's edge” (`SF/bindings.mdx:61`) | `isPrecise:false` → kotwica `{0.5, 0.5}`, czyli środek | `SH:89-93` | **Dokument** (2 z 3 stron). Kod i `arrow-shape.mdx` są zgodne |
| D-06 | — | Parametr `forceImprecise` w rzeczywistości **wymusza precyzję** (`isPrecise \|\| forceImprecise`) | `SH:77`, `SH:89-91` | **Kod** (nazwa) |
| D-07 | Hook `onTranslateStart` „returns a change to apply” | ASU wykonuje w nim zapisy do store. W ścieżce jednorazowej kopia robocza je nadpisuje (I-07) | `SU:845-852` vs `ASU:569-638`; `ED:7019-7046` | **Kod** |
| D-08 | `packages/editor` to edytor „with no default shapes” | Generyczny `Editor` zna typ `'arrow'` (klastry layoutu, hit-test) | `AGENTS.md:22` vs `ED:7484`, `ED:7528`, `ED:5983` | **Decyzja właściciela** (klastry „przez wiązania strzałek” są udokumentowanym zachowaniem, `SF/shape-transforms.mdx:130`) |
| D-09 | Reparent strzałki należy do wiązania (`SF/bindings.mdx:70`) | Reguła powielona w narzędziu ramek | `ABU:168-261` vs `tldraw/src/lib/utils/frames/frames.ts:44-60` | **Kod** (niskie ryzyko, komentarz jest świadomy) |
| D-10 | — | Hooki izolacji nazwane od strony, która **zostaje**: usunięcie strzałki odpala `onBeforeIsolateToShape` | `ED:759-766` | **Dokument** (API publiczne; zmiana nazwy byłaby łamiąca) |

## Krok 5: ranking refaktoru

| # | Kandydat | Wartość | Ryzyko (słabość egzekwowania) | Gotowe, gdy… |
|---|---|---|---|---|
| **1** | **I-06 + I-07 → agregat Arrow Connection z jednym predykatem „moving together”** (D-01, D-02, D-07) | Najwyższa: obietnica „relacje strzałek zostają nienaruszone” (`SF/shape-transforms.mdx:132`) to sens konektorów | Najwyższe: dwa predykaty, jedna ścieżka narusza (błąd `{-999,-999}`), reguła siedzi w hooku per kształt, który czyta stan globalny | `rg "getSelectedShapeIds\|getOnlySelectedShapeId\|isAncestorSelected" packages/tldraw/src/lib/shapes/arrow/ArrowShapeUtil.tsx` zwraca **0** trafień w `onTranslateStart`, **oraz** test `nudgeShapes([arrow, box], …)` przy zaznaczeniu `[arrow]` daje to samo co przy zaznaczeniu `[arrow, box]`, **oraz** `it.fails` z M4L4 przechodzi na zwykłe `it` |
| 2 | I-08: aktualizacja wiązań tylko przez `BindingUtil` (D-07, D-09) | Średnia (spójność architektury) | Średnie | `ast-grep` dla `call_expression` wewnątrz `method_definition name=onTranslateStart` w ASU zwraca 0 zapisów do store |
| 3 | Język: D-03, D-05, D-06 | Niska wartość, niski koszt | Niskie, ale mylą ludzi i agentów | `rg -n "unbind any bound\|unbinds box1\|forceImprecise" packages/` zwraca 0; `rg -n "imprecise" apps/docs/content/sdk-features` daje jedną definicję |

**#1 do refaktoru: I-06/I-07.** To jednocześnie najbardziej rdzeniowa reguła (obietnica konektora) i najsłabiej egzekwowana (dwa predykaty plus potwierdzone naruszenie). Z kodu wychodzi dokładnie to, co M4L4 odłożył jako C4. Analiza domenowa zmienia jednak ramę pytania: to nie spór „zaznaczenie czy zbiór”, tylko **brak nazwanego pojęcia w kontekście transformacji** (B-01). Kod ma już połowę tego pojęcia jako `shapesMovingTogether` (`ED:7478`). [I]

### Pytania (rozstrzygnięcie w kilka minut)

| ID | Pytanie | Kto zna odpowiedź |
|---|---|---|
| **Q-01** | Czy zachowanie wiązania przy przesunięciu ma zależeć od tego, **co się rusza** (zbiór operacji), czy od tego, **co jest zaznaczone**? Czy istnieje przypadek UI, w którym zaznaczone ≠ przesuwane i obecne zachowanie jest celowe? | Maintainer strzałek i wiązań (autor #2424/#6050) |
| Q-02 | Czy odpinanie elbow przy samodzielnym przesunięciu (I-09, „just yet”) wciąż jest tymczasowe? | Ten sam maintainer |
| Q-03 | Czy pierwotna reguła „bound shape in selection → do nothing” z 29ed921 (2023-04, sprzed publicznego repo) miała uzasadnienie spoza wydajności? | Lider projektu |
| Q-04 | Która definicja „imprecise” jest kanoniczna dla dokumentacji (D-05)? | Maintainer dokumentacji |

## Podsumowanie

Artefakt zestawia słownik tldraw dla zaznaczenia, przesuwania, strzałek i wiązań z dwóch niezależnych przebiegów: samych dokumentów i samego kodu na ślepo. Obie strony zgadzają się co do rdzenia modelu: wiązanie to kierunkowy rekord per terminal, przeżywa ruch celu i znika przy izolacji. Najważniejszy rozjazd (D-01, D-02) dotyczy tego, kto decyduje o losie wiązania przy przesunięciu. Dokumenty nie wspominają o zaznaczeniu, a kod strzałek opiera decyzję właśnie na nim. Tymczasem layout, flip i izolacja w tym samym kodzie pytają o zbiór faktycznie przetwarzanych kształtów (`shapesMovingTogether`). „Zaznaczenie” jest więc w tej domenie słowem z dwoma kontekstami (B-01): interakcji i transformacji. Brakuje nazwanego pojęcia „przesuwane razem” po stronie transformacji. Ranking wskazuje I-06/I-07 jako #1, czyli dokładnie temat C4 z M4L4, teraz ze sprawdzalnym warunkiem „gotowe, gdy” i jednym pytaniem do właściciela (Q-01). Komentarze w kodzie wciąż opisują regułę z 2021 roku (D-03), co pokazuje, że język w tym miejscu dryfował razem z decyzjami.
