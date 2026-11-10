---
title: "Raport architektoniczny — moduł 4 (10xArchitect)"
created: 2026-11-10
type: architect-report
author: Szymon Budrewicz, z agentem Claude Code
---

# Raport architektoniczny — moduł 4 (10xArchitect)

## 1. Opisane projekty

| Repo | Stack | Skala (orientacyjnie) | Artefakty |
|---|---|---|---|
| **tldraw/tldraw** (klon @ `844f6f484`, cudze repo) | TypeScript (TS 7), React, pnpm monorepo, Vitest; tldraw.com: Cloudflare Durable Objects, Zero/Postgres | SDK w warstwach `utils → state → store → tlschema → editor → tldraw` plus aplikacja tldraw.com; `Editor.ts` to plik nr 1 (128 commitów/rok) | L2, L3, L4, L5 |

Wszystkie cztery artefakty powstały na jednym repo. Oryginały są w klonie (`tldraw/context/`), a kopie, z rolami zamiast nazwisk, w `context/architect/tldraw-{map,research,refactor,domain}/`.

## 2. Mapa projektu (L2: `tldraw-map/repo-map.md`)

- **Dwa produkty w jednym monorepo:** SDK tablicy (`packages/editor` jako silnik, `packages/tldraw` z kształtami, narzędziami i UI) oraz aplikacja tldraw.com. Warstwy SDK są czyste: zero importów w górę i zero obejść publicznego `index.ts`.
- **Strefa ryzyka nr 1: interakcje na płótnie** (`SelectTool`, `shapes/arrow`, `bindings`). Trzy niezależne sygnały:
  - historia: 60–66% commitów to `fix`, w tym 35× `fix(select)`;
  - graf: `SelectTool` ciągnie 403 moduły;
  - ludzie: bus factor 1.
- **Ślepa plama CI:** cykl 58 plików w UI, którego `check-circular-deps` nie widzi, bo dzieli foldery na osobne partie.
- **„Wygląda groźnie, ale nie jest”:** `api-report.api.md` (generowany i sprawdzany w CI), cykl `Editor.ts` z managerami (same importy typów).
- **Unknowns:** okno historii tylko 1 rok; graf liczony przez TS 5.9 zamiast TS 7; brak widoczności Durable Objects, Zero i flag funkcji.

## 3. Analiza ficzera (L3: `tldraw-research/research.md`)

- **Przepływ:** „kliknij kształt i przeciągnij go” (z grupami, strzałkami i ramkami). To kandydat A z mapy, bo łączy strefy ryzyka 1 i 2 i da się go zweryfikować lokalnie przez `TestEditor`.
- **Overview:**
  1. Zdarzenie DOM trafia do kolejki edytora (najwyżej jeden `pointer_move` na klatkę).
  2. Maszyna stanów prowadzi je przez `idle → pointing_shape → translating`.
  3. Stan zmienia się w jednym miejscu: `Translating.ts` (679 linii) liczy pozycje jako „snapshot + delta” i robi jedno `updateShapes`, czyli jeden `store.put` na ruch.
  4. Cały gest to jeden wpis historii, a strzałka podąża za celem przez geometrię wyliczaną, a nie przez zapis.
- **Technical debt:**
  1. **`'select.translating'` jako string w 28 plikach** (14 produkcyjnych) i 9 wejść przez `setCurrentTool`. Typ `TranslatingInfo` nie jest w publicznym API. **[ast-grep: doprecyzowane z 32 do 28]**
  2. **Dwie ścieżki hooków `onTranslate*`:** gest na wielu klatkach i 7 metod edytora na kopii roboczej. Żaden test nie sprawdza tego kontraktu dla 7 metod. **[ast-grep: `getChangesToTranslateShape` ma 1 wywołanie, a wrapper 7]**
  3. **Gałęzie strażnicze bez testów** (read-only, zablokowany cel, `isToolLocked`, limit klonów) i brak E2E.

  Weryfikacja: 11 twierdzeń sprawdzonych ast-grepem, 0 obalonych, 5 doprecyzowanych.

## 4. Plan refaktoryzacji (L4: `tldraw-refactor/plan.md`)

- **Co i w jakim kształcie:** opcja ① **C3**, ujednolicenie dwóch ścieżek hooków przesunięcia. Docelowo powstanie jedna implementacja z etapem `start|update|end|one-off`, wzorem rotacji (`applyRotationToSnapshotShapes`).
  - Ta zmiana dostarcza tylko **siatkę bezpieczeństwa**, bo przegląd planu (F1) wykazał, że helper z dwiema semantykami byłby unifikacją tylko z nazwy.
  - Sonda w planowaniu potwierdziła błąd: `nudgeShapes` nadpisuje zapis terminala strzałki (`{-999,-999}` zamiast `{0,0}`).
