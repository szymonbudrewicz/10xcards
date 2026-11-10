<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Ujednolicenie ścieżek hooków przesunięcia (C3)

- **Plan**: `context/changes/refactor-opportunities/plan.md` (wersja sprzed poprawek: 4 fazy)
- **Mode**: Deep (recenzent ze świeżym kontekstem — sub-agent bez udziału w planowaniu; triage z użytkownikiem w sesji głównej)
- **Date**: 2026-11-10
- **Verdict**: REVISE → po poprawkach: SOUND
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | WARNING |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
7/7 paths ✓ (translation.ts celowo nowy), 6/6 symbols ✓, brief↔plan ✓, Progress↔Fazy ✓ (4/4 fazy, 25/25 kroków)

## Findings

### F1 — Helper łączy dwie implementacje pod jedną nazwą, przyczyna #10198 zostaje

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Overview, Desired End State, Critical Implementation Details, Fazy 3–4
- **Detail**: Etap `one-off` miał zachować kopię roboczą bez odczytu ze store, a `start/update/end` czytać ze store. Helper miałby więc dwie rozłączne gałęzie. Przywołany wzorzec rotacji robi inaczej: `one-off` to start+update+end w jednej pętli na rekordach ze store (`rotation.ts:97-111`, potwierdzone w sesji głównej). Kryterium „jedna implementacja” przeszłoby tylko nominalnie, a przyczyna #10198 i błędu strzałki by została. Faza 4 dokładała wpis `@internal` za ~3 pętle.
- **Fix A ⭐ Recommended**: Najpierw fazy 1–2 (testy), potem osobna zmiana naprawcza (`one-off` jak w rotacji, `it.fails` → `it`), dopiero potem helper z jedną semantyką.
  - Strength: Helper rzeczywiście jest jedną implementacją; znika przyczyna klasy błędów.
  - Tradeoff: Refaktor zależy od zmiany zachowania; nowa zmiana przed helperem.
  - Confidence: HIGH — `rotation.ts:94-111` pokazuje dokładnie ten kształt.
  - Blind spot: Koszt dodatkowych zapisów do store w 7 metodach niezmierzony.
- **Fix B**: Zostawić fazy 3–4, nazwać rezultat wprost „wspólne miejsce wywołań, dwie semantyki”.
  - Strength: Zakres bez zmian, czysty 1:1.
  - Tradeoff: Mały zysk (kolokacja) za nowy eksport `@internal`.
  - Confidence: MED.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — plan ograniczony do faz 1–2; sekcja „Następne zmiany” zapisuje kolejność: ① naprawa `one-off` wg rotacji, ② helper. Uwaga: odwraca decyzję z planowania „tylko utrwalić” na „utrwalić tu, naprawić jako prerekwizyt helpera”.

### F2 — Faza 2 §3 dubluje istniejące testy strzałki dla nudge/align

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Faza 2 §3; Current State Analysis (research H1)
- **Detail**: `ArrowShapeUtil.test.ts:196` (nudge), `:216` (align), `:240` (distribute), `:278` (grupa+nudge) już utrwalają wiązania i `isPrecise` (potwierdzone w sesji głównej). Twierdzenie H1 z researchu było fałszywe — ast-grep przeszukał tylko `src/test/commands/`.
- **Fix**: Usunąć duplikaty z §3, zostawić parę pin + `it.fails`, poprawić H1 i wskazać `:196-299` jako siatkę.
- **Decision**: FIXED

### F3 — Samo `it.fails` nie chroni przed regresją ścieżki one-off

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 2 §3; kryteria 3.3 / 4.4
- **Detail**: `it.fails` przechodzi przy każdej porażce ciała (inna zła wartość, wyjątek, zmiana wyniku gestu, z którym porównywał).
- **Fix**: Test pinujący obecną wartość literałem `{x:-999,y:-999}` + `it.fails` z literałem poprawnej wartości `{x:0,y:0}`.
  - Strength: Każda zmiana wyniku daje czerwony test.
  - Tradeoff: Jeden test świadomie utrwala błąd — wymaga komentarza.
  - Confidence: HIGH — semantyka `it.fails` w Vitest.
  - Blind spot: Wartość z sondy nie odtworzona przez recenzenta (repo tylko do odczytu); pochodzi z sondy planowania.
- **Decision**: FIXED

### F4 — Kryterium 4.3 (`grep -c` w `public.d.ts`) padnie przy domyślnej konfiguracji

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 4 — Success Criteria, Progress 4.3
- **Detail**: `omitTrimmingComments` domyślnie `false` (`internal/config/api-extractor.json:276-282`, potwierdzone) — zostaje komentarz „Excluded from this release type: applyTranslateHooks”.
- **Fix**: `grep -c "declare function applyTranslateHooks"` = 0.
- **Decision**: FIXED — faza 4 wypadła (F1), poprawne polecenie zapisane w „Następne zmiany”, nr 2.

### F5 — Szczegóły danych testowych w Fazie 2 (it.each, fake timery)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 §1–2; Key Discoveries
- **Detail**: Fixture `shapeutils.test.ts:28-61` ma `box2` jako dziecko `frame1` (rodzic+dziecko uruchamia `todo` podwójnego przesunięcia); `calls` per util, nie per kształt; fake timery nie są globalne (`vitest.config.ts` ustawia tylko `toFake`, potwierdzone).
- **Fix**: Zastrzeżenia w §2, korekta Key Discoveries.
- **Decision**: FIXED

## Triage summary

- Fixed: F1 (Fix A), F2, F3, F4, F5 (5)
- Dodatkowo w trakcie poprawek: kryterium 2.5 opisywało sprawdzenie odwrotne odwrotnie („przechodzi po zamianie na `it`”) — poprawione na „pada z asercją `{-999,-999}` vs `{0,0}`”.
- Verdict after fixes: REVISE → SOUND
