---
title: "Anti-Corruption Layer dla silnika rich text (TipTap / ProseMirror) w tldraw"
created: 2026-11-10
type: refactor-plan
---

# Anti-Corruption Layer dla silnika rich text (TipTap / ProseMirror)

> Repozytorium: tldraw SDK, HEAD `844f6f484`. Zakres: `packages/*` (apps/templates/internal wspominam tylko jako konsumentów).
> To **plan**, nie implementacja: żaden plik produkcyjny nie został zmieniony. Wszystkie odwołania `plik:linia` zweryfikowałem na tym HEAD
> (rg + ast-grep, `git show`, źródła `@tiptap/core@3.13.0` / `prosemirror-model` z magazynu pnpm).

---

## KROK 0 — Kontekst

**Stack.** pnpm monorepo, TypeScript, React (platforma — nie liczę jej jako przecieku), Vitest, api-extractor (`packages/*/api-report.api.md` = publiczny kontrakt SemVer).

**Warstwy kodu** (deklaracja: `AGENTS.md:22-23`, `AGENTS.md:136-137`):

| Warstwa | Pakiet(y) | Rola |
|---|---|---|
| L1 Trwały format | `@tldraw/tlschema`, `@tldraw/store` | rekordy, walidatory, migracje (to, co ląduje w plikach `.tldr`, w sync i w bazie) |
| L2 Rdzeń silnika | `@tldraw/editor` | „foundational infinite canvas editor with **no default shapes, tools, or UI**” (`AGENTS.md:22`); „core editor primitives, geometry, managers, and **UI-free behavior**” (`AGENTS.md:136`) |
| L3 Kształty/narzędzia (domena SDK) | `tldraw` (`lib/shapes`, `lib/tools`, `lib/utils`) | domyślne kształty i narzędzia |
| L4 UI React | `tldraw` (`lib/ui`, komponenty kształtów) | toolbar, komponenty edycji |
| L5 Pakiety funkcjonalne | `@tldraw/commenting`, `@tldraw/mentions` | komentarze, @-wzmianki |
| L6 Publiczne API | `api-report.api.md` każdego pakietu | kontrakt SemVer |
| (serwer) | `@tldraw/sync-core`, `@tldraw/worker-shared` | synchronizacja/serwer |

**Zależności zewnętrzne (manifesty `packages/*/package.json`).** `@tldraw/editor`: `@tiptap/core|pm|react`, `classnames`, `eventemitter3`, `idb`, `is-plain-object`, `rbush`; `tldraw`: 8× `@tiptap/*`, `classnames`, `idb`, `lz-string`, `radix-ui`, `react-intl`; `@tldraw/commenting`: `@tiptap/core|pm|react`; `@tldraw/mentions`: 5× `@tiptap/*`; `@tldraw/utils`: `lodash.*`; `@tldraw/sync-core`: `nanoevents`, `ws`; `@tldraw/mermaid`: `mermaid`; `@tldraw/worker-shared`: `itty-router`, `toucan-js`, `cloudflare-workers-unfurl`; `@tldraw/dotcom-shared`: `@rocicorp/zero`.

**Deklaracje w dokumentach bazowych dot. wymienialności / separacji.**
Nie znalazłem deklaracji „X jest odseparowane, żeby dało się wymienić bibliotekę Y” dla żadnej zależności. Dla TipTapa dokumentacja mówi coś **odwrotnego** — TipTap jest jawnie wybranym, udokumentowanym punktem rozszerzeń:

