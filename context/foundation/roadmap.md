---
project: "10xCards"
version: 1
status: draft
created: 2026-10-19
updated: 2026-10-30
prd_version: 1
main_goal: speed
top_blocker: decisions
milestone_id: first-usable-deck
milestone_seq: 1
milestone_status: open
---

# Roadmap: 10xCards

> Wyprowadzona z `context/foundation/prd.md` (v1) + `tech-stack.md`, `shape-notes.md`, `deploy-plan.md` + automatycznie zbadany punkt bazowy kodu.
> Edycja w miejscu; kolejny kamień milowy kontynuuje ten plik. Archiwizuj dopiero, gdy niezależna roadmapa go zastąpi.
> Elementy poniżej są w kolejności zależności. Tabela „At a glance" jest indeksem.

## Milestone

**M-1: Pierwsza używalna talia** — Status: open

- **Intent:** Użytkownik przechodzi cały przepływ MVP: od zalogowania, przez wklejenie tekstu i zaakceptowanie fiszek wygenerowanych przez AI, do pierwszej ocenionej fiszki z wyznaczonym terminem powrotu. Bez dat.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** każde F-NN i S-NN poniżej ma status `done`.
- **Scope anchors:** FR-001–FR-006, FR-008–FR-013 (wszystkie must-have), US-01. FR-007 (nice-to-have) poza kamieniem milowym.

## Vision recap

Ręczne robienie dobrych fiszek zajmuje więcej czasu niż samo przeczytanie materiału, więc osoby uczące się rezygnują ze spaced repetition (powtórek rozłożonych w czasie), mimo że wiedzą, że działa. Wąskie gardło to tworzenie fiszek, nie samo powtarzanie, więc 10xCards zamienia wklejony tekst w propozycje fiszek, które użytkownik tylko akceptuje, poprawia lub usuwa, a termin powtórki wyznacza gotowy algorytm.

## North star

**S-03: Użytkownik akceptuje propozycje AI i zapisuje je jako fiszki na swoim koncie** — to najmniejszy przepływ, który sprawdza najbardziej ryzykowne założenie produktu (że fiszki z AI są na tyle dobre, by je akceptować, cel ≥ 75%), więc przy `main_goal: speed` ma stanąć jak najwcześniej.

> „North star" (gwiazda przewodnia) to tutaj najmniejszy kompletny przepływ, którego udane dostarczenie dowodzi głównej hipotezy produktu; ustawiamy go tak wcześnie, jak pozwalają zależności, bo reszta ma sens tylko wtedy, gdy on działa.

## At a glance

| ID   | Change ID                  | Outcome (user can …)                                                              | Prerequisites | PRD refs                         | Status   |
| ---- | -------------------------- | --------------------------------------------------------------------------------- | ------------- | -------------------------------- | -------- |
| F-01 | cards-table-with-isolation | (foundation) tabela fiszek z izolacją danych per użytkownik jest na produkcji     | —             | NFR: użytkownik widzi wyłącznie swoje fiszki; Access Control | done |
| S-01 | account-lifecycle-on-prod  | zarejestrować się, zalogować i wylogować na produkcji                             | —             | US-01, FR-001, FR-008, FR-009    | done     |
| S-02 | generate-card-proposals    | wkleić tekst i zobaczyć listę propozycji fiszek (przód/tył) od AI                 | —             | US-01, FR-002, FR-003, FR-011    | in-progress |
| S-03 | accept-and-save-cards      | zaakceptować, poprawić lub usunąć każdą propozycję; zaakceptowane zapisują się od razu | S-02, F-01 | US-01, FR-004, FR-005, FR-012    | done |
| S-04 | manage-saved-cards         | zobaczyć listę zapisanych fiszek oraz je edytować i usuwać                        | S-03          | FR-010                           | done |
| S-05 | srs-review-session         | przejść sesję powtórek, ocenić fiszkę i mieć wyznaczony termin powrotu            | S-03          | US-01, FR-006, FR-013            | proposed |

## Streams

Pomoc nawigacyjna — grupuje elementy ze wspólnym łańcuchem zależności. Kanoniczna kolejność jest w grafie zależności poniżej.

