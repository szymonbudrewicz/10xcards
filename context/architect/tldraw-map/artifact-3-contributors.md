# Artefakt 3 — Kontekst współtwórców (git)

> Kopia mapy cudzego repo (tldraw/tldraw) do raportu 10xArchitect. Nazwiska zastąpiono rolami; liczby i ścieżki bez zmian.

Repo: `tldraw/tldraw`, HEAD `844f6f484`. Wejście: `artifact-1-territory.md`, `artifact-2-structure.md`.
Okno: 12 miesięcy (2025-11-05 → 2026-11-05). **Ostatni kwartał** = 2026-08-05 → 2026-11-05.

Metoda: `git log --no-merges --since="12 months ago" -- <ścieżki>` przetworzony skryptem. Pominięte: boty (`huppy-bot`, `github-actions`, `dependabot`) i commity z agentem jako **autorem** (w oknie: 0). Commity człowieka z agentem jako **współautorem** zostają — człowiek prowadził zmianę. Bez e-maili; tożsamości połączone po nazwie (dwie osoby mają po dwa adresy, nazwa ta sama). W tej kopii nazwiska zastąpiono rolami. Tematy = `typ(scope)` z konwencji commitów.

**Bus factor** = najmniejsza liczba osób, które razem mają ≥ 50% commitów obszaru. **Regularni** = osoby z ≥ 5% i ≥ 3 commitami. **Aktywny** = commit w tym obszarze w ostatnim kwartale.

Kontekst zespołu: ~15 regularnych osób w całym repo. Skupienie w jednej-dwóch głowach **nie jest** tu normą jak w zespole 2–3-osobowym, więc bus factor 1 traktuję jako ryzyko.

## Dlaczego te obszary

| # | Obszar (język produktu) | Gdzie w kodzie | Powód z artefaktów 1–2 |
|---|---|---|---|
| 1 | Interakcje na płótnie: narzędzia, kształty, strzałki | `packages/tldraw/src/lib/{tools,shapes,bindings}` | 60–66% `fix`, cykl strzałek, `fix(select)` 35× |
| 2 | Silnik edytora | `packages/editor/src/lib/editor` | `Editor.ts` plik nr 1, pętla runtime z eksportem SVG |
| 3 | Interfejs SDK (menu, paski, dialogi) | `packages/tldraw/src/lib/ui` | cykl 58 plików niewidoczny dla CI |
| 4 | Zapis i synchronizacja plików tldraw.com | `apps/dotcom/sync-worker/src` | skok 103 commitów w 26Q3, cykl flagi ↔ autoryzacja |
| 5 | Kontrakt klient ↔ backend tldraw.com | `packages/dotcom-shared` | 88% współzmian z `dotcom`, fan-in 100 |
| + | Schemat dokumentu i migracje | `packages/tlschema` | cykl 33 plików, 45% współzmian z `tldraw` |

## Podsumowanie: bus factor i aktywność

| Obszar | Commity (ludzie) | Osób | **Bus factor** | Regularni | Lider | Lider aktywny w ostatnim kwartale? |
|---|---|---|---|---|---|---|
| Interakcje na płótnie | 242 | 14 | **1** | 3 | lider projektu (55%) | **tak** — 78 commitów, ostatni 2026-10-19 |
| Silnik edytora | 200 | 16 | **1** | 4 | lider projektu (53%) | **tak** — 52 commity, ostatni 2026-10-19 |
| Interfejs SDK | 170 | 17 | 2 | 3 | lider projektu (36%) + maintainer UI i i18n (26%) | tak / tak (18 / 11) |
| Sync worker tldraw.com | 207 | 10 | 2 | 5 | maintainer backendu A (31%) + maintainer backendu B (22%) | tak / tak (29 / 42) |
| Kontrakt `dotcom-shared` | 106 | 10 | 2 | 6 | maintainer backendu A (41%) + maintainer backendu B (13%) | tak / tak (15 / 13) |
| Schemat i migracje | 50 | 9 | 2 | 5 | lider projektu (36%) + maintainer UI i i18n (32%) | **słabo** — 1 / 3 commity w kwartale |

## Obszary szczegółowo

### 1. Interakcje na płótnie (`tools`, `shapes`, `bindings`) — bus factor **1**

