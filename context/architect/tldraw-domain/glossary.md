---
title: "Słownik domeny: zaznaczenie, przesuwanie, strzałki, wiązania"
created: 2026-11-10
type: glossary
source: context/domain/01-domain-distillation.md
---

# Słownik dla agentów

| Termin | Co znaczy | Nazwa w kodzie | Jak tego NIE nazywać |
|---|---|---|---|
| Wiązanie (binding) | Osobny, kierunkowy rekord relacji dwóch kształtów: strzałka → cel | `TLArrowBinding`, `fromId`/`toId` | „połączenie w propsach strzałki”, „link” |
| Terminal | Koniec strzałki jako rola: `start` lub `end`; najwyżej jedno wiązanie na terminal | `terminal: 'start' \| 'end'` | „handle” (to uchwyt UI), „point” (to widoczny punkt po przycięciu) |
| Związany terminal | Terminal, którego pozycja wynika z wiązania; prop `start`/`end` jest wtedy ignorowany | `getArrowTerminalsInArrowSpace` | „terminal z pozycją w props” |
| Kotwica | Punkt 0–1 w granicach geometrii celu | `normalizedAnchor` | „offset”, „pozycja w pikselach” |
| Precyzyjne / nieprecyzyjne | `isPrecise:true`: celuj w kotwicę; `false`: celuj w **środek** celu | `isPrecise` | „imprecise = krawędź”; parametr `forceImprecise` działa odwrotnie do nazwy |
| Dokładne | Grot wchodzi w kształt aż do kotwicy | `isExact` | mylenie z `isPrecise` |
| Zaznaczenie | Stan UI: co użytkownik wybrał | `getSelectedShapeIds()` | „kształty przesuwane” (to inny kontekst) |
| Przesuwane razem | Kształty, które w **tej operacji** się ruszają, połączone wiązaniami strzałek (klaster) | `shapesMovingTogether` (layout); w geście `movingShapes` | „zaznaczone” (pokrywa się tylko w geście z UI) |
| Gest przesunięcia | Interaktywne przeciąganie, hooki co klatkę | `select.translating`, `Translating` | „nudge” |
| Ruch jednorazowy | nudge/align/distribute/stack/pack/stretch/resizeToBounds; start→translate→end na kopii roboczej | `getChangesToTranslateShapeByPageDelta` | „gest”, „translate” bez doprecyzowania |
| Izolacja | Rozdzielenie związanych kształtów (usunięcie, kopia, duplikat) z zapieczeniem pozycji przed usunięciem wiązania | `onBeforeIsolateFromShape/ToShape`, `isolateShapes` | „unbind” (odpięcie przy translate nie używa izolacji) |
| Odpięcie | Usunięcie wiązania terminala bez hooków izolacji | `removeArrowBinding` | „isolate” |
| Klaster | Kształty z listy wejściowej połączone rekurencyjnie wiązaniami strzałek, przesuwane jako jedność | `collectShapesViaArrowBindings` | „grupa” (grupa to kształt `group`) |
| Grupa | Kształt-kontener bez wyglądu; strzałka nie może się z nim związać, tylko z jego dzieckiem | `group`, `GroupShapeUtil` | „klaster”, „zaznaczenie wielu” |
