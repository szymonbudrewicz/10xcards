# Artefakt 1 — Terytorium (historia gita)

> Kopia mapy cudzego repo (tldraw/tldraw) do raportu 10xArchitect. Nazwiska zastąpiono rolami; liczby i ścieżki bez zmian.

Repo: `tldraw/tldraw`, HEAD `844f6f484` (2026-11-05). Okno: 12 miesięcy (2025-11-05 → 2026-11-05).
Metoda: `git log --no-merges --name-only` przetworzony skryptem poza oknem kontekstu; GitHub CLI tylko do odczytu.

## Zakres i filtry

| Pozycja | Wartość |
|---|---|
| Commity w oknie (bez merge) | 1969 |
| Odrzucone: boty (`huppy-bot`, `github-actions`, `dependabot`) | 88 |
| Odrzucone: tylko szum (lockfile, snapshoty, grafiki, configi, `api-report.api.md`, tłumaczenia, `.d.ts`) | 58 |
| Odrzucone: masowe zmiany (`374dfedc9` sort importów oxfmt, `370d3a836` migracja na oxlint/oxfmt, `be38cf1f0` Yarn → pnpm) | 3 |
| **Policzone** | **1820** |
| Commity z agentem AI jako autorem | 0 |
| Commity człowieka z agentem jako współautorem (`Co-authored-by: Claude…`) | 233 (~13%) — liczone jako aktywność człowieka |

Duże commity funkcjonalne zostały w danych: `46ff8124b` usunięcie funkcji „fairy” (483 pliki), `a1e3b7180` i `80aab1087` reorganizacja przykładów (456 i 477 plików), `584d9b1f0` komentowanie (282), `2d721051f` i18n ICU (242), `17b19dc63` OverlayUtil (238).

## TOP 10 obszarów (moduły)

| # | Obszar | Commity | Udział `fix` | Funkcja produktu |
|---|---|---|---|---|
| 1 | `apps/dotcom` | 548 | 37% | tldraw.com: konta, pliki, udostępnianie, wspólna edycja |
| 2 | `packages/tldraw` | 531 | **68%** | SDK „z bateriami”: kształty, narzędzia, UI |
| 3 | `packages/editor` | 311 | **57%** | silnik edytora: stan, kamera, zaznaczanie, historia |
| 4 | `apps/docs` | 189 | 34% | strona dokumentacji SDK i release notes |
| 5 | `apps/examples` | 189 | 26% | galeria przykładów SDK + e2e Playwright |
| 6 | `internal/scripts` | 159 | 36% | deploy, release, tooling |
| 7 | `.github/workflows` | 129 | 26% | CI/CD |
| 8 | `packages/dotcom-shared` | 84 | 20% | typy i mutatory współdzielone przez klienta i worker dotcom |
| 9 | `packages/sync-core` | 65 | 49% | protokół synchronizacji w czasie rzeczywistym |
| 10 | `packages/tlschema` | 44 | 25% | schemat rekordów i migracje dokumentu |

Poziom niżej — gdzie toczy się praca „hands-on”:

| Podobszar | Commity | `fix` | Funkcja |
|---|---|---|---|
| `apps/dotcom/client/src/tla` | 261 | 87 | aplikacja tldraw.com (konta, pliki, UI aplikacji) |
| `apps/dotcom/sync-worker/src` | 208 | 53 | backend na Cloudflare Durable Objects |
| `packages/tldraw/src/lib/ui` | 207 | 88 | menu, paski narzędzi, okna dialogowe SDK |
| `packages/editor/src/lib/editor` | 200 | 110 | klasa `Editor` i managery |
| `packages/tldraw/src/lib/shapes` | 167 | 99 | strzałki, rysunek, tekst, notatki, geo |
| `packages/tldraw/src/lib/tools` | 94 | 62 | maszyny stanów narzędzi (select, draw, eraser) |
| `packages/sync-core/src/lib` | 50 | 27 | rdzeń synchronizacji |

## TOP 10 plików

