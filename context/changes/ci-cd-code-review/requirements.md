# Wymagania — recenzent AI w CI (M5L3)

Źródło: prompt kursu `m5l3-requirements`. Kryteria i reguła werdyktu zostały zastąpione własnymi kryteriami 10xCards (zadanie 1 M5L3), wdrożonymi w `packages/code-reviewer` (zadanie 2).

## Ogólna koncepcja

- workflow GHA uruchamiany dla każdego nowego pull requesta do `main` (w szablonie kursu: `master`; repo używa `main`)
- composite action dla samego review, aby główny workflow był łatwy do zrozumienia

## Parametry wejściowe

- tytuł pull requesta
- opis pull requesta (kompromis kosztowy: opis kosztuje tokeny, ale kryterium 5 ocenia, czy opis mówi, co i dlaczego się zmienia, więc przekazujemy go)
- git diff

Tytuł, opis i diff to niezaufane dane od autora PR-a: w workflow przechodzą przez `env`/pliki, nigdy przez interpolację w skrypcie; w prompcie są oznaczone jako dane, nie instrukcje.

## Kryteria Code Review

Każde kryterium oceniane w skali 1–10 z jednym zdaniem uzasadnienia. Źródło prawdy: `packages/code-reviewer/src/review-schema.ts` (`CRITERIA`).

1. **Poprawność i kontrakt API** (`implementationCorrectness`) — przypadki brzegowe, błędy w kształcie `{ error: { code, message } }`, kod w snake_case, komunikat po polsku, właściwy status HTTP, brak regresji.
2. **Izolacja kont i dostęp do danych** (`accountIsolation`, twarda reguła) — RLS per operacja i rola, tożsamość wyłącznie z sesji, minimalne grants, null z `createClient()`, `PROTECTED_ROUTES`.
3. **Prywatność, sekrety i koszt AI** (`privacySecretsAiCost`, twarda reguła) — wklejonego tekstu nie zapisujemy ani nie logujemy, sekrety we właściwych plikach env, limity wywołań AI.
4. **Zgodność z konwencjami 10xCards** (`projectConventions`) — Astro vs React, `cn()`, role tokenów, `src/components/ui/`, `src/lib/services/`, `src/types.ts`, nazwy migracji, `context/archive/`, aktualność CLAUDE.md.
5. **Prostota i zakres zmiany** (`simplicityAndScope`) — brak zbędnych abstrakcji i martwego kodu, jedna spójna zmiana, opis PR-a z celem (najlepiej z odwołaniem do `context/changes/<id>/`).
6. **Testy proporcjonalne do ryzyka** (`testRiskCoverage`) — testy w `tests/`, granica AI stubowana przez `fetch`, zmiany w bazie pokryte testami integracyjnymi.

## Werdykt

- wiążący `verdict`: `pass` | `fail`, obok sześciu ocen z uzasadnieniem oraz Markdown `summary`
- reguła (`packages/code-reviewer/src/verdict.ts`, wykonywana w kodzie, nie przez model): `fail`, gdy kryterium 2 lub 3 ma ocenę ≤ 4 albo którekolwiek ≤ 3; `pass` w każdym innym przypadku
- każda ocena < 7 wskazuje w podsumowaniu konkretny plik lub linię
- bramka merge odczytuje wyłącznie `verdict`

## Odłożone na później

- zgodność biznesowa (wymaga szerszego kontekstu)
- dopasowanie architektoniczne (wymaga szerszego kontekstu)

## Oczekiwane skutki uboczne

- komentarz PR z podsumowaniem: każde kryterium z oceną i jednym zdaniem uzasadnienia (`renderComment()` w `packages/code-reviewer/src/comment.ts`)
- etykiety: `ai-cr:failed` (czerwona) LUB `ai-cr:passed` (zielona)
- nieudany check przy werdykcie `fail` (do ustawienia jako wymagany w ochronie gałęzi)

## Oczekiwane zachowanie

- ponowna próba na żądanie po dodaniu etykiety `ai-cr:review`

## Dowód (10xChampion)

Zrzuty: widok pipeline'u z jobem, logi joba, komentarz LLM na PR — z PR-a z wynikiem `pass` oraz z celowo złego PR-a z wynikiem `fail` i etykietą `ai-cr:failed`.
