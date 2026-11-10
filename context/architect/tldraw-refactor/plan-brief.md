# Siatka bezpieczeństwa pod ujednolicenie ścieżek hooków przesunięcia (C3): brief planu

> Full plan: `context/changes/refactor-opportunities/plan.md`
> Research: `context/changes/refactor-opportunities/research.md`
> Przegląd planu: `context/changes/refactor-opportunities/reviews/plan-review.md` (REVISE → poprawki F1–F5 wprowadzone)

## What & Why

Przesunięcie kształtu ma w tldraw dwie niezależne implementacje kontraktu `ShapeUtil.onTranslate*`: gest (`Translating.ts`) i ścieżkę jednorazową 7 metod edytora. Rozjazd już dał błąd (#10198), a w planowaniu sonda potwierdziła kolejny (strzałka po nudge wraca do nieaktualnej pozycji końca). Docelowa jedna implementacja (wzorem rotacji) wymaga najpierw zmiany zachowania. Ta zmiana stawia siatkę testów, zanim cokolwiek zostanie dotknięte.

## Starting Point

Gest woła hooki w pętlach w `Translating.ts:262-373`. Ścieżka jednorazowa robi to na kopii roboczej w `Editor.ts:7018-7044`, za wrapperem z 7 wywołaniami. Rotacja ma wspólny helper, w którym `one-off` działa na rekordach ze store (`rotation.ts:97-111`). Istniejące testy pokrywają kolejność hooków gestu i wiązania strzałek w nudge/align/distribute.

## Desired End State

Zachowanie obu ścieżek, reguła wiązań strzałki z grupą i kolejność efektów wiązań przy geście są utrwalone testami. Znany błąd jest przypięty dokładną wartością i ma `it.fails` z wartością poprawną. `src/lib` bez zmian.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Która opcja z rankingu ④ | ① C3 | Jedyny kandydat z udokumentowanymi odsetkami i gotowym wzorcem u rodzeństwa | Research → Plan |
| Błąd strzałki w nudge/align | Utrwalić w tej zmianie, naprawić w osobnej | Refaktor nie miesza się ze zmianą zachowania | Plan |
| Zakres tej zmiany | Tylko fazy testów (1–2); naprawa i helper jako 2 kolejne zmiany | Helper z dwiema semantykami rekordów byłby unifikacją tylko z nazwy | Przegląd F1 (Fix A) |
| Kolejność następnych zmian | ① naprawa `one-off` wg rotacji → ② helper z jedną semantyką | Dopiero po naprawie obie ścieżki mają tę samą semantykę i helper jest czystym refaktorem | Przegląd F1 |
| Utrwalenie błędu | Test pinujący `{-999,-999}` + `it.fails` z `{0,0}` | Samo `it.fails` przechodzi przy każdej porażce | Przegląd F3 |
| Testy strzałki w ścieżce jednorazowej | Bez nowych poza parą pin + `it.fails` | `ArrowShapeUtil.test.ts:196-299` już je ma (H1 z researchu było fałszywe) | Przegląd F2 |
| Guardy spoza C3 | Strzałka z grupą w geście (C4) + snapshot efektów (C5) | Oba kontrakty leżą na ścieżce kolejnych zmian | Research → Plan |
| Siatka gestu | Argumenty, wiele kształtów, partiale ze startu, usunięcie w trakcie, cancel | Istniejące testy sprawdzają tylko kolejność, dla jednego utila | Plan (korekta użytkownika) |

## Scope

**In scope:**
- testy guardów (C4, C5);
- charakteryzacja hooków gestu i 7 metod jednorazowych;
- para pin + `it.fails`;
- zapisana kolejność i kryteria dwóch następnych zmian.

**Out of scope:**
- wszelkie zmiany `src/lib` i api-report;
- naprawa błędu (zmiana nr 1);
- helper `applyTranslateHooks` (zmiana nr 2);
- `todo` z `Editor.ts:7050`;
- `moveShapesToPoint`;
- C1/C2, C5 (poza guardem), C7, C8, C9;
- E2E.

## Architecture / Approach

„Dodaj test, zanim dotkniesz”: dwie fazy, obie są czystymi dodatkami w plikach testowych, każda w osobnym commicie. Kolejność od liści: najpierw kontrakty sąsiednie, potem kontrakt hooków. Test pinujący świadomie utrwala błąd: jego usunięcie i odwrócenie `it.fails` są sygnałem ukończenia zmiany nr 1.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Guardy na ścieżce C3 | Testy wiązania strzałki z grupą (gest) i kolejności efektów wiązań | Inline snapshot utrwala obecną kolejność bez przeglądu |
| 2. Charakteryzacja obu ścieżek | Kontrakt hooków gestu i 7 metod; para pin + `it.fails` | Dane `it.each`, które nic nie przesuwają albo zaznaczają rodzica z dzieckiem |

**Prerequisites:** klon tldraw z zależnościami (`pnpm install --frozen-lockfile --ignore-scripts`, M4L2); zielone `pnpm test-ci` na HEAD `844f6f484`.
**Estimated effort:** ~1 sesja (2 fazy testów); każda z dwóch następnych zmian to osobna, ok. 1 sesja.

## Open Risks & Assumptions

- `it.fails` nie ma precedensu w repo; komentarz i para z testem pinującym muszą jasno tłumaczyć intencję.
- Pełny `pnpm test-ci` / `pnpm lint` na Windowsie nie był jeszcze uruchamiany na tym klonie (pojedynczy plik vitest działa, sprawdzone sondą). Jeśli nie zadziała, weryfikacja wymaga CI (fork) albo WSL.
- Koszt dodatkowych zapisów do store w zmianie nr 1 jest niezmierzony.

## Success Criteria (Summary)

- Każda zmiana zachowania obu ścieżek hooków przesunięcia, kolejności efektów wiązań lub reguły wiązania strzałki z grupą daje czerwony test.
- Znany błąd ma jednoznaczny, literalny sygnał „przed” i „po” naprawie.
- Zero zmian w kodzie produkcyjnym.