- **Czego świadomie NIE robimy:**
  - żadnych zmian w `packages/*/src/lib`;
  - naprawa błędu i helper `applyTranslateHooks` to dwie kolejne, osobne zmiany;
  - C4 (reguły strzałki) odrzucony jako refaktor, bo to pytanie domenowe;
  - C5, C7 i C9 odrzucone na podstawie historii.
- **Fazy:**
  1. Guardy na kontraktach sąsiednich: strzałka z grupą, kolejność efektów wiązań. *Auto:* `vitest run` na 2 plikach. *Ręcznie:* przegląd asercji.
  2. Charakteryzacja obu ścieżek hooków i para „test pinujący + `it.fails`” dla znanego błędu. *Auto:* `vitest run`, `it.fails` raportuje „expected fail”, a `pnpm test-ci` i `pnpm lint` przechodzą. *Ręcznie:* czy pin oddaje obecne zachowanie.

## 5. Domena wg DDD (L5: `tldraw-domain/01..03`, `glossary.md`)

- **Ubiquitous language:**
  - *wiązanie* (kierunkowy rekord strzałka → cel, jeden na *terminal*);
  - *kotwica* i *isPrecise*;
  - *zaznaczenie* vs *przesuwane razem* (`shapesMovingTogether`);
  - *izolacja* vs *odpięcie*.
- **Najważniejsze rozjazdy model-vs-kod:**
  - **D-01:** dokumenty nie wiążą losu wiązania z zaznaczeniem, a kod strzałek decyduje właśnie zaznaczeniem (`ASU:582-594`).
  - **D-02:** ta sama reguła „ruszają się razem” ma dwa predykaty: zbiór operacji (layout/flip) i zaznaczenie (translate/nudge).
  - **D-03:** komentarze w kodzie i w teście wciąż opisują regułę z 2021 („unbind”), choć #2424 ją zmienił.
  - **D-05:** „imprecise” ma w dokumentach 3 definicje.
- **Niezmiennik #1 i agregat.** Powstały dwa niezależne wyniki, oba zostają:
  - **Destylacja (01):** I-06/I-07 „strzałka przesuwana razem z celem zachowuje wiązanie”. Agregat *Arrow Connection* (strzałka + ≤2 wiązania) z jednym predykatem „moving together”. Gotowe, gdy `onTranslateStart` nie czyta zaznaczenia, a `it.fails` z L4 przechodzi.
  - **Plan niezmiennika (02):** **INV-LOCK**, nienaruszalność zablokowanego poddrzewa. 25 plików, dwa konkurujące predykaty (`.isLocked` 35× vs `isShapeOrAncestorLocked` 23×), dokumentacja nieaktualna od #10334. Zamiast pełnego agregatu: minimalny strażnik `ShapeLockPolicy` plus kontrola w `beforeChange` store'a, w fazach F0–F7.
- **ACL (03):** przecieka **TipTap** (`@tiptap/*`) przez 6 warstw: trwały format (słownik węzłów w tlschema), rdzeń `editor`, kształty i narzędzia, UI, pakiety commenting/mentions, publiczne API. Dziś: 11 plików produkcyjnych w 4 pakietach, 19 linii w 3 plikach api-report (sprawdzone grepem niezależnie od agenta). Port `RichTextEngine` i adapter TipTap. Faza łamiąca kontrakt (`getRichTextEditor(): TiptapEditor`) jest wydzielona na granicę wersji major.

## 6. Decyzje, które należą do mnie

AI przygotowało mapę i ranking stref ryzyka. To ja wybrałem cudze repo (tldraw) zamiast 10xCards, bo moduł dotyczy pracy z dużym, cudzym kodem z wieloletnią historią. Wybrałem też przepływ A, bo da się go zweryfikować lokalnie, bez infrastruktury tldraw.com.

W L4 przyjąłem zawężenie planu z przeglądu w świeżym kontekście (F1 Fix A): najpierw siatka testów, naprawa i helper osobno. Przypiąłem znany błąd testem zamiast naprawiać go przy okazji, bo faza refaktoru nie może zmieniać zachowania. C4 zatrzymałem świadomie jako pytanie domenowe, a nie strukturalne.

W L5 agent planu niezmienników wybrał INV-LOCK i pominął regułę strzałek, bo zaczynał od dokumentów, które o niej milczą. Nie przyjąłem jego #1 bez zastrzeżeń ani go nie nadpisałem. Zostawiłem oba wyniki jako niezależne wejścia z notą recenzenta, bo ta rozbieżność sama jest wnioskiem o metodzie: reguła nieopisana w dokumentach jest niewidoczna dla analizy „od dokumentów”.

Przy weryfikacji poprawiłem dwie przesadzone tezy agentów: `reparentShapes` z `ignoreShapeLock` jest celowe, a reguła „TipTap z tldraw” dotyczy integratorów, a nie pakietów monorepo.