| Osoba | Commity | Ostatni w obszarze | W ost. kwartale | Tematy |
|---|---|---|---|---|
| lider projektu | 132 (55%) | 2026-10-19 | 78 | `fix(select)` 33, `fix(tldraw)` 13, `fix(arrows)` 12, `fix(draw)` 8 |
| maintainer UI i i18n | 40 (17%) | 2026-11-03 | 4 | `feat(tldraw)`, `refactor(shapes)` |
| maintainer backendu A | 15 (6%) | 2026-10-22 | 1 | drobne `fix`/`feat` |
| kontrybutor kształtów (strzałki) | 11 (5%) | 2026-09-04 | 1 | `fix(arrows)` 3, `feat(frame)`, `fix(notes)` |
| kontrybutor silnika (refaktoryzacje) | 7 (3%) | 2026-10-27 | 5 | `fix(select)` 2 |

Wniosek: wiedza o maszynach stanów narzędzi (select, eraser, draw) i strzałkach jest skupiona u jednej osoby, prowadzącej teraz serię poprawek (np. `fix(select): don't select a locked group by clicking its child`, `refactor(select): remove dead state…`). Przy strzałkach drugi kontakt: **kontrybutor kształtów (strzałki)** (ostatnia aktywność we wrześniu).

### 2. Silnik edytora (`editor/src/lib/editor`) — bus factor **1**

| Osoba | Commity | Ostatni | W ost. kwartale | Tematy |
|---|---|---|---|---|
| lider projektu | 105 (53%) | 2026-10-19 | 52 | `fix(editor)` 61, `feat(editor)` 12, `perf(editor)` 4 |
| maintainer UI i i18n | 20 (10%) | 2026-10-20 | 3 | różne |
| maintainer backendu A | 18 (9%) | 2026-10-22 | 3 | `fix(editor)` 6, **`perf(editor)` 4** |
| kontrybutor silnika (testy) | 12 (6%) | 2026-10-19 | 5 | `fix(editor)` 7, `test(editor)`, `spike(editor)` |
| kontrybutor silnika (refaktoryzacje) | 9 (5%) | 2026-10-19 | 8 | `fix(editor)` 4, `refactor(editor)` 3 |
| kontrybutor build i tooling | 9 (5%) | 2026-08-20 | 1 | `feat(editor)` 3 (m.in. OverlayUtil) |

Wniosek: lider jak w obszarze 1. Wydajność — **maintainer backendu A**; testy i spike'i — **kontrybutor silnika (testy)**; refaktoryzacje — **kontrybutor silnika (refaktoryzacje)** (rosnąca aktywność).

### 3. Interfejs SDK (`tldraw/src/lib/ui`) — bus factor 2

| Osoba | Commity | Ostatni | W ost. kwartale | Tematy |
|---|---|---|---|---|
| lider projektu | 61 (36%) | 2026-10-19 | 18 | `fix(tldraw)` 22, `feat(tldraw)` 4 |
| maintainer UI i i18n | 45 (26%) | 2026-11-03 | 11 | `fix(tldraw)` 12, `feat(ui)` 2 — i18n, UI |
| maintainer backendu A | 14 (8%) | 2026-10-26 | 8 | `feat`/`refactor(tldraw)` |
| kontrybutor silnika (testy) | 7 (4%) | 2026-07-23 | **0** | `feature(tldraw)` 3 |
| kontrybutor UI (minimapa, schowek) | 7 (4%) | 2026-04-29 | **0** | `fix(minimap)`, `fix(clipboard)` — ostatni commit w repo 2026-09-25 |

Wniosek: dwie aktywne osoby. Przy rozplątywaniu cyklu rejestru komponentów pytać **maintainer UI i i18n** (kampania i18n dotknęła większości UI).

### 4. Zapis i synchronizacja plików tldraw.com (`sync-worker`) — bus factor 2

| Osoba | Commity | Ostatni | W ost. kwartale | Tematy |
|---|---|---|---|---|
| maintainer backendu A | 65 (31%) | 2026-11-04 | 29 | `feat(dotcom)` 16, `fix(dotcom)` 15, `chore(dotcom)` 8 |
| maintainer backendu B | 45 (22%) | 2026-11-02 | **42** | `feat(dotcom)` 22, `perf(dotcom)` 5, `refactor(dotcom)` 5 |
| były maintainer backendu | 24 (12%) | 2026-04-23 | **0** | backend, `fix(sync-worker)` — **ostatni commit w repo 2026-04-23** |
| lider projektu | 22 (11%) | 2026-10-15 | 12 | `fix(dotcom)` 9 |
| maintainer UI i i18n | 20 (10%) | 2026-11-03 | 12 | `feat(dotcom)` 6 |
| kontrybutor integracji MCP | 9 (4%) | 2026-11-05 | 8 | `feat(mcp)` — integracja MCP |