| Plik | Commity | `fix` | Uwagi |
|---|---|---|---|
| `packages/editor/src/lib/editor/Editor.ts` | 128 | 78 | centralny obiekt SDK, edytowany ręcznie |
| `apps/dotcom/client/public/tla/locales-compiled/en.json` | 63 | 15 | **generowany** z `locales/en.json` (`build-i18n`) — szum |
| `apps/dotcom/client/src/tla/app/TldrawApp.ts` | 60 | 17 | stan aplikacji tldraw.com |
| `apps/dotcom/client/src/tla/components/TlaEditor/TlaEditor.tsx` | 58 | 12 | osadzenie edytora w aplikacji |
| `apps/dotcom/sync-worker/src/TLFileDurableObject.ts` | 55 | 21 | Durable Object pliku (zapis, sync) |
| `apps/docs/content/releases/next.mdx` | 55 | 8 | release notes — praca redakcyjna, nie kod |
| `internal/scripts/deploy-dotcom.ts` | 49 | 14 | deploy tldraw.com |
| `apps/dotcom/sync-worker/src/worker.ts` | 47 | 10 | router workera |
| `apps/dotcom/sync-worker/src/types.ts` | 45 | 6 | typy workera |
| `packages/dotcom-shared/src/types.ts` | 43 | 5 | kontrakt klient ↔ worker |

Wszystkie pliki istnieją na HEAD.

## Aktywność w czasie (kwartały)

| Obszar | 25Q4* | 26Q1 | 26Q2 | 26Q3 | 26Q4* | Profil |
|---|---|---|---|---|---|---|
| `apps/dotcom` | 128 | 74 | 130 | 168 | 51 | **stały** (najwyższy poziom bazowy) |
| `packages/tldraw` | 38 | 104 | 153 | 207 | 31 | **rosnący** do 26Q3 |
| `packages/editor` | 24 | 69 | 78 | 125 | 17 | **rosnący**, skok w 26Q3 |
| `apps/dotcom/sync-worker/src` | 25 | 23 | 35 | 103 | 22 | **sezonowy** — skok w 26Q3 |
| `packages/store` | 4 | 6 | 6 | 24 | 2 | sezonowy (26Q3) |
| `packages/fairy-shared` | 34 | 1 | — | — | — | **wygasły** — usunięty `46ff8124b` (2026-02-05) |
| `internal/grafana` | — | — | — | 24 | 3 | nowy (monitoring, 26Q3) |
| `apps/mcp-app` | — | 17 | 5 | 16 | 1 | nowy, sezonowy |

\* 25Q4 = tylko listopad–grudzień 2025, 26Q4 = październik–5 listopada 2026.

Kampanie widoczne w tematach commitów:
- **25Q4 — „fairies”**: agent AI na płótnie (`feat(fairies)…`, `Agent fairy backport`) — wycofany w całości w lutym 2026.
- **26Q1–Q2 — narzędzia i przykłady**: migracja lint/format na oxlint/oxfmt, reorganizacja `apps/examples`, OverlayUtil w edytorze.
- **26Q3 — szczyt dla SDK i sync-workera**: seria `fix(select)`, `fix(draw)`, `fix(eraser)` (zachowanie narzędzi), komentowanie (`feat: commenting`), Grafana; w workerze skok do 103 commitów.
- **26Q4 — i18n**: migracja SDK na ICU MessageFormat / react-intl (`2d721051f`).

## Poprawki — ważne czy ciągle się psuje

Udział poprawek liczony po konwencji tldraw (`fix(scope): …`, `revert…`); wyrywkowo przeczytano tematy.

| Obszar | `fix` | Reverty | Interpretacja |
|---|---|---|---|
| `packages/tldraw` | 68% | 7 | **Psuje się realnie**, ale w przewidywalny sposób: krawędziowe przypadki interakcji (`fix(select): reparent the clones…`, `fix(eraser)…`, `fix(lines): unique indices`). To nie CI-chaos, tylko złożone maszyny stanów. |
| `packages/editor` | 57% | 1 | Rdzeń z wieloma poprawkami matematyki/kamery/historii (`distanceToLineSegment… squared`, `camera constraints…`). Ważny **i** kruchy. |
| `apps/dotcom` | 37% | 4 | Mieszanka: produkt (konta, OAuth, CAPTCHA, MCP token) + UI. Reverty to głównie wycofane funkcje (`Clerk CAPTCHA`, `Granola palette`, `MCP token audience`). |
| `internal/scripts` + `.github/workflows` | 26–36% | 1 | **Fałszywy alarm**: poprawki deployu i CI metodą prób i błędów to zwykły tryb pracy. |
| `apps/docs` | 34% | 2 | Poprawki treści, nie kodu — niski koszt. |

Top scope'y poprawek: `editor` 144, `dotcom` 135, `tldraw` 109, `docs` 40, **`select` 35**, `sync` 31, `ci` 30, `store` 19, `arrows` 19.

GitHub (tylko odczyt):
- 419 otwartych zgłoszeń: `sdk` 254, `dotcom` 110, `feature` 87, `bugfix` 67, `performance` 28.
- ≥500 PR-ów zamkniętych bez merge (limit zapytania): `releases` 83, `dotcom` 64, `editor` 52, `tldraw` 30. PR-y `releases` wyglądają na automatyczne gałęzie release'owe — **niewiadoma**, nie traktuję jako sygnału porażek.