- `apps/docs/content/sdk-features/rich-text.mdx:25` — „Under the hood, tldraw uses TipTap (…) as the rich text engine. Text is stored as structured JSON”.
- `rich-text.mdx:120` — własne rozszerzenia TipTap przez `options.text` (`TLTextOptions`); `rich-text.mdx:187` — `Editor#getRichTextEditor` daje „the TipTap editor instance”.
- `rich-text.mdx:165` — „Import TipTap's building blocks from `tldraw` rather than installing `@tiptap/*` alongside it. (…) ProseMirror throws when a schema is built from nodes belonging to two different instances.”
- `rich-text.mdx:288` — „`TLRichText.content` is typed as `unknown[]`, so cast to TipTap's `JSONContent` when walking the tree”.
- `apps/docs/content/releases/v3.10.0.mdx:26` — rich text jako „first-class primitive”, „The implementation utilizes TipTap”.
- Commit `c374ac900` (#10691, 2026-09-11): „Customizing rich text through `options.text.tipTapConfig.extensions` is public API”.

Są natomiast deklaracje **o granicach warstw** (`AGENTS.md:22`, `AGENTS.md:136`), których kod nie dotrzymuje — to jest tu właściwy rozjazd intencja-vs-kod (KROK 3).

---

## KROK 1 — Identyfikacja przeciekających zależności

Liczby plików: `rg` po `from '<pakiet>'` w `packages/**` (bez `node_modules`), dla `@tiptap/*` dodatkowo potwierdzone ast-grepem (`import $$$A from '$S'` + `export { $$$A } from '$S'`, filtr `^@tiptap/` → **15 plików**, identyczna lista jak z rg).

| Zależność | Pakiety | Pliki prod. (bezpośredni import) | Testy | api-report | Warstwy |
|---|---|---|---|---|---|
| **`@tiptap/*` (+ ProseMirror przez `@tiptap/pm`)** | editor, tldraw, commenting, mentions | **11** (+9 pośrednio, niżej) | 4 (+4 pośrednio) | **3 raporty, 19 linii importu** | **L1–L6 (6)** |
| `radix-ui` | tldraw | 20 (wszystkie w `tldraw`, UI) | — | 0 | 1 (L4) |
| `classnames` | editor (8), tldraw (24) | 32 | — | 0 | 2 (L2, L4), trywialny helper |
| `mermaid` | mermaid | 8 | — | 0 | 1 (pakiet-adapter) |
| `eventemitter3` | editor | 2 | — | editor (`Editor extends EventEmitter`, `api-report.api.md:883`) | L2+L6 |
| `nanoevents` | sync-core | 1 | — | sync-core (`events: Emitter`, `api-report.api.md:735`) | serwer+L6 |
| `lodash.*` | utils | 3 (+1 test w `state`) | 1 | utils (re-eksport `isEqual`, `uniq`) | już opakowane w `@tldraw/utils` (wzorcowy mini-ACL) |
| `idb`, `rbush`, `lz-string`, `react-intl`, `ws` | ≤2 pakiety | 1–4 | — | 0 | 1 |

### Wszystkie pliki, które dziś „znają” TipTap

**A. Bezpośredni import `@tiptap/*` — kod produkcyjny (11):**

| # | Plik:linia | Warstwa | Co importuje |
|---|---|---|---|
| 1 | `packages/editor/src/lib/utils/richText.ts:1-3` | L2 | `getSchema, JSONContent, Editor` z `@tiptap/core`; `Node, Schema` z `@tiptap/pm/model`; `EditorProviderProps` z `@tiptap/react` |
| 2 | `packages/tldraw/src/lib/utils/text/richText.ts:1-14` | L3 | `generateHTML/JSON/Text`, `StarterKit`, `Highlight`, `Typography`, `Code`, `Node` |
| 3 | `packages/tldraw/src/lib/utils/text/tiptap.ts:4-18` | L3/L6 | re-eksport `Extension, getSchema, Mark, mergeAttributes, Node, Extensions, JSONContent, TaskList, TaskItem` |
| 4 | `packages/tldraw/src/lib/utils/text/literalTyping.ts:1-4` | L3 | `Extension`, `ResolvedPos`, `Plugin`, `EditorView` |
| 5 | `packages/tldraw/src/lib/utils/text/wrapSelection.ts:1-11` | L3 | `Extension`, `Mark, Node`, `@tiptap/pm/state` |
| 6 | `packages/tldraw/src/lib/shapes/text/RichTextArea.tsx:1-7` | L4 | `EditorView`, `EditorEvents, JSONContent, Editor` z `@tiptap/react` |
| 7 | `packages/tldraw/src/lib/ui/components/Toolbar/DefaultRichTextToolbar.tsx:1-2` | L4 | `getMarkRange, Range, EditorEvents`, `MarkType` |
| 8 | `packages/commenting/src/canvas/comment-render.ts:1` | L5 | `Extensions, generateText, JSONContent` |
| 9 | `packages/commenting/src/ui/comment-composer.tsx:1-2` | L5 (UI) | `JSONContent`, `EditorContent, useEditor` |
| 10 | `packages/mentions/src/mention-extension.ts:1-2` | L5 | `mergeAttributes`, `Mention, MentionNodeAttrs, MentionOptions` |
| 11 | `packages/mentions/src/mention-suggestion.tsx:1-3` | L5 (UI) | `MentionNodeAttrs`, `ReactRenderer`, `@tiptap/suggestion` |

**B. Bezpośredni import — testy (4):** `packages/tldraw/src/lib/utils/text/richText.test.ts:1`, `packages/tldraw/src/lib/utils/text/wrapSelection.test.ts:1`, `packages/tldraw/src/test/richTextToolbarEvents.test.tsx:2`, `packages/mentions/src/mention-extension.test.ts:1`.

**C. Pośrednio — przez aliasy/kontrakty TipTapa (`TiptapEditor`, `TiptapNode`, `tipTapConfig`, `JSONContent`, `getRichTextEditor()`), kod produkcyjny (9):**

| Plik:linia | Warstwa | Jak zna TipTapa |
|---|---|---|
| `packages/editor/src/index.ts:506-507` | L6 | eksport `TiptapEditor`, `TiptapNode` z `@tldraw/editor` |
| `packages/editor/src/lib/editor/Editor.ts:156`, `:2896`, `:2903`, `:2919` | L2 | `atom<TiptapEditor>`, `getRichTextEditor(): TiptapEditor \| null`, `setRichTextEditor(textEditor: TiptapEditor \| null)` |
| `packages/tldraw/src/index.ts:850`, `:857`, `:869-872` | L6 | eksport `getTipTapDefaultExtensions`, `tipTapDefaultExtensions`, `JSONContent` (z `./lib/utils/text/tiptap`) |
| `packages/tldraw/src/lib/Tldraw.tsx:247-249` | L4 | składa `tipTapConfig: { extensions: tipTapDefaultExtensions, ... }` |
| `packages/tldraw/src/lib/TldrawImage.tsx:76-77` | L4 | to samo, druga kopia składania configu |
| `packages/tldraw/src/lib/tools/SelectTool/childStates/EditingShape.ts:203` | L3 (narzędzie) | `this.editor.getRichTextEditor()?.commands.focus('all')` — komenda TipTapa w state machine narzędzia |
| `packages/tldraw/src/lib/ui/components/Toolbar/DefaultRichTextToolbarContent.tsx:31`, `:84`, `:137` | L4 | prop `textEditor: TiptapEditor`; `textEditor.chain().focus()[op]().run()`; `textEditor.isActive(name, attrs)` |
| `packages/tldraw/src/lib/ui/components/Toolbar/LinkEditor.tsx:1`, `:16` | L4 | prop `textEditor: TiptapEditor` |
| `packages/commenting/src/ui/comment-extensions.ts:9` | L5 | `getTipTapDefaultExtensions({ heading: false })` |

**D. Pośrednio — testy (4):** `packages/tldraw/src/test/TestEditor.ts:122-123`, `packages/sync-core/src/test/FuzzEditor.ts:15`, `:111-112` (tak — fuzzer sync-core konfiguruje TipTapa), `packages/tldraw/src/test/TldrawEditor.test.tsx:39-40`, `packages/tldraw/src/lib/utils/text/tiptap.test.ts:2`.

**E. Trwały format — słownik ProseMirror bez importu (6 plików L1):** `packages/tlschema/src/misc/TLRichText.ts:16-20` (`{ type, content: unknown[], attrs? }`), `:68-89` (`toRichText` produkuje `doc`/`paragraph`/`text` — nazwy węzłów StarterKitu); pola `richText: richTextValidator` w `TLTextShape.ts:98`, `TLGeoShape.ts:190`, `TLNoteShape.ts:133`, `TLArrowShape.ts:250` i `body: richTextValidator` w `TLComment.ts:269`. tlschema **nie importuje** TipTapa, ale kształt dokumentu i nazwy węzłów/marków (`paragraph`, `heading`, `bold`, `mention`…) to słownik schematu TipTap/ProseMirror.

**F. Manifesty (4):** `packages/editor/package.json:56-58`, `packages/tldraw/package.json:59-66`, `packages/commenting/package.json:61-63`, `packages/mentions/package.json:60-64`.

**G. api-report (3 raporty, 19 linii `from '@tiptap…'`):** `packages/editor/api-report.api.md:15-16,29` (3), `packages/tldraw/api-report.api.md:24-82` (13), `packages/mentions/api-report.api.md:11-12,16` (3). Konkretne sygnatury: `editor/api-report.api.md:1385` (`getRichTextEditor(): null | TiptapEditor`), `:1618` (`setRichTextEditor`), `:2973` (`RichTextFontVisitor = (node: TiptapNode, …)`), `:3479` (`TiptapEditor = Editor_2`), `:3482` (`TiptapNode = Node_2`), `:4945` (`tipTapConfig?: EditorProviderProps_2`); `tldraw/api-report.api.md:1134` (`defaultAddFontsFromNode(node: Node_3, …)`), `:1453` (`textEditor: TiptapEditor`), `:2431` (`getTipTapDefaultExtensions(...: Partial<StarterKitOptions>): Extensions`), `:2652` (`export { JSONContent }`), `:3324`, `:3964`; `mentions/api-report.api.md:37`, `:40`.

**Konsumenci poza zakresem:** 13 plików w `apps/examples`, `apps/dotcom`, `templates` używa TipTapa lub `getRichTextEditor/tipTapConfig/JSONContent`, z czego 7 importuje `@tiptap/*` bezpośrednio.

---

## KROK 2 — Klasyfikacja i wybór #1

| Oś | `@tiptap/*` | `radix-ui` | `eventemitter3` | `classnames` |
|---|---|---|---|---|
| (a) warstwy / pliki | **6 warstw**, 4 pakiety, 11+9 prod., 4+4 testy, 3 api-reporty, 6 schematów trwałych | 1 warstwa, 20 plików, 1 pakiet | 2 warstwy, 2 pliki | 2 warstwy, 32 pliki, ale jednolinijkowy helper |
| (b) ryzyko/koszt wymiany dziś | **bardzo wysoki**: typ biblioteki w publicznym `Editor`, w propsach komponentów, w opcjach; słownik węzłów w trwałych danych; precedens: upgrade v2→v3 był 💥 breaking (`releases/v4.2.0.mdx:22-24`, „dual-install symptom” `:31`), zmiana walidatora wymagała migracji (`releases/v4.3.0.mdx:245`) | niski: tylko wewnętrzne UI, brak w api-report | średni: zmiana klasy bazowej `Editor` = major, ale API minimalne | znikomy |
| (c) dokumenty deklarują wymienialność? | **Nie** — deklarują TipTap jako świadomy punkt rozszerzeń; **ale** deklarują, że `@tldraw/editor` jest „UI-free” (`AGENTS.md:22,136`) i że TipTap należy brać z `tldraw`, nie z `@tiptap/*` (`rich-text.mdx:165`) — oba łamane przez kod | nie | nie | nie |

**Wybór #1: `@tiptap/*` (wraz z ProseMirror przez `@tiptap/pm`).** Jest jedyną zależnością, która przecina wszystkie sześć warstw, trafia do kontraktu SemVer trzech pakietów i do trwałego formatu rekordów, a jej upgrade już raz wymusił major-breaking release. `radix-ui` ma więcej plików, ale wszystkie w jednej warstwie i poza api-reportem — to zwykła zależność UI, nie przeciek. `lodash` jest kontrprzykładem: już opakowany w `@tldraw/utils` (`packages/utils/src/index.ts:3-5`), czyli wzorzec, którego TipTap nie ma.

**Trzeźwe rozróżnienie: co jest decyzją, a co przypadkiem.**

| Świadoma decyzja (zostawić, ewentualnie przenieść) | Dowód |
|---|---|
| `TLTextOptions.tipTapConfig` jako punkt rozszerzeń | commit `c374ac900`: „is public API”; `rich-text.mdx:120-161` |
| Re-eksport `Node/Mark/Extension/…` z `tldraw` | `tiptap.ts:1-3` (komentarz o jednej instancji ProseMirror), `rich-text.mdx:165`, `releases/v5.5.0.mdx:41` |
| `getRichTextEditor()` zwracający instancję TipTap dla własnych toolbarów | `rich-text.mdx:187`, `:276` |
| `@tldraw/mentions` jako węzeł TipTap | `releases/v5.3.0.mdx:44` („@-mention picker and TipTap node”) — z natury jest wtyczką adaptera |

| Przypadkowy przeciek (cel refaktoru) | Dowód |
|---|---|
| Rdzeń `@tldraw/editor` (deklarowany jako UI-free) zależy od `@tiptap/react` i parsuje ProseMirror w runtime | `editor/src/lib/utils/richText.ts:3`, `:57-59`; `editor/package.json:58` |
| Konwersja `TLRichText ⇄ JSONContent` rzutowaniem `as` rozsiana po 4 plikach w 3 pakietach | KROK 3, tabela D1 |
| Duplikaty logiki domenowej rich text w `commenting` | KROK 3, D2–D4 |
| Pakiety first-party łamią własną regułę z `rich-text.mdx:165` i mają rozjechane piny wersji | `commenting/package.json:61-63`, `tldraw/package.json:63` (`"3.13.0"` dokładnie) vs `:59` (`"^3.12.1"`) |
| Narzędzie (state machine) wydaje komendy TipTapa | `EditingShape.ts:203` |

---

## KROK 3 — Diagnoza

### D1. Zduplikowana „rekonstrukcja” typu biblioteki: `TLRichText → JSONContent` (9 miejsc, 4 pliki, 3 pakiety)

```
packages/editor/src/lib/utils/richText.ts:59           Node.fromJSON(schema, richText as JSONContent)
packages/tldraw/src/lib/utils/text/richText.ts:113     generateHTML(richText as JSONContent, extensions)
packages/tldraw/src/lib/utils/text/richText.ts:198     generateText(richText as JSONContent, tipTapExtensions, {...})
packages/tldraw/src/lib/shapes/text/RichTextArea.tsx:77    commands.setContent(richText as JSONContent)
packages/tldraw/src/lib/shapes/text/RichTextArea.tsx:195   content: rInitialRichText.current as JSONContent
packages/commenting/src/ui/comment-composer.tsx:176    content: (value ?? EMPTY_COMMENT) as JSONContent
packages/commenting/src/ui/comment-composer.tsx:244    editor.commands.setContent(value as JSONContent)
packages/commenting/src/canvas/comment-render.ts:59    hasMention(richText as JSONContent)
packages/commenting/src/canvas/comment-render.ts:67    render(demoteHeadings(richText as JSONContent), extensions)
```

Kierunek odwrotny (`silnik → TLRichText`) — 4 miejsca, dwa różne API TipTapa na to samo:

```
packages/tldraw/src/lib/shapes/text/RichTextArea.tsx:133   const content: TLRichText = props.editor.state.doc.toJSON()
packages/commenting/src/ui/comment-composer.tsx:232        onChangeRef.current?.(editor.getJSON() as TLRichText)
packages/tldraw/src/lib/utils/text/richText.ts:214         return generateJSON(html, tipTapExtensions) as TLRichText
packages/commenting/src/canvas/comment-render.ts:83        renderHtmlFromRichTextWithExtensions(doc as TLRichText, extensions)
```

Dokumentacja wręcz **instruuje** konsumentów, by powielali to rzutowanie (`rich-text.mdx:288`).

### D2. Zduplikowana operacja domenowa „czy pusty”

`packages/commenting/src/ui/comment-extensions.ts:14-24` — komentarz w kodzie przyznaje: „Mirrors tldraw's private `isEmptyRichText`”; ciało jest kopią `packages/tldraw/src/lib/utils/text/richText.ts:152-165` (linie 159-163 ↔ 19-23 identyczne). Trzecie źródło prawdy to TipTapowe `editor.isEmpty` (`isNodeEmpty(this.state.doc)`, `@tiptap/core/src/Editor.ts:744-746`) używane w `comment-composer.tsx:229` i `:214`.

### D3. Zduplikowana ekstrakcja plain-text

`packages/commenting/src/canvas/comment-render.ts:98` (`generateText(doc, extensions, { blockSeparator: '\n' })`) ↔ `packages/tldraw/src/lib/utils/text/richText.ts:198-200` (to samo wywołanie, ta sama opcja). Komentarze nie mogą użyć `renderPlaintextFromRichText`, bo ta wiąże zestaw rozszerzeń z `editor.getTextOptions()` — brakuje pojęcia „profilu” schematu.

### D4. Zduplikowana konfiguracja sesji edycji

`packages/commenting/src/ui/comment-composer.tsx:180-181` (`enableCoreExtensions: { textDirection: false }`, `textDirection: 'auto'`) — komentarz `:178-179`: „Mirrors RichTextArea's setup” ↔ `packages/tldraw/src/lib/shapes/text/RichTextArea.tsx:192-193`. Plus potrójne `editor.getTextOptions().tipTapConfig?.extensions ?? tipTapDefaultExtensions` w `richText.ts:131-132`, `:196-197`, `:212-213` i dwukrotne składanie `tipTapConfig` w `Tldraw.tsx:247-249` i `TldrawImage.tsx:76-77`.

### D5. Przeciek przez granicę warstw: rdzeń „UI-free” zależy od bindingu React biblioteki

- Intencja: `AGENTS.md:22` („no default shapes, tools, or UI”), `AGENTS.md:136` („UI-free behavior”).
- Kod: `packages/editor/src/lib/utils/richText.ts:3` importuje `EditorProviderProps` z `@tiptap/react` — **wyłącznie dla jednego typu** w `TLTextOptions` (`:24`); mimo to `@tiptap/react` jest runtime-zależnością (`editor/package.json:58`) i trafia do `editor/api-report.api.md:16`. Rdzeń wykonuje też parsowanie ProseMirror w runtime (`richText.ts:57-59`, `getSchema` + `Node.fromJSON`) dla zbierania fontów, a klasa `Editor` przechowuje instancję edytora UI (`Editor.ts:2896`).
- Skutek: każdy konsument „gołego” `@tldraw/editor` (bez kształtów i UI) ściąga `@tiptap/core`, `@tiptap/pm` i `@tiptap/react`.

### D6. Granica klient/serwer — **czysto** (ważne, by nie przesadzić)

`@tldraw/sync-core` i `@tldraw/worker-shared` nie importują `@tiptap/*` w kodzie produkcyjnym (manifesty w KROK 0; jedyne trafienie to fuzzer testowy `sync-core/src/test/FuzzEditor.ts:15`). Walidacja rekordów na serwerze używa `richTextValidator` z tlschema, który nie zna TipTapa. **Biblioteka nie przecieka do bundla serwera.** Jedyne sprzężenie trwałego formatu to *słownik* (E), nie kod.

### D7. Trwały format = słownik schematu silnika

`TLRichText` (`TLRichText.ts:16-20`) jest strukturalnie ProseMirror-JSON, a nazwy węzłów (`doc`, `paragraph`, `heading`, `mention`) i marków (`bold`, `italic`, `code` — `tldraw/src/lib/utils/text/richText.ts:224-230`) pochodzą z rozszerzeń TipTapa. Konsekwencja zweryfikowana w źródłach: ProseMirror rzuca `RangeError("Unknown node type: …")` (`prosemirror-model/src/schema.ts:684`) przy węźle spoza schematu, a `generateText` robi `Node.fromJSON(schema, doc)` (`@tiptap/core/src/helpers/generateText.ts:24-25`). Dlatego `commenting` musiał dopisać własną sanityzację (`comment-render.ts:20-33`, `demoteHeadings`) — kolejna reguła kontraktu biblioteki zakodowana poza miejscem, które zna bibliotekę.

### Brak deklaracji wymienialności — ale jest rozjazd intencja-vs-kod

Dokumenty nie obiecują wymienialności TipTapa (KROK 0). Obiecują natomiast (1) rdzeń bez UI (`AGENTS.md:22,136`) i (2) jedną instancję TipTapa brany z `tldraw` (`rich-text.mdx:165`). Kod łamie (1) w D5, a (2) we własnych pakietach first-party: `commenting/package.json:61-63` i `mentions/package.json:60-64` deklarują własne `@tiptap/*`, a `comment-render.ts:1` / `comment-composer.tsx:1` importują z `@tiptap/core`, nie z `tldraw` (którego są zależnością: `commenting/package.json:66`). Piny są niespójne (`tldraw/package.json:59` `^3.12.1` vs `:63` `3.13.0`; `mentions/package.json:61,64` `3.13.0`), czyli dokładnie warunek „dual install” opisany w `releases/v4.2.0.mdx:31`.

---

## KROK 4 — Projekt ACL

### Zasada

Rozdzielam dwa pojęcia, które dziś są zlane:

1. **Dokument rich text** — dane domenowe tldraw, trwałe, niezależne od silnika (`TLRichText` już istnieje w tlschema i *nie* importuje TipTapa — to dobra podstawa).
2. **Silnik rich text** — parsowanie/renderowanie/edycja; dziś TipTap. Dostępny wyłącznie przez **wąski port** w `@tldraw/editor`, implementowany przez **adapter** w `tldraw`.

Świadomy punkt rozszerzeń (TipTap extensions, `getRichTextEditor()` dla własnych toolbarów) **zostaje**, ale przenosi się do modułu adaptera jako „engine-specific escape hatch” — reszta SDK z niego nie korzysta.

### 4.1 Value object: `RichTextDocument` (L1/L2, bez zależności zewnętrznych)

Lokalizacja: `packages/tlschema/src/misc/RichTextDocument.ts` (obok `TLRichText.ts`), eksport z tlschema. Jedyne miejsce wiedzy o **kształcie** zapisu.

```ts
/** Słownik węzłów/marków, który tldraw uznaje za SWÓJ trwały format (v1 = podzbiór ProseMirror-JSON). */
export type RichTextNodeType = 'doc' | 'paragraph' | 'heading' | 'text' | 'bulletList' | 'orderedList'
                             | 'listItem' | 'mention' | (string & {})          // otwarte dla rozszerzeń
export type RichTextMarkType = 'bold' | 'italic' | 'code' | 'highlight' | 'link' | 'strike' | (string & {})

export interface RichTextNode {               // zamiast `unknown` w TLRichText.content
  readonly type: RichTextNodeType
  readonly attrs?: Readonly<Record<string, unknown>>
  readonly content?: readonly RichTextNode[]
  readonly text?: string
  readonly marks?: readonly { type: RichTextMarkType; attrs?: Record<string, unknown> }[]
}

export const RichTextDocument = {
  fromPlaintext(text: string): TLRichText          // = dzisiejsze toRichText (TLRichText.ts:68)
  isEmpty(doc: TLRichText): boolean                // JEDNA definicja (zastępuje richText.ts:152 i comment-extensions.ts:18)
  walk(doc: TLRichText, visit: (n: RichTextNode, path: readonly RichTextNode[]) => void): void
  some(doc: TLRichText, pred: (n: RichTextNode) => boolean): boolean   // np. hasMention
  mapNodes(doc: TLRichText, f: (n: RichTextNode) => RichTextNode): TLRichText // np. demote heading
  restrictTo(doc: TLRichText, profile: RichTextProfile): TLRichText // sanityzacja do profilu (patrz 5.3)
}

/** Profil = nazwany zestaw dopuszczalnych węzłów, niezależny od silnika. */
export interface RichTextProfile {
  readonly id: 'shape' | 'comment' | (string & {})
  readonly nodes: ReadonlySet<RichTextNodeType>
  readonly fallbackBlock: 'paragraph'               // na co demotować nieznane bloki
}
```

Pseudokod `isEmpty` (zachowanie 1:1 z `richText.ts:159-163`):

```
if doc.content.length == 0 → true
if doc.content.length == 1 and (brak content lub content.length == 0) → true
→ false
```

Pseudokod `restrictTo` (uogólnienie `demoteHeadings`, `comment-render.ts:26-33`):

```
mapNodes(doc, n =>
  n.type ∈ profile.nodes or n.type == 'text' ? n
  : isBlock(n) ? { type: profile.fallbackBlock, content: n.content }   // bez attrs, jak dziś
  : n)
```

### 4.2 Port: `RichTextEngine` (L2, `@tldraw/editor`, zero importów `@tiptap/*`)

Lokalizacja: `packages/editor/src/lib/richtext/RichTextEngine.ts`.

```ts
export interface RichTextEngine {
  /** Konwersje bezstanowe — używane przez kształty, eksport, schowek, komentarze. */
  toHtml(doc: TLRichText, profile?: RichTextProfile): string
  toPlaintext(doc: TLRichText, profile?: RichTextProfile): string
  fromHtml(html: string, profile?: RichTextProfile): TLRichText
  /** Zbieranie fontów bez wystawiania węzła silnika. */
  collectFonts(doc: TLRichText, initial: RichTextFontVisitorState,
               visit: (n: RichTextNode, s: RichTextFontVisitorState, add: (f: TLFontFace) => void)
                      => RichTextFontVisitorState): TLFontFace[]
  /** Sesja edycji — tworzona przez komponent UI, oddaje dane domenowe. */
  createSession(opts: {
    element: HTMLElement; initial: TLRichText; profile?: RichTextProfile
    onChange(doc: TLRichText): void; onFocus?(): void; onBlur?(): void
    onKeyDown?(e: KeyboardEvent): boolean; onPaste?(e: ClipboardEvent): boolean
  }): RichTextSession
}

export interface RichTextSession {
  getDocument(): TLRichText
  setDocument(doc: TLRichText): void
  isEmpty(): boolean
  focus(at?: 'all' | 'end' | { x: number; y: number }): void   // zastępuje commands.focus('all') w EditingShape.ts:203
  getActiveFormats(): ReadonlySet<RichTextMarkType | RichTextNodeType>  // dla toolbaru
  toggle(format: RichTextMarkType | RichTextNodeType, attrs?: Record<string, unknown>): void
  getLinkAtSelection(): { href: string } | null
  setLink(href: string | null): void
  onSelectionChange(cb: () => void): () => void
  dispose(): void
  /** Escape hatch dla zaawansowanych integracji — typ znany tylko adapterowi. */
  readonly native: unknown
}
```

Zmiany w `Editor` (L2): `_currentRichTextEditor` przechowuje `RichTextSession` zamiast `TiptapEditor`; `TLTextOptions` dostaje `engine?: RichTextEngine` zamiast typu z `@tiptap/react`. Pole `tipTapConfig` przenosi się do `tldraw` przez **module augmentation** — wzorzec już używany w repo (`packages/tlschema/src/styles/TLTheme.ts:48`):

```ts
// packages/tldraw/src/lib/richtext/tiptap/augment.ts  (adapter)
declare module '@tldraw/editor' {
  interface TLTextOptions { tipTapConfig?: EditorProviderProps }
}
```

Dzięki temu źródło `@tldraw/editor` nie zna `@tiptap/react`, a użytkownicy `tldraw` widzą identyczny typ `options.text.tipTapConfig`.

### 4.3 Adapter: `TipTapRichTextEngine` (jedyne miejsce importów `@tiptap/*` w `tldraw`)

Lokalizacja: `packages/tldraw/src/lib/richtext/tiptap/` (nowy katalog). Wchłania: `utils/text/richText.ts` (część TipTapowa), `utils/text/tiptap.ts`, `literalTyping.ts`, `wrapSelection.ts` i logikę tworzenia `new TextEditor({...})` z `RichTextArea.tsx:128-196`.

```ts
export function createTipTapRichTextEngine(cfg: {
  extensions: Extensions                                  // domyślnie getTipTapDefaultExtensions()
  profiles?: Record<string, Extensions>                   // 'comment' → getTipTapDefaultExtensions({ heading:false }) + mention
}): RichTextEngine & { readonly kind: 'tiptap'; getTipTapEditor(s: RichTextSession): TiptapEditor | null }

// pseudokod najważniejszych metod
toPlaintext(doc, profile):
  if RichTextDocument.isEmpty(doc) return ''
  ext = extensionsFor(profile)
  safe = profile ? RichTextDocument.restrictTo(doc, profile) : doc
  return cache(doc, profile, () => generateText(toEngine(safe), ext, { blockSeparator: '\n' }))

toHtml(doc, profile):          // fix pustych akapitów z richText.ts:118 żyje TYLKO tu
  html = generateHTML(toEngine(restrict(doc, profile)), extensionsFor(profile))
  return html.replace(/<(p|h[1-6])([^>]*)><\/\1>/g, '<$1$2><br /></$1>')

fromHtml(html, profile):       return fromEngine(generateJSON(html, extensionsFor(profile)))

createSession(opts):
  tt = new Editor({ element, content: toEngine(opts.initial), extensions: extensionsFor(opts.profile),
                    enableCoreExtensions: { textDirection: false }, textDirection: 'auto',   // JEDNO miejsce (D4)
                    coreExtensionOptions: { clipboardTextSerializer: { blockSeparator: '\n' } },
                    onUpdate: ({ editor }) => opts.onChange(fromEngine(editor.getJSON())) })
  return wrapSession(tt)

// JEDYNE dwa rzutowania w całym repo (zastępują 13 miejsc z D1)
const toEngine   = (d: TLRichText): JSONContent => d as JSONContent
const fromEngine = (j: JSONContent): TLRichText => j as TLRichText
```

`@tldraw/mentions` pozostaje świadomie **wtyczką adaptera** (jest węzłem TipTap z definicji — `releases/v5.3.0.mdx:44`); jego importy `@tiptap/*` przenoszę do podkatalogu `packages/mentions/src/tiptap/`, a domenowy kontrakt (`MentionMember`, `resolveName`) zostaje poza nim.

---

## KROK 5 — Dowód izolacji i before/after

### 5.1 Wymiana silnika (np. TipTap → Lexical lub TipTap v3 → v4) dotyka tylko adaptera

| Obszar | Czy zmienia się przy wymianie silnika po refaktorze? | Dlaczego |
|---|---|---|
| **Trwały format** — rekordy `TLTextShape/TLGeoShape/TLNoteShape/TLArrowShape/TLComment`, `richTextValidator`, migracje tlschema | **Nie** | `TLRichText` + `RichTextDocument` są własnością tldraw; nowy adapter musi mapować `toEngine/fromEngine` na słownik v1. Brak nowej migracji, brak zmiany `.tldr` |
| **Serwer** — sync-core, worker-shared | **Nie** | już dziś czysty (D6); po refaktorze zostaje czysty |
| **Publiczne API `@tldraw/editor`** | **Nie** | `RichTextEngine`, `RichTextSession`, `TLTextOptions.engine` nie zawierają typów biblioteki; `editor/api-report.api.md` traci 3 linie `from '@tiptap…'` |
| **Kształty i narzędzia** (`TextShapeUtil`, `GeoShapeUtil`, `NoteShapeUtil`, `ArrowShapeUtil`, `EditingShape`) | **Nie** | wołają port (`editor.getRichTextEngine().toPlaintext(...)` / istniejące fasady `renderPlaintextFromRichText`), `session.focus('all')` |
| **UI React** (`RichTextArea`, `DefaultRichTextToolbar*`, `LinkEditor`) | **Nie** w ścieżce domyślnej | dostają `RichTextSession`, `getActiveFormats()`, `toggle()` |
| **commenting** | **Nie** | woła `engine.toHtml(body, commentProfile)` itd. |
| **Adapter** `packages/tldraw/src/lib/richtext/tiptap/**` | **Tak** | jedyne miejsce |
| **Wtyczka** `packages/mentions/src/tiptap/**` | **Tak** | węzeł konkretnego silnika |
| **Escape hatch** (`tipTapConfig`, re-eksport `Node/Mark/…`, `getTipTapEditor`) | **Tak — to kontrakt silnika** | świadomie silnikowo-specyficzny; zmiana = major tak jak dziś (`releases/v4.2.0.mdx:22`) |

### 5.2 Before / after dla zduplikowanych miejsc

| Miejsce | Before (dziś) | After |
|---|---|---|
| Pusty dokument | `tldraw/.../richText.ts:152-165` **i** `commenting/.../comment-extensions.ts:18-24` (kopia) **i** `editor.isEmpty` | `RichTextDocument.isEmpty(doc)`; `isEmptyRichText` i `isCommentEmpty` stają się 1-linijkowymi aliasami (potem usunięte, `isCommentEmpty` jest wewnętrzny) |
| Plain text | `richText.ts:198` + `comment-render.ts:98` | `engine.toPlaintext(doc)` / `engine.toPlaintext(doc, commentProfile)` |
| HTML | `richText.ts:113` + `comment-render.ts:82-84` (przez helper, ale z własnym sanitizerem) | `engine.toHtml(doc, profile)`; sanityzacja w `restrictTo`, nie w commenting |
| `as JSONContent` / `as TLRichText` | 13 miejsc w 4 plikach / 3 pakietach (D1) | 2 funkcje `toEngine/fromEngine` w adapterze |
| `state.doc.toJSON()` vs `getJSON()` | `RichTextArea.tsx:133` vs `comment-composer.tsx:232` | `fromEngine(editor.getJSON())` w `createSession` |
| Konfiguracja sesji | `RichTextArea.tsx:192-193` + `comment-composer.tsx:180-181` | jedno miejsce w `createSession` |
| Domyślne rozszerzenia | `richText.ts:131-132,196-197,212-213` + `Tldraw.tsx:247-249` + `TldrawImage.tsx:76-77` | jedno `createTipTapRichTextEngine({ extensions })` przekazane przez `options.text.engine` |
| Fonty w rdzeniu | `editor/.../richText.ts:53-59` (`getSchema` + `Node.fromJSON` w L2) | `engine.collectFonts(doc, initial, visit)` — L2 deleguje do portu; `visit` dostaje `RichTextNode`, nie `TiptapNode` |
| Narzędzie | `EditingShape.ts:203` `getRichTextEditor()?.commands.focus('all')` | `editor.getRichTextSession()?.focus('all')` |

**UI dostaje dane domenowe, nie surowy obiekt biblioteki.** Przykład toolbaru:

```tsx
// before — DefaultRichTextToolbarContent.tsx:84, :137
textEditor.chain().focus()[op]().run()
const isActive = textEditor.view ? textEditor.isActive(name, attrs) : false

// after
const session = useValue('rt', () => editor.getRichTextSession(), [editor])
const active  = useValue('fmt', () => session?.getActiveFormats() ?? EMPTY_SET, [session])
onSelect={() => session?.toggle('bold')}   isActive={active.has('bold')}
```

`DefaultRichTextToolbarContent` z propem `textEditor: TiptapEditor` (`tldraw/api-report.api.md:1453`) zostaje na okres deprecjacji jako wariant „engine-specific”.

### 5.3 Otwarte pytania zależne od kontraktu biblioteki — rozstrzygnięte

| Pytanie | Rozstrzygnięcie (źródło) | Gdzie zakodować |
|---|---|---|
| Czy `editor.getJSON()` i `editor.state.doc.toJSON()` dają to samo? (dziś używane zamiennie, D1) | **Tak** — `getJSON()` zwraca `this.state.doc.toJSON()` (`@tiptap/core@3.13.0 src/Editor.ts:712-717`) | `fromEngine` w adapterze; jedna ścieżka (`getJSON()`) |
| Co się dzieje z węzłem spoza schematu (np. `heading` w komentarzu z innego klienta)? | ProseMirror rzuca `RangeError("Unknown node type")` (`prosemirror-model/src/schema.ts:684`); `generateText` buduje węzeł przez `Node.fromJSON` (`@tiptap/core src/helpers/generateText.ts:24-25`) — więc **każda** ścieżka renderowania musi sanityzować | `RichTextDocument.restrictTo(profile)` wołane w adapterze przed `toEngine`; **nie** w `commenting` |
| Która definicja „pusty” obowiązuje: TipTapowe `isNodeEmpty` czy strukturalna tldraw? | Strukturalna — działa bez schematu i silnika (także w sync/eksporcie); TipTapowe `isEmpty` (`Editor.ts:744-746`) zostaje tylko wewnątrz `RichTextSession.isEmpty()` dla stanu interaktywnego | `RichTextDocument.isEmpty` (VO) |
| Czy wtyczki (mentions) mogą mieć własną kopię `@tiptap/*`? | Nie — mieszanie instancji ProseMirror rzuca przy budowie schematu (`tiptap.ts:1-3`, `rich-text.mdx:165`) | adapter jest jedynym właścicielem wersji; `mentions/commenting` biorą TipTapa z `tldraw` (peer), piny ujednolicone |
| Separator bloków przy plain-text i schowku | `'\n'` (dziś `richText.ts:199`, `comment-render.ts:98`, `RichTextArea.tsx:184-188`) — domyślne TipTapa to `'\n\n'` (`generateText.ts:23`) | stała w adapterze |

---

## KROK 6 — Weryfikacja i plan faz

### Kryterium sukcesu

```bash
rg -l "from ['\"]@tiptap/" packages --glob '!**/node_modules/**' --glob '!**/*.api.md'
```

zwraca **wyłącznie** pliki w `packages/tldraw/src/lib/richtext/tiptap/**` i `packages/mentions/src/tiptap/**` (wtyczka adaptera), plus testy tych katalogów. Dodatkowo: `rg "@tiptap" packages/editor/package.json packages/commenting/package.json` → 0 trafień; `rg "from '@tiptap" packages/editor/api-report.api.md` → 0.

| Plik | Dziś zna TipTapa | Po refaktorze |
|---|---|---|
| `editor/src/lib/utils/richText.ts` | tak (import) | **nie** (typy domenowe, delegacja do portu) |
| `editor/src/lib/editor/Editor.ts` | tak (`TiptapEditor`) | **nie** (`RichTextSession`) |
| `editor/src/index.ts` | tak (eksport aliasów) | **nie** po F5 (do tego czasu `@deprecated` re-eksport) |
| `tldraw/src/lib/utils/text/richText.ts` | tak | **nie** (fasady publiczne delegują do portu) |
| `tldraw/src/lib/utils/text/tiptap.ts`, `literalTyping.ts`, `wrapSelection.ts` | tak | przeniesione do `richtext/tiptap/` (**adapter**) |
| `tldraw/src/lib/shapes/text/RichTextArea.tsx` | tak | **nie** (`engine.createSession`) |
| `tldraw/src/lib/ui/components/Toolbar/DefaultRichTextToolbar.tsx` | tak | **nie** (`session.onSelectionChange`, `getLinkAtSelection`) |
| `tldraw/src/lib/ui/components/Toolbar/DefaultRichTextToolbarContent.tsx`, `LinkEditor.tsx` | tak (prop `TiptapEditor`) | **nie** w domyślnej ścieżce; wariant z `textEditor` deprecated do F5 |
| `tldraw/src/lib/tools/SelectTool/childStates/EditingShape.ts` | tak (`commands.focus`) | **nie** |
| `tldraw/src/lib/Tldraw.tsx`, `TldrawImage.tsx` | tak (`tipTapConfig`) | **nie** (przekazują `engine`) — `tipTapConfig` z augmentacji czyta tylko adapter |
| `tldraw/src/index.ts` | tak (re-eksport) | re-eksport z modułu adaptera (świadomy punkt rozszerzeń zostaje) |
| `commenting/src/canvas/comment-render.ts`, `ui/comment-composer.tsx`, `ui/comment-extensions.ts` | tak | **nie** (`engine` + `commentProfile`) |
| `mentions/src/mention-extension.ts`, `mention-suggestion.tsx` | tak | przeniesione do `mentions/src/tiptap/` (wtyczka) |
| tlschema (6 plików, słownik) | słownik, bez importu | słownik **zdefiniowany jako własny** (`RichTextDocument`) |

Bilans: **11 → 0** plików produkcyjnych importujących `@tiptap/*` poza katalogami adaptera (po przeniesieniu 5 z nich do adaptera/wtyczki i odcięciu 6), **9 → 0** plików znających TipTapa pośrednio, **4 → 2** pakiety z `@tiptap/*` w `dependencies` (`tldraw`, `mentions`), **3 → 2** api-reporty z importem `@tiptap` (editor znika; tldraw i mentions zostają z powodu świadomego punktu rozszerzeń).

### Koszt łamania kontraktu (nazwany wprost)

Usunięcie / zmiana typu w F5 jest **major** (`@tldraw/editor`, `tldraw`): `getRichTextEditor(): TiptapEditor` (`editor/api-report.api.md:1385`), `setRichTextEditor` (`:1618`), `TiptapEditor`/`TiptapNode` (`:3479`, `:3482`), `RichTextFontVisitor` z `TiptapNode` (`:2973`), `defaultAddFontsFromNode(node: Node_3)` (`tldraw/api-report.api.md:1134`), `DefaultRichTextToolbarContentProps.textEditor` (`:1453`). Dotyka co najmniej 13 plików konsumentów w `apps/`/`templates/` i nieznanej liczby integracji zewnętrznych, które `rich-text.mdx:187,276,288` uczy wołać TipTapa bezpośrednio — trzeba przepisać te sekcje docs. Precedens kosztu: v4.2.0 (TipTap v2→v3) wymagał osobnej sekcji migracyjnej i opisu „dual-install symptom” (`releases/v4.2.0.mdx:22-31`). Fazy F0–F4 są **addytywne** (minor), F5 to osobna zmiana na granicy majora.

### Plan faz (guard-first, Branch by Abstraction + Strangler Fig, kolejność Mikado)

Każda faza = osobny PR, cofalna niezależnie; żadna z F0–F4 nie zmienia obserwowalnego zachowania ani api-reportu poza dodaniem symboli.

**F0 — Zabezpieczenie (testy charakteryzujące, zero zmian w `src/`).**
- Fixture'y `TLRichText`: 3 formy pustego dokumentu (`richText.ts:153-158`), heading, listy, link, highlight, mention, węzeł nieznany, RTL.
- Utrwalić dziś: `renderPlaintextFromRichText`, `renderHtmlFromRichText(WithExtensions)`, `renderRichTextFromHTML`, `getFontsFromRichText`, `isEmptyRichText`, `renderCommentHtml/Plaintext`, `isCommentEmpty` — **parowo** (shape vs comment) na tych samych fixture'ach, żeby duplikaty D2/D3 miały wspólny wzorzec.
- Test round-trip `toRichText → toHtml → fromHtml` i test „heading w komentarzu nie rzuca”.
- api-report jako strażnik (już w CI przez api-extractor) — w F1–F4 dopuszczalne tylko dodania.
- Cofnięcie: usunięcie testów.

**F1 — VO i port (addytywnie, `@internal`).**
- `RichTextDocument` w tlschema (`isEmpty`, `walk`, `some`, `mapNodes`, `restrictTo`, `RichTextProfile`); `RichTextEngine`/`RichTextSession` w `@tldraw/editor/src/lib/richtext/`.
- `isEmptyRichText` i `isCommentEmpty` → delegują do `RichTextDocument.isEmpty` (testy F0 zielone).
- Cofnięcie: revert PR; nic poza delegacją nie zależy od nowych typów.

**F2 — Adapter (Branch by Abstraction).**
- `packages/tldraw/src/lib/richtext/tiptap/`: `createTipTapRichTextEngine`, `toEngine/fromEngine`, `createSession`; przeniesienie `tiptap.ts`, `literalTyping.ts`, `wrapSelection.ts` (stare ścieżki zostają jako re-eksport, publiczne nazwy bez zmian).
- `Tldraw.tsx`/`TldrawImage.tsx` tworzą silnik i przekazują `options.text.engine`; publiczne `render*FromRichText` delegują do `editor.getRichTextEngine()` (fallback do dzisiejszej ścieżki, gdy `engine` brak — przełącznik).
- Cofnięcie: przełącznik/revert; publiczne sygnatury nietknięte.

**F3 — Strangler po konsumentach (po jednym PR na pakiet/obszar).**
- 3a `commenting`: `comment-render.ts` → `engine.toHtml/toPlaintext(body, commentProfile)`; `demoteHeadings` → `restrictTo`; `comment-composer.tsx` → `engine.createSession`; usunąć `@tiptap/*` z `commenting/package.json`.
- 3b `tldraw` UI: `RichTextArea.tsx` → `createSession`; toolbar → `getActiveFormats/toggle`; `EditingShape.ts:203` → `session.focus('all')`. `Editor` dostaje `getRichTextSession()`; `getRichTextEditor()` zwraca `getTipTapEditor(session)` (zachowanie bez zmian).
- 3c `mentions`: przeniesienie do `src/tiptap/`, TipTap jako `peerDependency` przez `tldraw`; ujednolicenie pinów `@tiptap/*` w `tldraw`/`mentions`.
- Cofnięcie: każdy podkrok osobno.

**F4 — Odcięcie rdzenia od `@tiptap/*` (bez łamania typów).**
- `getFontsFromRichText` deleguje do `engine.collectFonts`; `TLTextOptions.tipTapConfig` przeniesione do augmentacji w adapterze (wzorzec `TLTheme.ts:48`), `TiptapEditor`/`TiptapNode` zdefiniowane w `tldraw` i re-eksportowane z `@tldraw/editor` jako `@deprecated` (type-only, bez runtime dependency — wymaga weryfikacji, czy api-extractor akceptuje kierunek; jeśli nie: zostawić aliasy do F5 z `@tiptap/core` jako `peerDependency` typu `optional`).
- Usunąć `@tiptap/react` z `editor/package.json`.
- Cofnięcie: revert; augmentacja jest kompatybilna źródłowo dla użytkowników `tldraw`.

**F5 — Major (osobna zmiana, poza tym planem refaktoru, bo zmienia kontrakt).**
- Usunięcie zdeprecjonowanych aliasów z `@tldraw/editor`, zmiana typu `getRichTextEditor`/`RichTextFontVisitor`/`DefaultRichTextToolbarContentProps`, aktualizacja `rich-text.mdx:187,276,288`, nota migracyjna w release notes.

### Ryzyka planu

- **Wydajność:** dzisiejsze `WeakCache` po tożsamości dokumentu (`richText.ts:97`, `:150`) muszą zostać w adapterze z kluczem `(doc, profile)`; pomiar tekstu jest na ścieżce gorącej.
- **Sesja a React Strict Mode:** `RichTextArea.tsx:124-127` opisuje celową rezygnację z `EditorProvider` — `createSession` musi zachować tę semantykę (test F0 na podwójny mount).
- **Słownik jako kontrakt:** po F1 nazwy węzłów stają się jawną częścią formatu tldraw; dodanie węzła przez rozszerzenie użytkownika nadal jest możliwe (`(string & {})`), ale nieznane węzły w profilu `comment` są demotowane, jak dziś.

---

## Nota recenzenta (sesja główna, 2026-11-10)

Kryterium sukcesu sprawdzone niezależnie (`grep -rlE "from '@tiptap/"` w `packages/*/src`):

- 11 plików produkcyjnych: tldraw 6, commenting 2, mentions 2, editor 1;
- 4 testy;
- 19 linii w 3 plikach api-report (editor 3, mentions 3, tldraw 13);
- 4 manifesty z `@tiptap/*`.

Liczby zgadzają się z planem.

**Doprecyzowanie:**
- piny wersji są faktycznie mieszane (`^3.12.1` obok dokładnych `3.13.0` w `tldraw` i `mentions`);
- `rich-text.mdx:165` („import TipTap's building blocks from tldraw”) to jednak rada dla integratorów aplikacji, a nie reguła dla pakietów monorepo;
- „łamanie własnej reguły” przez commenting i mentions jest więc ryzykiem dla ich konsumentów, a nie udowodnionym błędem.

**Poza zakresem 01:** dla obszaru strzałek i wiązań kod nie ma zewnętrznych zależności (`01-domain-distillation.md`, krok 0). ACL dotyczy więc innej subdomeny (Generic: rich text) niż niezmiennik z 01.