Wniosek: wiedza najlepiej rozproszona (5 regularnych). **maintainer backendu B** prowadzi bieżącą kampanię (42 z 45 commitów w ostatnim kwartale — skok z 26Q3). **Były maintainer backendu** od kwietnia jest nieaktywny w repo — jego decyzje trzeba czytać w PR-ach, a nie pytać o nie.

### 5. Kontrakt klient ↔ backend (`dotcom-shared`) — bus factor 2

| Osoba | Commity | Ostatni | W ost. kwartale | Tematy |
|---|---|---|---|---|
| maintainer backendu A | 43 (41%) | 2026-10-29 | 15 | `chore(zero)` 6, `feat(dotcom)` 8 — schemat Zero |
| maintainer backendu B | 14 (13%) | 2026-11-02 | 13 | `feat`/`refactor(dotcom)` |
| maintainer UI i i18n | 12 (11%) | 2026-11-03 | 5 | `fix(dotcom)` |
| lider projektu | 12 (11%) | 2026-09-09 | 3 | `feat(dotcom)` |
| kontrybutor build i tooling | 9 (8%) | 2026-10-30 | 4 | `build`, `refactor(dotcom)` |
| kontrybutor dotcom | 6 (6%) | 2026-07-30 | **0** | `refactor`/`fix(dotcom)` |

Wniosek: **maintainer backendu A** zna synchronizację schematu Zero z typami — kluczowa osoba dla niewiadomej z artefaktu 1 (czy `dotcom-shared` i schemat Postgres/Zero zmieniają się zgodnie).

### + Schemat dokumentu i migracje (`tlschema`) — bus factor 2, niska bieżąca aktywność

| Osoba | Commity | Ostatni | W ost. kwartale | Tematy |
|---|---|---|---|---|
| lider projektu | 18 (36%) | 2026-08-23 | 1 | `fix(tlschema)` 3 |
| maintainer UI i i18n | 16 (32%) | 2026-09-14 | 3 | `chore`, `test` |
| kontrybutor build i tooling | 4 (8%) | 2026-09-30 | 2 | `build` |
| kontrybutor silnika (testy) | 4 (8%) | 2026-07-29 | 0 | `fix(tlschema)` |
| były maintainer backendu | 3 (6%) | 2026-01-21 | 0 | — |

Wniosek: obszar stabilny, mało zmian — ale migracje dokumentów są nieodwracalne dla użytkowników. Od 2,5 miesiąca nikt tu nie pracował regularnie: wiedza jest „zimna”.

## Udział agentów (współautorstwo)

W całym repo: 233 z 1820 policzonych commitów (~13%) ma trailer `Co-authored-by` z agentem (Claude); agent nie jest autorem żadnego commita. Liczone jako praca człowieka, który prowadził zmianę.

Fakt o źródle wiedzy: przy zmianach powstałych we współpracy z agentem uzasadnienie decyzji jest zwykle zapisane w opisie PR. Dla bieżącej kampanii w sync-workerze (26Q3–26Q4) opisy PR są więc pierwszym źródłem kontekstu, a rozmowa z autorem — drugim.

## Niewiadome

- Git nie mówi, **kto jest formalnym właścicielem** obszaru ani kto nadal pracuje w firmie — tylko kto commitował. Repo nie ma pliku `CODEOWNERS` (sprawdzone: `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`).
- Brak recenzentów PR w danych: osoba, która recenzuje, może znać obszar lepiej niż autor commitów. Do sprawdzenia przez `gh pr list --search reviewed-by:` w Deep Focus.
- Duży udział lidera może częściowo wynikać ze stylu pracy (wiele małych PR-ów), a nie z wyłączności wiedzy.

## Wnioski dla mapy

- **Bus factor 1** w dwóch najbardziej kruchych obszarach SDK (interakcje na płótnie i silnik) — ta sama osoba, aktywna. Ryzyko organizacyjne, nie bieżąca dostępność.
- tldraw.com ma lepiej rozproszoną wiedzę (maintainer backendu A + maintainer backendu B, oboje bardzo aktywni).
- Dwie „zimne” strefy: **migracje schematu** (mało pracy od sierpnia) i **wiedza byłego maintainera backendu** (nieaktywny od kwietnia).
