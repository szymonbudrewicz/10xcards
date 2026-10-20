# External research: algorytm powtórek dla S-05 (srs-review-session)

Data: 2026-10-20. Źródła: WebSearch/WebFetch (bez Exa i Context7), typy z paczki `ts-fsrs@5.4.2` (`dist/index.d.ts`) i lokalny test uruchomieniowy.

## Decyzja

**Wybieramy `ts-fsrs` (algorytm FSRS), bo** to jedyna utrzymywana biblioteka powtórek w TypeScript (wydanie 5.4.2 z 2026-10-19, licencja MIT, zero zależności). W oficjalnym benchmarku srs-benchmark FSRS wypada lepiej od SM-2 dla 89,9% użytkowników przy parametrach domyślnych. PRD zabrania własnego algorytmu (prd.md:118), a dla SM-2 nie ma utrzymywanej paczki.

## Kandydaci

| Kandydat | Stan | Werdykt |
|---|---|---|
| `ts-fsrs` (FSRS v6) | 5.4.2, aktywnie rozwijany, MIT, 0 zależności, Node ≥ 20 | **wybrany** |
| `femto-fsrs` | 2.0.0, ostatnia zmiana 2025-05, minimalna implementacja | odrzucony: mniejsza dojrzałość i społeczność |
| `@kirklin/supermemo2` (SM-2) | 0.0.3, brak zmian od 2022 | odrzucony: porzucony; własne SM-2 zakazuje PRD |

## Aktualne API (zweryfikowane w `index.d.ts`)

```ts
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';

const scheduler = fsrs();                          // domyślnie: request_retention 0.9, maximum_interval 36500, enable_fuzz false, enable_short_term true
const card = createEmptyCard(now);                 // nowa fiszka
const { card: next, log } = scheduler.next(card, now, Rating.Good);   // zastosuj ocenę
const preview = scheduler.repeat(card, now);       // podgląd 4 wyników: preview[Rating.Good].card
scheduler.forget(card, now, resetCount?);          // reset stanu (nie używamy, patrz niżej)
```

- `Rating`: `Manual = 0, Again = 1, Hard = 2, Good = 3, Easy = 4`. `next()` przyjmuje `Grade`, czyli bez `Manual` (4 przyciski w UI).
- `State`: `New = 0, Learning = 1, Review = 2, Relearning = 3`.
- `Card`: `due: Date, stability, difficulty, elapsed_days (deprecated w 6.0), scheduled_days, learning_steps, reps, lapses, state, last_review?: Date`.
- `ReviewLog`: `rating, state, due, stability, difficulty, elapsed_days*, last_elapsed_days*, scheduled_days, learning_steps, review: Date` (*deprecated).
- `next()`/`repeat()` przyjmują `CardInput`, w którym `due`/`last_review` mogą być `Date | number | string`. Wiersz z Supabase (daty jako ISO string, jsonb) można przekazać bez ręcznej konwersji.

## Sprawdzone lokalnie

Test `createEmptyCard` → `JSON.stringify/parse` (symulacja jsonb) → `next(..., Rating.Good)`:
- po pierwszej ocenie Good: `due` +10 min, `state` = Learning (1), `reps` = 1,
- po drugiej Good: `due` +2 dni, `stability` ≈ 2.31.

Termin zmienia się po ocenie zgodnie z algorytmem. To jest dowód wymagany w FR-013 / ryzyku S-05.

Kompatybilność z Cloudflare Workers: `dist/index.mjs` nie importuje modułów `node:`, nie używa `require` ani `process`, więc powinien działać w workerd. Do potwierdzenia buildem.

## Wpływ na kontrakt (wejście do /10x-plan)

- **Skala ocen**: 4 przyciski Again / Hard / Good / Easy (`Grade`).
- **Stan powtórek**: kolumny fiszki lub osobna tabela z polami `Card`. `due` jako osobna kolumna `timestamptz` z indeksem (zapytanie „do powtórki dziś”: `due <= now()`). Do decyzji w planie: jsonb czy kolumny.
- **Edycja treści**: PRD (prd.md:84) mówi, że edycja **nie zeruje** historii. Nie wołamy więc `forget()` przy edycji (odwrotnie niż w przykładzie z lekcji).
- **Usunięcie fiszki**: usuwa też dane powtórek (prd.md:84). Kaskada lub te same wiersze.
- **ReviewLog**: PRD nie wymaga historii ocen. Do decyzji, czy zapisujemy log (potrzebny tylko do `rollback`/optymalizacji parametrów, czyli poza v1).
- **Parametry**: domyślne `fsrs()`; ustawienia powtórek poza zakresem v1 (prd.md:126).

## Open Questions

1. Stan FSRS w kolumnach `cards` czy w osobnej tabeli `card_reviews` 1:1? (RLS + `revoke all` wg lessons.md).
2. Czy `enable_fuzz` włączyć (losowość długich interwałów) — wpływa na deterministyczność testu FR-013.
3. Czy zapisywać `ReviewLog` w v1?

## Źródła

- https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.2/README.md
- https://github.com/open-spaced-repetition/ts-fsrs
- https://forums.ankiweb.net/t/has-anyone-done-a-live-comparison-of-fsrs-and-sm2-as-implemented-in-anki-it-looks-like-no-so-can-anyone-help-me-set-it-up/34996
- https://github.com/RickCarlino/femto-fsrs
- https://npmjs.com/package/@kirklin/supermemo2
