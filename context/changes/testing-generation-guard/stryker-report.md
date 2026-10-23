# Stryker — raport fazy 4 (2026-10-23)

## Wynik

| Uruchomienie | Zakres | Mutanty | Killed | Survived | No coverage | Score |
| --- | --- | --- | --- | --- | --- | --- |
| `npm run test:mutation` (perTest, concurrency 1) | `card-generation.ts` + `generate.ts` | 153 | 7 | 144 | 2 | 4,58% |
| diagnostyczne `--coverageAnalysis off` | `card-generation.ts` | 94 | 6 | 88 | 0 | 6,38% |

Wersje: `@stryker-mutator/core` i `@stryker-mutator/vitest-runner` 10.0.0, Vitest 5.0.5, Node 24.21.0, Windows 10.

## Werdykt: wynik niewiarygodny — problem narzędzia, nie testów

Nie przeglądamy żywych mutantów pojedynczo ani nie dopisujemy asercji, bo wynik nie mierzy
jakości testów:

- Przeżył mutant `BlockStatement`, który zastępuje całe ciało `generateCardProposals` pustym
  blokiem (funkcja zwraca `undefined`). Test „returns at most 10 proposals … when the AI sends 12”
  oczekuje tablicy 10 elementów, więc musiałby go zabić.
- Przeżyły mutanty usuwające `.slice(0, MAX_PROPOSALS)` i zmieniające warunki walidacji —
  dokładnie te zmiany, które przy ręcznym psuciu wywracały testy (Progress 1.5, 2.3, 2.4, 3.3, 3.4).
- Wyłączenie analizy pokrycia per test nie zmienia wyniku (6,38%), więc to nie ona.
- Hipoteza (niepotwierdzona): Stryker zgłosił 15 mutantów statycznych (wykonywanych przy ładowaniu
  modułu); zabite mutanty to m.in. stała domyślnego URL. Mutanty wewnątrz funkcji, przełączane w
  trakcie testów, najpewniej nie docierają do kodu ładowanego przez Vitest 5 w tej konfiguracji.

Pogoń za tym wynikiem asercjami byłaby antywzorcem z lekcji (testy pod wynik zamiast pod ryzyko).

## Dowód jakości testów, który zostaje

Ręczne „zepsuj kod → pada dokładnie ten test” (uproszczone testy mutacji), wykonane w fazach 1–3:

| Zepsucie | Test, który padł |
| --- | --- |
| usunięte sprawdzenie sesji | 401 (200 zamiast 401) |
| wywołanie AI przed zwróceniem 401 | 401 (fetch wywołany 1 raz) |
| `>` → `>=` w limicie długości | granica 10 000 znaków |
| usunięte `.trim()` | tekst z samych białych znaków |
| usunięte `.slice(0, 10)` | 12 → 10 propozycji |
| `text` w `console.error` | prywatność 502 i 504 |

## Zmiany konfiguracji w trakcie

- `ignorePatterns` (`.claude`, `.agents`, `lessons`, `context`, `dist`, `supabase`, `.wrangler`):
  sandbox nie umiał skopiować dowiązań symbolicznych w `.claude/skills` (EPERM).
- `concurrency: 1`: przy 4 procesach Vitest walczyły o `node_modules/.vitest-cache` w sandboxie (EBUSY).

## Co dalej

Wrócić do Strykera, gdy pojawi się wersja runnera z potwierdzonym wsparciem Vitest 5, albo
sprawdzić na Linuksie/CI. Do tego czasu `npm run test:mutation` jest dostępne, ale jego wyniku
nie traktujemy jako bramki (zgodnie z test-plan §5 i tak jest ad hoc).