| Stream | Theme                    | Chain                          | Note                                                                          |
| ------ | ------------------------ | ------------------------------ | ----------------------------------------------------------------------------- |
| A      | Zapis i zarządzanie talią | `F-01` → `S-03` → `S-04`       | Najkrótsza droga do gwiazdy przewodniej; `S-03` dołącza też do Stream B w `S-02`. |
| B      | Generowanie propozycji   | `S-02`                         | Gotowy do planowania (decyzje o limitach rozstrzygnięte w PRD); zasila `S-03`.                      |
| C      | Konto na produkcji       | `S-01`                         | Samodzielny, niezależny od reszty; weryfikuje już istniejący przepływ.         |
| D      | Pętla powtórek           | `S-05`                         | Dołącza do Stream A w `S-03`; domyka pierwsze kryterium sukcesu.               |

## Baseline

Co już jest w kodzie na dzień `2026-10-19` (zbadane automatycznie, potwierdzone przez użytkownika). Foundations poniżej tego nie odtwarzają.

- **Frontend:** present — Astro + React + Tailwind, `src/components/ui/button.tsx`, strony `src/pages/` (index, dashboard, auth).
- **Backend / API:** partial — tylko `src/pages/api/auth`; brak endpointów generowania i fiszek.
- **Data:** absent — brak `supabase/migrations/`, brak tabel fiszek.
- **Auth:** present — `src/lib/supabase.ts` (klient cookie, `null` bez env), `src/middleware.ts` (`PROTECTED_ROUTES`).
- **Deploy / infra:** present — Worker `10xcards` wdrożony (`deploy-plan.md`); CI bez joba deploy.
- **Observability:** partial — tylko włączone `observability` Workera; brak własnego logowania.

## Foundations

### F-01: Tabela fiszek z izolacją danych per użytkownik

- **Outcome:** (foundation) tabela fiszek z RLS (przód, tył, właściciel; każdy użytkownik widzi i zmienia wyłącznie własne wiersze) jest na produkcji, a izolacja kont A/B jest dowiedziona skryptem w CI.
- **Change ID:** cards-table-with-isolation
- **PRD refs:** NFR: użytkownik widzi wyłącznie swoje fiszki; Access Control
- **Unlocks:** `S-03` (zapis zaakceptowanych fiszek), `S-04`, `S-05` (czytają te same wiersze); ścieżka weryfikacji izolacji kont A/B.
- **Prerequisites:** —
- **Parallel with:** `S-01`, `S-02`
- **Blockers:** — (migracja na produkcyjną bazę to ręczna bramka człowieka, zgodnie z `deploy-plan.md` M3)
- **Unknowns:** —
- **Risk:** Dane i izolacja to jedyne ryzyko, którego nie da się bezpiecznie dołożyć „przy okazji" pierwszego zapisu; kolumny terminów powtórek i liczniki NIE należą tu, dochodzą w pierwszych wycinkach, które ich używają.
- **Status:** done

## Slices

### S-01: Rejestracja, logowanie i wylogowanie na produkcji

- **Outcome:** user can zarejestrować konto emailem i hasłem, zalogować się i wylogować na wdrożonej aplikacji.
- **Change ID:** account-lifecycle-on-prod
- **PRD refs:** US-01, FR-001, FR-008, FR-009
- **Prerequisites:** — (przepływ auth jest w punkcie bazowym)
- **Parallel with:** `F-01`, `S-02`
- **Blockers:** —
- **Unknowns:**
  - Rejestracja i logowanie na produkcji nie zostały zweryfikowane ręcznie (smoke pomija je, bo hostowany dostawca odrzuca adresy `example.com`) — Owner: user. Block: no.
- **Risk:** Przepływ już istnieje, więc to głównie weryfikacja i domknięcie luk; dlatego wycinek jest mały i równoległy, a nie przed gwiazdą przewodnią.
- **Status:** done

### S-02: Generowanie propozycji fiszek z wklejonego tekstu

