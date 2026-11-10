---
title: Niezmiennik #1 i agregat-strażnik — nienaruszalność zablokowanego poddrzewa kształtów (tldraw)
created: 2026-11-10
type: refactor-plan
---

# Niezmiennik #1 i agregat-strażnik: nienaruszalność zablokowanego poddrzewa

> Produkt: **plan** refaktoru, nie implementacja. Nie zmieniono kodu produkcyjnego.
> Repo: tldraw SDK, HEAD `844f6f484`. Zakres: manipulacja kształtami (zaznaczenie, gest SelectTool,
> nudge/align/distribute/stack/pack/stretch/resizeToBounds), strzałki i wiązania, grupy/rodzice/ramki,
> kształty zablokowane.
> Wszystkie cytaty `plik:linia` sprawdzono na HEAD. Twierdzenia oznaczone **[hipoteza]** wynikają z
> lektury kodu i nie zostały potwierdzone w działaniu. Faza 0 ma je potwierdzić testami
> charakteryzującymi.

## Krok 0. Kontekst

### Dokumenty wymagań (ograniczenie)

Projekt nie ma PRD ani `tech-stack.md`. Ich rolę pełnią:

- dokumentacja SDK `apps/docs/content/sdk-features/*.mdx` (tu: `locked-shapes.mdx`, `bindings.mdx`,
  `groups.mdx`, `parenting.mdx`, `selection.mdx`),
- `README.md`, `AGENTS.md`,
- noty wydań `apps/docs/content/releases/*.mdx`,
- rejestr kontraktów publicznego API `packages/*/api-report.api.md`.

Te dokumenty opisują zachowanie, a nie cele biznesowe. O tym, jak rdzeniowa jest dana reguła (oś a),
wnioskuję więc z obietnic złożonych integratorom SDK, a nie z wizji produktu. To ograniczenie całej
analizy.

### Stack i warstwy, w których żyje logika

TypeScript, monorepo pnpm, Vitest. Podział pakietów: `AGENTS.md:22-24`.

| Warstwa w języku zadania | Odpowiednik w tldraw | Gdzie |
| --- | --- | --- |
| Persystencja / baza | `Store` (reaktywna baza rekordów) + walidatory schematu | `packages/store`, `packages/tlschema` |
| Wyzwalacze / ograniczenia DB | side effects store'a (`beforeCreate/beforeChange/beforeDelete/after*`) | `packages/editor/src/lib/editor/Editor.ts:660-800` |
| Transakcja | `editor.run()` → `history.batch()` → `store.atomic()` → `transaction()` z `@tldraw/state`. Wyjątek przerywa transakcję (`txn.abort()`) | `Editor.ts:1752-1761`, `packages/store/src/lib/Store.ts:1308`, `packages/state/src/lib/transactions.ts:268-291` |
| „Serwer” / serwis domenowy | klasa `Editor` (publiczne komendy: `updateShapes`, `deleteShapes`, `reparentShapes`, komendy układu…) | `packages/editor` |
| Warstwa aplikacji | narzędzia i ich stany (SelectTool, Translating, DragAndDropManager), `ShapeUtil`/`BindingUtil` domyślnych kształtów | `packages/tldraw/src/lib/tools`, `…/shapes`, `…/bindings` |
| Klient / UI | akcje i predykaty menu, nakładki zaznaczenia | `packages/tldraw/src/lib/ui`, `…/overlays` |

**Tłumaczenie pojęć.** Słowo „serwer” w tym dokumencie oznacza warstwę `Editor` w `packages/editor`,
czyli jedyną bramę, przez którą przechodzą wszystkie zmiany (UI, narzędzia, kod integratora).
„Transakcja” to najbardziej zewnętrzne `editor.run(...)`. Wyjątek rzucony w jej wnętrzu odrzuca
wszystkie zmiany atomów (`transactions.ts:279-281`). „Klient” to `packages/tldraw/src/lib/ui` i stany
narzędzi.

## Krok 1. Niezmienniki biznesowe (kandydaci)

