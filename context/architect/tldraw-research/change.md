---
change_id: selection-translate-flow
title: Deep Focus przepływu zaznaczenia i przesunięcia kształtu
status: preparing
created: 2026-11-10
updated: 2026-11-10
archived_at: null
---

## Notes

Badam przepływ zaznaczenia i przesunięcia kształtu (z grupami i strzałkami) od packages/tldraw/src/lib/tools/SelectTool/SelectTool.ts przez packages/editor/src/lib/editor/Editor.ts do shapes/arrow + bindings, bo context/map/repo-map.md wskazała strefy ryzyka 1 i 2: 60–66% commitów fix, fix(select) 35×, cykl strzałek, SelectTool ciągnie 403 moduły, bus factor 1. Tylko analiza stanu obecnego — bez refaktoru (M4L3).