- **Outcome:** user can wkleić tekst, kliknąć „Generuj" i zobaczyć listę propozycji fiszek (przód i tył), a przy pustym polu, przekroczonym limicie lub błędzie generowania dostać czytelny komunikat z zachowanym tekstem.
- **Change ID:** generate-card-proposals
- **PRD refs:** US-01, FR-002, FR-003, FR-011
- **Prerequisites:** — (auth jest w punkcie bazowym)
- **Parallel with:** `F-01`, `S-01`
- **Blockers:** —
- **Unknowns:**
  - Decyzja (rozstrzygnięte, PRD): maksymalnie 10 propozycji na jeden tekst; wartość startowa, do korekty po testach na własnych tekstach przy wyborze modelu.
  - Decyzja (rozstrzygnięte, PRD): limit długości wklejanego tekstu to 10 000 znaków.
  - Który model AI i czy mieści się w 30 s oraz w limitach runtime'u wdrożenia (ryzyko R10 z `deploy-plan.md`)? — Owner: team. Block: no (mierzone w tym wycinku).
- **Risk:** Największa niepewność produktu i jedyny płatny element; wklejony tekst nie może być zapisywany ani logowany, a endpoint wymaga sesji (401), zgodnie z `lessons.md`. Wycinek zwraca propozycje bez ich zapisu, więc nie czeka na `F-01`.
- **Status:** in-progress (fazy 1–3 zmergowane w PR #10; zostaje faza 4: sekret OpenRouter i wdrożenie na produkcję — `/10x-implement generate-card-proposals phase 4`)

### S-03: Akceptacja i zapis fiszek na koncie

- **Outcome:** user can zaakceptować, poprawić lub usunąć każdą propozycję, a zaakceptowane fiszki zapisują się na jego koncie od razu; autor produktu może policzyć odsetek akceptacji z zapisanych liczników.
- **Change ID:** accept-and-save-cards
- **PRD refs:** US-01, FR-004, FR-005, FR-012
- **Prerequisites:** S-02, F-01
- **Parallel with:** `S-01`
- **Blockers:** —
- **Unknowns:**
  - Kryterium „75% fiszek tworzonych z AI" jest w v1 spełnione z definicji (PRD Open Question 1) — Owner: user. Block: no (liczniki akceptacji z FR-012 działają niezależnie od odpowiedzi).
- **Risk:** To gwiazda przewodnia, więc jest tuż za `S-02` i `F-01`; komponent edycji ma być wspólny z `S-04` (notatka z shapingu), żeby nie dublować pracy.
- **Status:** done

### S-04: Lista zapisanych fiszek z edycją i usuwaniem

- **Outcome:** user can zobaczyć listę swoich zapisanych fiszek oraz edytować i usuwać każdą (usunięcie usuwa też dane powtórek, edycja ich nie zeruje).
- **Change ID:** manage-saved-cards
- **PRD refs:** FR-010
- **Prerequisites:** S-03
- **Parallel with:** `S-05`
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Najniższa wartość w stosunku do gwiazdy przewodniej i pętli powtórek, więc po `S-03`; wspólny komponent edycji z `S-03` utrzymuje wycinek mały (bez filtrów, wyszukiwania i paginacji).
- **Status:** done

### S-05: Sesja powtórek z wyznaczanym terminem powrotu

- **Outcome:** user can przejść sesję powtórek (przód, odsłonięcie odpowiedzi, ocena pamięci), po czym fiszka ma wyznaczony przez gotowy algorytm termin powrotu; bez fiszek do powtórki widzi czytelny komunikat.
- **Change ID:** srs-review-session
- **PRD refs:** US-01, FR-006, FR-013
- **Prerequisites:** S-03
- **Parallel with:** `S-04`
- **Blockers:** —
- **Unknowns:**
  - Który gotowy algorytm powtórek (PRD zakazuje własnego)? — Owner: user. Block: no.
- **Risk:** Domyka pierwsze kryterium sukcesu („od logowania do pierwszej ocenionej fiszki z terminem powrotu"); termin zapisany przy fiszce musi być sprawdzony testem (zmiana po ocenie), bo bez wyświetlania terminu (FR-007) to jedyny dowód.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                                         | Ready for `/10x-plan` | Notes |
| ---------- | -------------------------- | ------------------------------------------------------------- | --------------------- | ----- |
| F-01       | cards-table-with-isolation | Tabela fiszek z izolacją danych per użytkownik                | yes                   | Run `/10x-plan cards-table-with-isolation`; migracja na produkcję = ręczna bramka |
| S-01       | account-lifecycle-on-prod  | Weryfikacja rejestracji, logowania i wylogowania na produkcji | yes                   | Run `/10x-plan account-lifecycle-on-prod` |
| S-02       | generate-card-proposals    | Generowanie propozycji fiszek z wklejonego tekstu             | yes                   | Fazy 1–3 w `main` (PR #10); zostaje faza 4 (produkcja) |
| S-03       | accept-and-save-cards      | Akceptacja, edycja i zapis fiszek (gwiazda przewodnia)        | no                    | Czeka na S-02 i F-01 |
| S-04       | manage-saved-cards         | Lista zapisanych fiszek z edycją i usuwaniem                  | no                    | Czeka na S-03 |
| S-05       | srs-review-session         | Sesja powtórek z terminem powrotu                             | no                    | Czeka na S-03 |

## Open Roadmap Questions

1. **Kryterium „użytkownicy tworzą 75% fiszek z wykorzystaniem AI" jest z definicji spełnione w v1 bez ręcznego tworzenia (100%) — zostawić, zastąpić inną metryką czy przywrócić ręczne tworzenie?** — Owner: user. Block: roadmap-wide (nie blokuje wycinków; wpływa na ocenę sukcesu po `S-03`).
2. **Twardy termin dostarczenia MVP: data nieznana — użytkownik sprawdzi termin składania projektu.** — Owner: user. Block: roadmap-wide (nie blokuje; wpływa na decyzje o Parked).

## Parked

- **Wyświetlanie terminu powrotu fiszki (FR-007, nice-to-have)** — Why parked: PRD Non-Goals (v2); przy `main_goal: speed` poza ścisłą ścieżką must-have.
- **Ręczne tworzenie fiszek** — Why parked: PRD Non-Goals (v2).
- **Weryfikacja adresu email i reset hasła** — Why parked: PRD Non-Goals (v2).
- **Filtry, wyszukiwanie i paginacja listy fiszek** — Why parked: PRD Non-Goals; lista minimalna w v1.
- **Ustawienia powtórek, własny algorytm powtórek, import PDF/DOCX, współdzielenie zestawów, integracje, aplikacje mobilne** — Why parked: PRD Non-Goals.
- **Limit generowań na użytkownika** — Why parked: PRD Non-Goals; potrzebny dopiero przy dużo większej skali.
- **Job CI do deployu; keep-alive dla darmowego projektu bazy (R7, R9)** — Why parked: prace operacyjne bez śladu w PRD; przy `main_goal: speed` odłożone, wrócą jako osobna decyzja, jeśli zaczną blokować (np. wstrzymanie projektu po 7 dniach bez ruchu).

## Milestone History

(Append-only. Pusty przy pierwszym kamieniu milowym.)

## Done

(Puste. `/10x-archive` dopisuje wpisy, gdy zmiana o pasującym `Change ID` zostaje zarchiwizowana.)

- **F-01: (foundation) tabela fiszek z RLS (przód, tył, właściciel; każdy użytkownik widzi i zmienia wyłącznie własne wiersze) jest na produkcji, a izolacja kont A/B jest dowiedziona skryptem w CI.** — Archived 2026-10-20 → `context/archive/2026-10-19-cards-table-with-isolation/`. Lesson: —.
- **S-01: user can zarejestrować konto emailem i hasłem, zalogować się i wylogować na wdrożonej aplikacji.** — Archived 2026-10-22 → `context/archive/2026-10-21-account-lifecycle-on-prod/`. Lesson: —.
- **S-03: user can zaakceptować, poprawić lub usunąć każdą propozycję, a zaakceptowane fiszki zapisują się na jego koncie od razu; autor produktu może policzyć odsetek akceptacji z zapisanych liczników.** — Archived 2026-10-30 → `context/archive/2026-10-26-accept-and-save-cards/`. Lesson: —.
- **S-04: user can zobaczyć listę swoich zapisanych fiszek oraz edytować i usuwać każdą (usunięcie usuwa też dane powtórek, edycja ich nie zeruje).** — Archived 2026-10-30 → `context/archive/2026-10-27-manage-saved-cards/`. Lesson: —.