| ID | Niezmiennik | Źródło (dokument) | Źródło (kod) |
| --- | --- | --- | --- |
| **I1** | **Kształtu zablokowanego, ani kształtu, którego przodek jest zablokowany, nie da się przesunąć, zmienić, usunąć, zduplikować, zgrupować ani przenieść w hierarchii zwykłą operacją. Wyjątkiem jest operacja odblokowania albo jawne `ignoreShapeLock`.** | `locked-shapes.mdx:20`, `:57-68`, `:72-81`, `:85-100`; `packages/editor/src/lib/options.ts:178-179` („editor's lock guards still prevent moving, resizing, editing, or deleting them”); `releases/v2.4.0.mdx:101`, `releases/v3.14.0.mdx:26` | `Editor.ts:5782-5787`, `:9063-9078`, `:9127-9131`, `:8783-8789` |
| I2 | Hierarchia rodzic–dziecko jest drzewem. Kształt nie jest swoim rodzicem ani przodkiem. | `parenting.mdx:76` | `Editor.ts:6551-6553` (rzuca błąd przy reparentingu do siebie), `BaseFrameLikeShapeUtil.tsx:105-106` (ochrona przed wpięciem w potomka, tylko w geście) |
| I3 | Wiązanie łączy dwa istniejące kształty z tej samej strony. Usunięcie kształtu albo przeniesienie go na inną stronę rozwiązuje wiązanie, a końcówka strzałki zostaje w spójnym miejscu. | `bindings.mdx:41`, `:82`, `:88` | `Editor.ts:748-774` (beforeDelete usuwa wiązania), `Editor.ts:6835-6845` (create pomija brakujące kształty), `ArrowBindingUtil.ts:280-298` |
| I4 | Grupa nie bywa zdegenerowana: przy zera dzieciach znika, przy jednym się rozpuszcza. | `groups.mdx:128-132` | `onChildrenChange` grupy (nie cytuję linii, poza wybranym zakresem) |
| I5 | Komenda układu przesuwa każdy kształt dokładnie raz, a kształty połączone strzałkami przesuwa razem (klaster). | sdk-features nie opisuje tej reguły | `Editor.ts:7438-7500` (klastry), `Editor.ts:7048-7051` (**jawne TODO: kształt układany razem z rodzicem przesuwa się dwa razy**) |
| I6 | W trybie readonly żadna mutacja dokumentu nie dochodzi do store'a. | `readonly.mdx` | `Editor.ts:9088-9089`, `:6836`, `:6877` |
| I7 | Zaznaczenie zawiera tylko kształty bieżącej strony. Po przeniesieniu kształtu na inną stronę stan strony jest czyszczony. | `selection.mdx` | `Editor.ts:719-733` |

## Krok 2. Klasyfikacja i wybór #1

Oś (a): jak rdzeniowa jest reguła. Oś (b): ile plików i warstw ją niesie. Oś (c): czy jest egzekwowana.

| ID | (a) rdzeniowość | (b) rozsmarowanie | (c) egzekwowanie |
| --- | --- | --- | --- |
| **I1** | **Wysoka.** Jedyna reguła manipulacji, którą SDK obiecuje integratorom wprost, w dokumentacji i w JSDoc opcji publicznej (`options.ts:178-179`). Ma własny kontrakt w API: `isShapeOrAncestorLocked`, `TLEditorRunOptions.ignoreShapeLock`, `selectLockedShapes`, `canEditWhileLocked` (`packages/editor/api-report.api.md:1510`, `:4037`, `:3950`, `:3088`). | **Bardzo wysokie.** 25 plików w `packages/editor/src` i `packages/tldraw/src` (bez testów). 35 sprawdzeń `.isLocked` (tylko własna blokada), 23 wywołania `isShapeOrAncestorLocked`, 19 odwołań do flagi `ignoreShapeLock` / `_shouldIgnoreShapeLock`. Reguła występuje w 3 kopiach w samym `Editor` (`:9063-9078`, `:8783-8789`, `:9127-9131`). | **Częściowo egzekwowana, niespójnie i po cichu.** Ma udokumentowane i nieudokumentowane obejścia (krok 3). Historia to seria łatek: `863d45e7d`, `d98ea5091`, `4e8f62261`, `5e46744c5`, `f2082e9fe`, `524799ee0`. Dokumentacja rozjechała się z kodem (`locked-shapes.mdx:81` vs `Editor.ts:9127-9131`). |
| I2 | Wysoka (integralność danych) | Niskie: `reparentShapes` plus gest | Egzekwowana częściowo: rzuca błąd przy rodzicu = sobie. Cykle przez potomka blokuje tylko gest (`BaseFrameLikeShapeUtil.tsx:105-106`), nie `reparentShapes`. |
| I3 | Wysoka dla strzałek | Średnie: Editor side effects i `ArrowBindingUtil` | Egzekwowana w side effects. Pęknięcie na styku z I1 opisuje L5. |
| I4 | Średnia | Niskie: jeden hook | Egzekwowana w jednym miejscu |
| I5 | Średnia: funkcja pomocnicza, nie obietnica | Średnie: 7 komend, wspólny helper od `130dc8016` | Znane naruszenie, opisane w TODO `Editor.ts:7048-7051` |
| I6 | Wysoka | Średnie | Dobrze egzekwowana: guardy na wejściu do `_updateShapes` i do bindings (`b97e737b3`) |
| I7 | Średnia | Niskie | Egzekwowana w side effect |

**Wybór #1: I1, nienaruszalność zablokowanego poddrzewa** (dalej „INV-LOCK”).

Uzasadnienie:

- I1 to jedyny kandydat, który na wszystkich trzech osiach wypada skrajnie.
- To wprost złożona obietnica funkcjonalna.
- Żyje w 25 plikach w czterech warstwach: store (pośrednio), Editor, narzędzia/ShapeUtil, UI.
- Ma dwa konkurujące predykaty: blokada własna kontra blokada „własna lub przodka”.
- Odrzucenie operacji jest zawsze ciche (`continue`).
- Repo samo dostarcza dowodów słabości: kolejne PR-y łatają pojedyncze ścieżki, a komentarze w kodzie
  opisują reguły „skopiowane z `updateShapes`” (`Editor.ts:8781-8783`, `:9128-9129`).

I2 i I6 są równie rdzeniowe, ale lepiej egzekwowane. I5 jest słabo egzekwowany, ale mniej rdzeniowy i
zespół już go zna (TODO).

## Krok 3. Diagnoza INV-LOCK

### 3.1 Gdzie dziś żyje reguła

**Store (persystencja, „ograniczenia DB”).** Brak reguły. `_updateShapes` (`Editor.ts:9088-9122`) i
`store.put` / `store.remove` przyjmują każdą zmianę zablokowanego kształtu. Żaden handler
`beforeChange('shape')` nie strzeże blokady (lista side effects: `Editor.ts:660-800`). Każda ścieżka,
która omija publiczne `updateShapes`, omija więc regułę.

**Editor (serwis domenowy), czyli trzy kopie reguły i jeden predykat:**

- Predykat: `isShapeOrAncestorLocked`, `Editor.ts:5782-5787`.
- Kopia 1, `updateShapes`, `Editor.ts:9063-9078`. Własna blokada przepuszcza tylko odblokowanie.
  Blokada przodka zawsze zatrzymuje operację. **Odrzucenie to `continue`.**
- Kopia 2, `animateShapes`, `Editor.ts:8783-8789`. Ręczna kopia reguły z komentarzem, że
  `_updateShapes` „doesn't check locks” (`:8781-8782`). Dodana w `863d45e7d` po błędzie, w którym
  kształt „stranded at the penultimate” klatce.
- Kopia 3, `_getUnlockedShapeIds`, `Editor.ts:9127-9131`. Używana przez `deleteShapes` (`:9157-9159`),
  `duplicateShapes` (`:7102`), `groupShapes` (`:8880-8883`) i `ungroupShapes` (`:8964-8967`).
- Obejście: `run(fn, { ignoreShapeLock })` przez pole `_shouldIgnoreShapeLock` (`Editor.ts:1724`,
  `:1752-1761`, kontrakt `:330-337`).
- `reparentShapes` **całkowicie ignoruje blokadę**, bo wywołuje
  `this.run(..., { ignoreShapeLock: true })`. Uzasadnienie podaje `Editor.ts:6540-6541`: „so that we
  can reparent locked shapes, for example when a locked shape's parent is deleted”. Kod: `:6566-6568`.
- `deletePage` też ignoruje blokadę (`Editor.ts:5129`). Tu jest to uzasadnione.
- `selectAll` świadomie używa tylko własnej blokady (`Editor.ts:2286-2289`).

**Warstwa narzędzi i ShapeUtil.** Każde miejsce wybiera predykat samodzielnie:

- Tylko własna blokada (`.isLocked`):
  - `DragAndDropManager.ts:74` (filtr kształtów, które gest przenosi między rodzicami),
  - `Editor.getDraggingOverShape`, `Editor.ts:6670-6684` (filtr kształtów i celów),
  - `FrameShapeTool.ts:39`, `frames.ts:53`,
  - `Idle.ts:82`, `EditingShape.ts:77`, `:90`, `:215`,
  - cele wiązań strzałek: `ArrowShapeUtil.tsx:667`, `arrowTargetState.ts:128`.
- Własna lub przodka: `Idle.ts:165`, `Brushing.ts:67`, `ScribbleBrushing.ts:131`,
  `selectOnCanvasPointerUp.ts:20`, `EraserTool/childStates/Erasing.ts:23`, `Pointing.ts:17`.
- `BaseFrameLikeShapeUtil.tsx:130` w `onDragShapesOut` zakłada coś, co nie jest prawdą: „Locked shapes
  are already filtered out upstream by DragAndDropManager”. Tymczasem upstream filtruje tylko własną
  blokadę (`DragAndDropManager.ts:74`).

**UI (klient).**

- `getUnlockedSelectedShapes` / `canApplyToUnlockedSelection` (`action-predicates.ts:17-29`) decydują
  tylko o tym, czy akcja jest **włączona**. Akcje liczą odblokowane kształty
  (np. `actions.tsx:985-993`, `:1060-1074`), ale **wykonanie dostaje całe zaznaczenie**:
  `updateSelectedShapes` przekazuje `editor.getSelectedShapeIds()` (`actions.tsx:429-436`).
- `SelectionForegroundOverlayUtil.ts:473`, `:538-549` ukrywa uchwyty zablokowanego kształtu. To ochrona
  wizualna, a Editor i tak broni.

### 3.2 Naruszenia i słabe punkty

| # | Problem | Rodzaj | Dowód |
| --- | --- | --- | --- |
| L1 | **Dwa predykaty dla jednej reguły.** Część miejsc pyta o własną blokadę, część o przodka. Dziecko zablokowanej ramki jest „chronione” w `updateShapes`, ale „wolne” w filtrach gestu i w wyborze celu strzałki. | niespójne egzekwowanie | sekcja 3.1, `DragAndDropManager.ts:74` vs `Editor.ts:9070-9073` |
| L2 | **Zmiana hierarchii omija regułę.** `reparentShapes` ignoruje blokadę (`Editor.ts:6566-6568`), a jego wywołujący filtrują tylko własną blokadę. **[hipoteza]** Przy `selectLockedShapes: true` dziecko zablokowanej ramki da się zaznaczyć (`Idle.ts:165`). Przeciągnięte nie zmienia pozycji, bo `updateShapes` je pomija, ale `onDragShapesOut` (`BaseFrameLikeShapeUtil.tsx:121-133`) przenosi je na stronę, czyli wyjmuje z zablokowanego kontenera. Analogicznie `getDraggingOverShape` (`Editor.ts:6680-6684`) dopuszcza jako cel ramkę wewnątrz zablokowanej ramki, więc można **dodać** dziecko do zablokowanego poddrzewa. Narusza to `options.ts:178-179`. | warstwa nie egzekwuje | `Editor.ts:6540-6568`, `BaseFrameLikeShapeUtil.tsx:130` |
| L3 | **Usunięcie rodzica usuwa zablokowane dzieci.** `deleteShapes` filtruje tylko wskazane id, a potem bezwarunkowo dokłada potomków (`Editor.ts:9163-9170`). Zablokowany kształt w odblokowanej ramce znika razem z nią. To może być świadoma semantyka kontenera, ale nikt jej nie spisał. | niejednoznaczność reguły | `Editor.ts:9163-9170`, `locked-shapes.mdx:66` |
| L4 | **Komendy układu wykonują się częściowo i po cichu.** `getShapeClusters` (`Editor.ts:7438-7500`) wlicza zablokowane kształty do klastrów i do `allBounds`. Potem `updateShapes` po cichu je pomija. **[hipoteza]** `distributeShapes` z jednym zablokowanym kształtem rozkłada pozostałe tak, jakby ten przesunął się na swój slot. Klaster strzałka + kształt rozpada się, gdy jeden z jego członków jest zablokowany. UI włącza akcję według liczby odblokowanych kształtów (`action-predicates.ts:27-29`), ale przekazuje wszystkie (`actions.tsx:431-433`). | błąd połykany zamiast zatrzymania operacji | `Editor.ts:7076`, `:7714`, `:7910`, `:7982`, `:8033`, `:8100` |
| L5 | **Połowiczna operacja na zablokowanej strzałce.** `updateArrowTerminal` (`ArrowBindingUtil.ts:300-398`) najpierw woła `editor.updateShape(update)`. Dla zablokowanej strzałki ta zmiana jest po cichu pomijana. Zaraz potem `removeArrowBinding` (`:397`) i tak usuwa wiązanie. **[hipoteza]** Gdy kształt docelowy zablokowanej strzałki zostaje usunięty (`Editor.ts:761-766` → `ArrowBindingUtil.ts:110-125`), wiązanie znika, a końcówka strzałki zostaje z nieaktualną wartością. Na styku I1 i I3 jedna część operacji przechodzi, a druga nie. | błąd połykany, brak atomowości | `ArrowBindingUtil.ts:395-397` |
| L6 | **Ciche odrzucenie jako kontrakt.** `updateShapes`, `deleteShapes`, `groupShapes` i pozostałe zwracają `this` bez żadnego sygnału. Wywołujący (np. `animateShapes`, layout) nie wiedzą, co faktycznie zastosowano. Dlatego reguła musiała zostać skopiowana do `animateShapes`. | błąd połykany | `Editor.ts:9063-9078`, `:8781-8789` |
| L7 | **Rozjazd dokumentacji z kodem.** Dokumentacja twierdzi, że „Bulk operations such as deleteShapes only check each shape's own isLocked, so a child of a locked frame can still be deleted programmatically”. Od `863d45e7d` jest odwrotnie (`_getUnlockedShapeIds` sprawdza przodków). | reguła tylko deklarowana | `locked-shapes.mdx:81` vs `Editor.ts:9127-9131` |
| L8 | **Klient jako jedyny strażnik.** Zakaz wiązania strzałki z zablokowanym kształtem istnieje tylko w narzędziu strzałki (`ArrowShapeUtil.tsx:667`, `arrowTargetState.ts:128`). `createBindings` / `updateBindings` (`Editor.ts:6835-6845`, `:6876-6900`) nie sprawdzają blokady. Dokumentacja nie rozstrzyga, czy taki zakaz należy do reguły. | UI jedynym strażnikiem | jw. |

### 3.3 Konwencje zgłaszania błędów w repo (wejście do decyzji o fail-fast)

- **Błąd programisty** (zły typ argumentu, niemożliwy stan): `throw Error(...)` (21 wystąpień w
  `Editor.ts`, np. `:6552`, `:8521`, `:9151`), `assert` / `assertExists`
  (`packages/utils/src/lib/control.ts:172`, `:199`), `exhaustiveSwitchError` (`control.ts:147`).
- **Odmowa zgodna z kontraktem** (readonly, blokada, brak kształtu): cichy `return this` / `continue`.
- **Ostrzeżenie deweloperskie:** `warnOnce` (`packages/utils/src/lib/warn.ts:54`).

Wniosek: zamiana cichej odmowy w publicznym `updateShapes` na wyjątek złamałaby udokumentowany
kontrakt (`locked-shapes.mdx:65`) i wielu integratorów. Byłaby to osobna zmiana z breaking change,
**nie** refaktor. Fail-fast stosujemy więc tam, gdzie nielegalna operacja jest **błędem programisty
albo obejściem strażnika**, a nie świadomą prośbą użytkownika na mieszanym zaznaczeniu.

## Krok 4. Projekt agregatu-strażnika

### 4.1 Granica agregatu i trzeźwa ocena

Konceptualnie agregatem jest **poddrzewo blokady**. Jego korzeniem jest najwyżej położony zablokowany
przodek kształtu (lub sam kształt), a granicę wyznacza całe jego poddrzewo. Każda mutacja dowolnego
członka (geometria, propsy, hierarchia, cykl życia) musi przejść przez korzeń.

Pełny agregat w sensie DDD, czyli obiekt ładowany z repozytorium, z własnym stanem, zapisywany w
całości, byłby tu **nadmiarowy i szkodliwy**:

- stan żyje w reaktywnym `Store`,
- `Editor` jest jedyną bramą,
- kopiowanie stanu do obiektu agregatu złamałoby wzorzec reaktywny (`AGENTS.md:104`: „Avoid bypassing
  existing reactive patterns”).

**Minimalna forma strażnika** ma trzy elementy:

1. **`ShapeLockPolicy`**: czysty, bezstanowy moduł `@internal` w `packages/editor/src/lib/editor/`.
   Jest **jedynym** miejscem, w którym zapisano regułę. Wszystkie dotychczasowe kopie i filtry pytają
   ją o decyzję. Zgodnie z `AGENTS.md:125-127` nie dziedziczy po `EditorManager`, bo nie potrzebuje
   sprzątania.
2. **Bramka komend w `Editor`**: każda publiczna komenda mutująca autoryzuje cały zbiór przed
   obliczeniami (preconditions), a nie po nich.
3. **Strażnik ostatniej linii w store**, analogia ograniczenia w bazie: `beforeChange` / `beforeDelete`
   dla `shape`. Łapie każdą ścieżkę, która ominęła bramkę (`_updateShapes`, bezpośredni
   `store.put`/`store.remove` w kodzie wewnętrznym), i **przerywa transakcję wyjątkiem**.

„Repozytorium” to w tym repo `Editor` z `getShape` / `getShapeAncestors`. Nie dodajemy nowego, bo
odczyt jest już scentralizowany. Rozproszone są **decyzje**, a nie zapytania.

### 4.2 Typy i sygnatury

```ts
// packages/editor/src/lib/editor/ShapeLockPolicy.ts  (@internal)

/** Stan blokady widziany z perspektywy kształtu. */
export type TLShapeLockState =
	| { type: 'unlocked' }
	| { type: 'locked' } // sam kształt ma isLocked
	| { type: 'ancestor-locked'; rootId: TLShapeId } // blokada dziedziczona po korzeniu

/** Rodzaj mutacji, bo reguła dziś różnie traktuje różne operacje. */
export type TLShapeMutation =
	| { kind: 'update'; partial: TLShapePartial } // geometria, propsy, meta, index
	| { kind: 'delete' }
	| { kind: 'duplicate' }
	| { kind: 'group' }
	| { kind: 'ungroup' }
	| { kind: 'reparent'; toParentId: TLParentId; reason: 'user' | 'repair' }
	| { kind: 'bind-to' } // tylko jeśli L8 zostanie uznane za część reguły (osobna decyzja)

export type TLLockRefusalReason = 'locked' | 'ancestor-locked' | 'target-locked'

export interface TLLockDecision {
	allowed: TLShapeId[]
	refused: { id: TLShapeId; reason: TLLockRefusalReason }[]
}

export class ShapeLockViolationError extends Error {
	override name = 'ShapeLockViolationError'
	constructor(
		readonly shapeId: TLShapeId,
		readonly mutation: TLShapeMutation['kind'],
		readonly reason: TLLockRefusalReason
	) {
		super(`Shape ${shapeId} is ${reason}; "${mutation}" requires editor.run(fn, { ignoreShapeLock: true })`)
	}
}

export class ShapeLockPolicy {
	constructor(private editor: Editor) {}

	getLockState(shape: TLShape | TLShapeId): TLShapeLockState
	/** Decyzja dla zbioru, bez efektów ubocznych. Bramki komend jej używają. */
	authorize(ids: TLShapeId[], mutation: TLShapeMutation): TLLockDecision
	/** Precondition fail-fast: rzuca dla pierwszego odrzuconego id. */
	assertCanMutate(ids: TLShapeId[], mutation: TLShapeMutation): void
}
```

### 4.3 Reguła w jednym miejscu (pseudokod)

```text
authorize(ids, m):
  if editor._shouldIgnoreShapeLock: return allowed=ids
  for id in ids:
    s = getLockState(id)
    if m.kind == 'update' and s == locked and m.partial.isLocked === false: allow (odblokowanie)  # Editor.ts:9064-9068
    elif m.kind == 'reparent' and m.reason == 'repair': allow                                   # Editor.ts:6540-6541
    elif s != unlocked: refuse(id, s.type)
    elif m.kind == 'reparent' and getLockState(m.toParentId) != unlocked: refuse(id, 'target-locked')   # L2
    else allow
```

Semantyka jest zgodna z kopią 1 (`Editor.ts:9063-9078`) i kopią 3 (`:9127-9131`). Różnice dla
`reparent` i `bind-to` zamykają L2 i L8. Są **zmianą zachowania** i trafiają do osobnych faz (krok 5).

### 4.4 Bramka komend: przykład na komendach z zakresu

```ts
updateShapes(partials) {                      // kontrakt publiczny bez zmian: cicha odmowa
  const decision = this.lockPolicy.authorize(ids(partials), { kind: 'update', ... })
  this._updateShapes(partials.filter(p => decision.allowed.includes(p.id)))
}

distributeShapes(shapes, op) {                // precondition PRZED obliczeniem układu (L4)
  if (this.getIsReadonly()) return this
  const { allowed } = this.lockPolicy.authorize(toShapeIds(shapes), { kind: 'update' })
  const { clusters } = this.getShapeClusters(allowed, 'distribute')
  ...
}

reparentShapes(shapes, parentId, index, opts?: { reason?: 'user' | 'repair' }) {
  // fail-fast: wołający z warstwy narzędzi powinien był przefiltrować przez authorize
  this.lockPolicy.assertCanMutate(ids, { kind: 'reparent', toParentId: parentId, reason: opts?.reason ?? 'user' })
  this.run(() => { ... this._updateShapes(changes) })   // bez globalnego ignoreShapeLock
}
```

Narzędzia (`DragAndDropManager.ts:74`, `getDraggingOverShape`, `FrameShapeTool.ts:39`, `frames.ts:53`)
zamiast `.isLocked` wołają `editor.lockPolicy.authorize(...)` z właściwym rodzajem mutacji. Dzięki temu
filtr w geście i bramka w Editorze nie mogą się rozjechać.

### 4.5 Strażnik ostatniej linii: atomowość i fail-fast

```ts
// rejestrowany w konstruktorze Editora obok istniejących side effects (Editor.ts:660)
beforeChange('shape', (prev, next, source) => {
  if (source === 'remote' || this.isReplayingHistory() || this._shouldIgnoreShapeLock) return next
  if (isOnlyUnlock(prev, next)) return next
  const s = this.lockPolicy.getLockState(prev)
  if (s.type !== 'unlocked') throw new ShapeLockViolationError(prev.id, 'update', s.type)
  return next
})
// analogicznie beforeDelete('shape') z wyjątkiem dla kaskady z deleteShapes i deletePage
```

- **Atomowość.** Wyjątek z handlera wypływa z najbardziej zewnętrznego `editor.run` i przez
  `transaction()` wywołuje `txn.abort()` (`packages/state/src/lib/transactions.ts:279-281`). Cała
  komenda jest wtedy wycofana: nie zostaje „pół układu” ani „usunięte wiązanie bez aktualizacji
  końcówki” (L5). **Do potwierdzenia w fazie 0:** czy `historyAccumulator` w `Store` także wycofuje
  wpisy po abort. Kod `Store.atomic` (`Store.ts:1308-1350`) nie ma jawnego rollbacku poza
  `transaction`.
- **Dlaczego wyjątki są potrzebne.** Zmiany zdalne (`source === 'remote'`) i odtwarzanie historii są
  wyłączone ze sprawdzania. Inaczej undo zmiany wykonanej z `ignoreShapeLock` albo zmiana z innego
  klienta (sync) wywracałyby edytor.
- **Gest a fail-fast.** Gest (Translating, DragAndDrop) nie powinien rzucać w twarz użytkownika.
  Narzędzia filtrują przez `authorize` przed wywołaniem komendy, więc w poprawnym kodzie strażnik nigdy
  nie zadziała. Jeśli zadziała, to w kodzie jest błąd, i zatrzymanie operacji jest właściwe. Zgodnie z
  konwencją repo jest to `throw`, a nie `warnOnce`, bo `warn` oznaczałby „loguj i jedź dalej”. Na czas
  migracji (faza 4) strażnik działa w trybie obserwacji: `warnOnce` w produkcji i `throw` w testach.
  Dopiero po zamknięciu L2–L5 przechodzi na `throw` zawsze (faza 7).
- **API.** Publiczne komendy zachowują cichą odmowę. Niczego nie zmapowujemy na odpowiedź HTTP, bo jej
  tu nie ma. Odpowiednikiem „mapowania błędu na odpowiedź” jest to, że gest kończy się bez zmian (przez
  `authorize`), a nie rzuca wyjątku. Opcjonalnie, jako osobna zmiana rozszerzająca, można dodać
  zwracanie `TLLockDecision` z wariantu `editor.tryUpdateShapes`. Usunęłoby to potrzebę kopii reguły w
  `animateShapes` (L6).

## Krok 5. Before/after, plan faz, testy

### 5.1 Before/after dla każdego miejsca reguły

| Miejsce | Before | After |
| --- | --- | --- |
| `Editor.ts:9063-9078` `updateShapes` | inline kopia reguły, `continue` | `lockPolicy.authorize(..., update)`, zachowanie identyczne |
| `Editor.ts:8783-8789` `animateShapes` | ręczna kopia reguły | `lockPolicy.authorize`, kopia usunięta |
| `Editor.ts:9127-9131` `_getUnlockedShapeIds` | trzecia kopia | usunięte, wołający używają `authorize` z `delete` / `duplicate` / `group` / `ungroup` |
| `Editor.ts:9163-9170` kaskada usuwania | bezwarunkowo usuwa zablokowane dzieci | bez zmian w refaktorze. Decyzja L3 w osobnej zmianie, spisana w `locked-shapes.mdx` |
| `Editor.ts:6540-6568` `reparentShapes` | globalne `ignoreShapeLock: true` | `assertCanMutate(reparent, reason)`. `repair` dla kaskady usuwania rodzica. Osobna faza (zmiana zachowania) |
| `Editor.ts:6670-6684` `getDraggingOverShape` | `!s.isLocked` | `authorize(reparent → target)` |
| `Editor.ts:7438-7500` `getShapeClusters` + 7 komend układu | zablokowane w obliczeniach, potem po cichu pominięte | precondition: układ liczony tylko z `allowed`. Osobna faza (zmiana zachowania), wymaga decyzji „kotwica czy wykluczenie” |
| `DragAndDropManager.ts:74` | `!s.isLocked` | `authorize(reparent)` |
| `BaseFrameLikeShapeUtil.tsx:130` | komentarz zakłada filtr upstream | komentarz zbędny, bo bramka jest w `reparentShapes` |
| `FrameShapeTool.ts:39`, `frames.ts:53` | `.isLocked` | `authorize(reparent)` |
| `ArrowBindingUtil.ts:300-398` `updateArrowTerminal` | update pominięty, unbind wykonany | operacja na zablokowanej strzałce wykonywana w całości w `run(..., { ignoreShapeLock: true })` jako naprawa spójności (`reason: 'repair'`) albo wcale. Osobna faza |
| `ArrowShapeUtil.tsx:667`, `arrowTargetState.ts:128` | jedyny strażnik celu wiązania | jeśli L8 zostanie przyjęte: `authorize(bind-to)` także w `createBindings` |
| `action-predicates.ts:17-29`, `actions.tsx:429-436` | włączenie liczy odblokowane, wykonanie dostaje wszystkie | bez zmian w UI: bramka w Editorze robi to samo filtrowanie, więc predykat i wykonanie są spójne |
| store side effects `Editor.ts:660-800` | brak strażnika | `beforeChange` / `beforeDelete('shape')`: obserwacja, potem `throw ShapeLockViolationError` |
| `locked-shapes.mdx:81`, `:100` | nieaktualne | poprawione (zmiana dokumentacji, osobny PR) |

### 5.2 Fazy (każda do cofnięcia niezależnie; Branch by Abstraction, kolejność Mikado)

Runner: Vitest (`cd packages/tldraw && npx vitest run …`). Bazowy test `lockShapes.test.ts` jest
zielony na HEAD (30/30).

| Faza | Treść | Zachowanie | Test-first |
| --- | --- | --- | --- |
| **F0** | Testy charakteryzujące dla L2–L5 i dla obecnych gwarancji. Utrwalają **obecne** zachowanie, również wadliwe; takie testy dostają komentarz `// characterization: L4`. Potwierdzają albo obalają hipotezy z 3.2 i sprawdzają rollback historii po wyjątku. | bez zmian | tak (to jest ta faza) |
| **F1** | `ShapeLockPolicy` + `ShapeLockViolationError` (`@internal`), testy jednostkowe polityki. Brak wołających. | bez zmian | tak |
| **F2** | `updateShapes`, `animateShapes`, `_getUnlockedShapeIds` → `authorize`. Usunięcie dwóch kopii. | bez zmian (F0 i `lockShapes.test.ts` zielone) | testy już istnieją |
| **F3** | Miejsca w narzędziach i UI → `getLockState` / `authorize` **z zachowaniem obecnego predykatu** (miejsca „tylko własna blokada” dostają jawny tryb `ownLockOnly`). Intencja staje się widoczna, semantyka bez zmian. | bez zmian | testy F0 |
| **F4** | Strażnik w store w trybie obserwacji (`warnOnce`, `throw` pod flagą testową). | bez zmian w produkcji | tak: test, że obejście przez `_updateShapes` rzuca w trybie testowym |
| **F5a–d** | **Osobne zmiany zachowania**, po jednej na PR: (a) L2 `reparentShapes` + cel przeciągania, (b) L4 preconditions układu, (c) L5 atomowa naprawa strzałki, (d) L3 i L8 po decyzji produktowej. Każda zmienia test F0 z „characterization” na „expected”. | zmiana (świadoma) | tak: najpierw czerwony test docelowy |
| **F6** | Dokumentacja `locked-shapes.mdx:81`, `:100` i notka w release notes. | — | — |
| **F7** | Strażnik w store przechodzi na `throw` zawsze. | zmiana tylko dla kodu omijającego bramkę | test F4 bez flagi |

### 5.3 Przypadki testowe dla niezmiennika

**Legalne:**

1. `updateShapes` zmienia odblokowany kształt.
2. `updateShapes({ isLocked: false })` odblokowuje kształt zablokowany (także pod zablokowanym przodkiem).
3. `run(fn, { ignoreShapeLock: true })`: update, delete, duplicate, group i ungroup na zablokowanym
   kształcie przechodzą.
4. Usunięcie rodzica zablokowanego dziecka: dziecko jest przenoszone (`repair`) albo usuwane zgodnie z
   decyzją L3. Dziś usuwane, więc F0 to utrwala.
5. `deletePage` usuwa zablokowane kształty.
6. Undo zmiany wykonanej z `ignoreShapeLock` nie rzuca (`isReplayingHistory`).
7. Zmiana zdalna (`mergeRemoteChanges`) na zablokowanym kształcie nie rzuca.
8. `selectAll` w zablokowanej ramce zaznacza odblokowane dzieci (`Editor.ts:2286-2289`). Zaznaczenie nie
   jest mutacją.
9. Komenda układu na mieszanym zbiorze przesuwa tylko odblokowane kształty, a wynik jest poprawny dla
   nich (F5b).

**Nielegalne** (odmowa w bramce: stan bez zmian; obejście bramki: `ShapeLockViolationError` i pełny
rollback transakcji):

10. `updateShapes` / `nudgeShapes` / `rotateShapesBy` / `flipShapes` / `resizeShape` na zablokowanym
    kształcie i na dziecku zablokowanej ramki: pozycja i propsy bez zmian.
11. `align` / `distribute` / `stack` / `pack` / `stretch` / `resizeToBounds`: zablokowany kształt bez
    zmian. Po F5b nie wpływa też na obliczenie dla pozostałych (zgodnie z przyjętą decyzją).
12. `deleteShapes` / `duplicateShapes` / `groupShapes` / `ungroupShapes` na dziecku zablokowanej ramki:
    brak efektu.
13. `reparentShapes(childOfLockedFrame, page)` bez `repair`: odmowa (F5a).
14. `reparentShapes(unlocked, frameInsideLockedFrame)`: odmowa `target-locked` (F5a).
15. Gest z `selectLockedShapes: true`: przeciągnięcie dziecka zablokowanej ramki poza nią nie zmienia
    `parentId` (L2).
16. Gest: upuszczenie kształtu na ramkę wewnątrz zablokowanej ramki nie zmienia `parentId` (L2).
17. Usunięcie celu zablokowanej strzałki: końcówka i wiązanie są spójne, czyli zmienione razem albo
    wcale (L5).
18. Wewnętrzny `_updateShapes` na zablokowanym kształcie poza `ignoreShapeLock`: wyjątek
    `ShapeLockViolationError` i stan sprzed `editor.run` (F4/F7).
19. Wyjątek w środku wieloelementowej komendy: żaden z pozostałych kształtów nie został zmieniony
    (atomowość), a stos undo nie zawiera częściowego wpisu.

### 5.4 Rejestr kontraktów (`packages/*/api-report.api.md`)

- **Istniejące nazwy load-bearing, które nie mogą się zmienić:** `Editor.isShapeOrAncestorLocked`
  (`packages/editor/api-report.api.md:1510`), `TLEditorRunOptions.ignoreShapeLock` (`:4037`),
  `TldrawOptions.selectLockedShapes` (`:3950`, domyślnie `:790`), `ShapeUtil.canEditWhileLocked`
  (`:3088`).
- **Nowe nazwy:**
  - `ShapeLockPolicy`, `TLShapeLockState`, `TLShapeMutation`, `TLLockDecision`, `TLLockRefusalReason`:
    `@internal`, poza api-report w F1–F4. Do rejestracji tylko przy ewentualnym upublicznieniu
    `editor.lockPolicy`.
  - `ShapeLockViolationError`: do rejestracji w `packages/editor/api-report.api.md` w F7. Od tego
    momentu integrator może go zobaczyć jako wyjątek i musi móc go rozpoznać (`instanceof` / `name`).
  - Opcja `reparentShapes(..., { reason })`: zmiana sygnatury publicznej, rejestracja w api-report w F5a.

## Podsumowanie

1. Wybrany niezmiennik #1 to **INV-LOCK, nienaruszalność zablokowanego poddrzewa**. Kształtu
   zablokowanego, ani kształtu pod zablokowanym przodkiem, nie da się zmienić, przesunąć, usunąć,
   zduplikować, zgrupować ani przenieść w hierarchii bez odblokowania albo `ignoreShapeLock`.
2. Wybrałem go, bo SDK obiecuje tę regułę wprost (`locked-shapes.mdx`, `options.ts:178-179`). Jednocześnie
   jest rozsmarowana po 25 plikach w czterech warstwach, ma dwa konkurujące predykaty (własna blokada vs
   przodek), trzy kopie w `Editor` i serię łatek w historii git.
3. Diagnoza wskazuje osiem słabych punktów. Najważniejsze: `reparentShapes` całkowicie ignoruje blokadę,
   a filtry gestu sprawdzają tylko własną blokadę, przez co dziecko zablokowanej ramki można prawdopodobnie
   z niej wyjąć. Komendy układu wliczają zablokowane kształty, a potem je po cichu pomijają.
   `updateArrowTerminal` wykonuje połowę operacji na zablokowanej strzałce. Dokumentacja (`:81`) przeczy
   kodowi.
4. Store nie egzekwuje reguły wcale, więc każda ścieżka omijająca publiczne `updateShapes` omija też
   regułę.
5. Pełny agregat DDD byłby tu nadmiarowy. Proponuję minimalną formę strażnika: czystą `ShapeLockPolicy`
   jako jedyne miejsce reguły, bramkę komend w `Editor` z preconditions przed obliczeniami oraz strażnika
   ostatniej linii w `beforeChange`/`beforeDelete` store'a. Strażnik rzuca `ShapeLockViolationError`, a
   najbardziej zewnętrzne `editor.run` wycofuje całą transakcję.
6. Publiczna cicha odmowa zostaje, bo jest udokumentowanym kontraktem. Fail-fast dotyczy obejść strażnika,
   a zmiany zdalne i odtwarzanie historii są z niego wyłączone.
7. Plan ma fazy F0–F7. Najpierw idą testy charakteryzujące, potem trzy fazy refaktoru bez zmiany
   zachowania i obserwacja w store. Zmiany zachowania (L2–L5, decyzje L3/L8) wydzielono w osobne PR-y,
   a `ShapeLockViolationError` trafia do api-report dopiero w F7.

---

## Nota recenzenta (sesja główna, 2026-11-10)

Plan powstał w świeżym kontekście, bez dostępu do `context/`, z promptem z lekcji M4L5 bez zmian merytorycznych. Weryfikacja w sesji głównej:

- **Potwierdzone:**
  - `DragAndDropManager.ts:74` filtruje tylko własne `isLocked`;
  - `ArrowBindingUtil.ts:395-397` wykonuje `updateShape` (pomijane dla zablokowanej strzałki), a potem bezwarunkowo `removeArrowBinding`;
  - `locked-shapes.mdx:81` jest nieaktualne od `863d45e7d` (#10334, 2026-09-09), bo `_getUnlockedShapeIds` (`Editor.ts:9126-9130`) sprawdza przodków.
- **Doprecyzowane:** `reparentShapes` z `ignoreShapeLock: true` (`Editor.ts:6540-6568`) to świadoma decyzja (komentarz w `:6540-6541`). Plan to uwzględnia (powód `repair`), więc L2 jest hipotezą o *wywołujących*, a nie o samym `reparentShapes`.
- **Pominięty kandydat (decyzja właściciela: zostają oba).** Lista niezmienników tego planu nie zawiera reguły „strzałka przesuwana razem z celem zachowuje wiązanie” (I-06/I-07 w `01-domain-distillation.md`; C4 w `changes/refactor-opportunities/research.md`). Przyczyna jest metodyczna: plan wyprowadza niezmienniki najpierw z dokumentów, a dokumenty o tej regule milczą (01, D-04). Destylacja, w której kod badano na ślepo, wskazała ją jako #1. Oba wyniki zostają niezależnymi wejściami do drugiego cyklu:
  - **INV-LOCK:** obietnica udokumentowana, ale egzekwowana niespójnie;
  - **I-06/I-07:** obietnica nieudokumentowana, egzekwowana dwoma predykatami i naruszana w ścieżce jednorazowej.