## Współzmiany

Pominięto commity dotykające > 8 obszarów. Procent = udział wspólnych commitów w mniej aktywnym obszarze z pary.

| Para | Razem | % mniej aktywnego | Wniosek |
|---|---|---|---|
| `packages/editor` + `packages/tldraw` | 174 | 56% | **Najsilniejsze sprzężenie**: zmiana w silniku zwykle wymaga zmiany w SDK. |
| `packages/editor/src/lib` + `packages/tldraw/src/test` | 122 | 47% | Testy zachowania edytora żyją w pakiecie `tldraw`, nie w `editor`. |
| `apps/dotcom` + `packages/dotcom-shared` | 75 | **88%** | `dotcom-shared` praktycznie nie zmienia się samodzielnie — to kontrakt aplikacji. |
| `apps/dotcom/client/src` + `apps/dotcom/sync-worker/src` | 74 | 36% | Funkcje dotcom przechodzą przez klienta **i** backend. |
| `sync-worker/src` + `dotcom-shared/src/types.ts` | 31 | 72% | Typy współdzielone zmieniają się razem z workerem. |
| `packages/tldraw` + `packages/tlschema` | 20 | 45% | Nowe właściwości kształtów = zmiana schematu + migracja. |
| `packages/store/SPEC.md` + `packages/store/src/lib` | 21 | 100% | Dokumentacja specyfikacji utrzymywana razem z kodem (konwencja, nie ryzyko). |

Dla top 3:
1. **dotcom** — sprzężony z `dotcom-shared` (kontrakt) i `internal/scripts` (deploy, 30%). Zmiany produktu są pełnostosowe.
2. **tldraw** — sprzężony z `editor` (56%), `examples` (31%) i `tlschema` (45%). Publiczne API wymusza zmiany w przykładach i dokumentacji.
3. **editor** — 47% jego commitów rusza testy w `packages/tldraw/src/test`. Testy edytora są w innym pakiecie.

### Wspólne mianowniki

| Plik | Obszary | Commity | Jak się zmienia |
|---|---|---|---|
| `packages/tldraw/api-report.api.md`, `packages/editor/api-report.api.md` | 36 / 34 | 99 / 89 | **Generowane** przez `build-api` (api-extractor), pilnowane przez `api-check` w CI. Tańsze sprzężenie — regeneracja. Ale sygnalizuje zmianę publicznego API. |
| `packages/editor/src/lib/editor/Editor.ts` | 33 | 121 | **Ręcznie edytowany** hub. Najdroższy wspólny mianownik. |
| `apps/dotcom/client/public/tla/locales/en.json` → `locales-compiled/en.json` | 23 | 60 / 60 | Źródło edytowane ręcznie, `compiled` regenerowany (`build-i18n`). |
| `package.json` (root) | 34 | 38 | Skrypty i zależności — konfiguracja. |
| `yarn.lock` | 50 | 95 | **Usunięty** po migracji na pnpm (`be38cf1f0`) — nie opierać na nim analizy. |

Weryfikacja istnienia: wszystkie pliki/katalogi z tabel istnieją na HEAD poza `yarn.lock` i `packages/fairy-shared` (oba usunięte).

## Niewiadome

- **Zmiany nazw nie są łączone**: klon `--filter=blob:none` + `--no-renames`, żeby nie pobierać tysięcy blobów. Reorganizacja `apps/examples` (`a1e3b7180`) liczy się podwójnie (stara + nowa ścieżka).
- **Kontrakt bez współzmian**: historia nie pokaże, czy `dotcom-shared` i schemat Zero/Postgres w workerze zawsze zmieniają się zgodnie — do sprawdzenia w Deep Focus.
- PR-y `releases` zamknięte bez merge: automatyzacja czy porzucone wydania?
- Udział agentów jest widoczny tylko przez trailery `Co-authored-by`. Nie wiadomo, ile kodu agent faktycznie napisał.

## Wnioski dla mapy

- Rdzeń pracy: **SDK (`editor` + `tldraw`)** i **tldraw.com (`dotcom` + `dotcom-shared` + sync-worker)**. Dwa produkty w jednym repo.
- Najbardziej kruche: **interakcje narzędzi i kształtów** (`tldraw/src/lib/tools`, `shapes`: 60–66% fix) oraz `Editor.ts`.
- `dotcom-shared` to niewielki, ale nośny kontrakt (88% współzmian).
- CI/deploy wyglądają groźnie (dużo `fix`), ale to normalny tryb pracy, nie strefa ryzyka.
