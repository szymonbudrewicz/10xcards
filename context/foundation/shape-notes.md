---
project: "10xCards"
context_type: greenfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
created: 2026-10-15
updated: 2026-10-15
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "persona scope"
      decision: "jeden nazwany użytkownik — autor produktu"
    - topic: "pain category"
      decision: "tarcie w workflow"
    - topic: "insight"
      decision: "wąskie gardło to tworzenie fiszek, nie samo powtarzanie"
  frs_drafted: 13
  quality_check_status: accepted
---

# Shape notes — 10xCards

## Seed idea (verbatim from idea-notes.md)

Główny problem: Manualne tworzenie wysokiej jakości fiszek edukacyjnych jest czasochłonne, co zniechęca do korzystania z efektywnej metody nauki jaką jest spaced repetition.

Najmniejszy zestaw funkcjonalności:
- Generowanie fiszek przez AI na podstawie wprowadzonego tekstu (kopiuj-wklej)
- Manualne tworzenie fiszek
- Przeglądanie, edycja i usuwanie fiszek
- Prosty system kont użytkowników do przechowywania fiszek
- Integracja fiszek z gotowym algorytmem powtórek

Poza zakresem MVP:
- Własny, zaawansowany algorytm powtórek (jak SuperMemo, Anki)
- Import wielu formatów (PDF, DOCX, itp.)
- Współdzielenie zestawów fiszek między użytkownikami
- Integracje z innymi platformami edukacyjnymi
- Aplikacje mobilne (na początek tylko web)

Kryteria sukcesu:
- 75% fiszek wygenerowanych przez AI jest akceptowane przez użytkownika
- Użytkownicy tworzą 75% fiszek z wykorzystaniem AI

## Vision & Problem Statement

Pain: ręczne tworzenie wysokiej jakości fiszek zajmuje więcej czasu niż samo przeczytanie materiału, więc osoba ucząca się rezygnuje z robienia fiszek, a w efekcie w ogóle nie korzysta ze spaced repetition, mimo że wie, że ta metoda działa.

Moment: czytanie artykułu, dokumentacji lub notatek z kursu przy chęci zapamiętania treści na dłużej.

Cost today: brak fiszek i brak spaced repetition — rezygnacja następuje już na samą myśl o ręcznej pracy.

Insight: wąskie gardło to tworzenie fiszek, nie samo powtarzanie (samo powtarzanie jest rozwiązane przez gotowe algorytmy). Brakuje taniego wejścia z surowego tekstu do gotowych fiszek.

Skala (Faza 6): przy 100x większej skali reguła domenowa bez zmian; nowość to płatne wywołanie AI przy każdym generowaniu, więc potrzebny byłby limit generowań na użytkownika.

## User & Persona

Główna persona: autor produktu jako jedyny nazwany użytkownik — osoba czytająca artykuły, dokumentację i notatki z kursów, która chce zapamiętać materiał na dłużej, ale rezygnuje, bo ręczne robienie fiszek jest zbyt czasochłonne.

## Access Control

Logowanie przez email + hasło; dane fiszek przechowywane na koncie użytkownika. Płaski model użytkowników: jeden rodzaj użytkownika, każdy widzi i zarządza wyłącznie własnymi fiszkami. Brak ról (admin/guest) i brak współdzielenia zestawów między użytkownikami.

## MVP flow (locked, Faza 3)

Zakres zmniejszony po ujawnieniu kosztu (wybór: Scope down). Z v1 wycięte: ręczne tworzenie fiszek. Szacunek: 3 tygodnie pracy po godzinach.

1. Użytkownik loguje się (email + hasło).
2. Wkleja tekst i klika „Generuj”.
3. AI zwraca listę proponowanych fiszek.
4. Użytkownik akceptuje dobre, poprawia słabe, usuwa niepotrzebne.
5. Zaakceptowane fiszki zapisują się na koncie.
6. Użytkownik wchodzi w sesję powtórek: widzi przód fiszki, odsłania odpowiedź i ocenia, jak dobrze ją pamięta.
7. Algorytm powtórek ustala, kiedy fiszka wróci.

## Success Criteria

### Primary
- Działający przepływ MVP od logowania do pierwszej ocenionej fiszki z wyznaczoną datą powrotu.
- ≥ 75% fiszek wygenerowanych przez AI jest akceptowane przez użytkownika na ekranie przeglądu.

### Secondary
- Od wklejenia tekstu do listy propozycji fiszek mija wyraźnie mniej czasu niż przy ręcznym tworzeniu.
- Użytkownik wraca do powtórek przez kolejne dni, czyli nawyk spaced repetition faktycznie powstaje.

### Guardrails
- Zaakceptowane fiszki nigdy nie giną.
- Przy błędzie generowania użytkownik dostaje czytelną informację.

## Open Questions (running)

1. Kryterium „użytkownicy tworzą 75% fiszek z wykorzystaniem AI” jest z definicji spełnione w v1 bez ręcznego tworzenia (100%) — zostawić, zastąpić inną metryką czy przywrócić ręczne tworzenie? Owner: user. Nierozstrzygnięte.
2. Ile propozycji fiszek AI zwraca na jeden tekst? Owner: user. Nierozstrzygnięte.
3. Dokładny limit długości wklejanego tekstu (propozycja: ok. 10 000 znaków) — potwierdzić. Owner: user.
4. Twardy termin dostarczenia MVP: data nieznana — użytkownik sprawdzi termin składania projektu. Owner: user.

## Functional Requirements

### Konto i dostęp
- FR-001: Użytkownik może zalogować się emailem i hasłem. Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi jak napisany.
- FR-008: Użytkownik może zarejestrować konto (email + hasło). Priority: must-have
  > Socrates: Ryzyko rozrostu zakresu (weryfikacja emaila, reset hasła). Resolution: FR zostaje — rejestracja jest potrzebna, by każdy użytkownik miał własne fiszki; w v1 bez weryfikacji adresu email i bez resetu hasła (v2).
- FR-009: Użytkownik może się wylogować. Priority: must-have
  > Socrates: Brak kontrargumentu; FR stoi jak napisany.

### Generowanie fiszek
- FR-002: Użytkownik może wkleić tekst i uruchomić generowanie fiszek. Priority: must-have
  > Socrates: Ryzyko słabej jakości fiszek z długiego tekstu. Resolution: FR zostaje; ryzyko ograniczone limitem długości tekstu (ok. 10 000 znaków, do potwierdzenia), a jakość mierzona metryką akceptowalności 75%.
- FR-003: Użytkownik może zobaczyć listę fiszek zaproponowanych przez AI. Priority: must-have
  > Socrates: Ryzyko zbyt długiej listy. Resolution: FR zostaje; górna granica liczby propozycji na jeden tekst (wartość do ustalenia przy wyborze modelu i testach na własnych tekstach); wynik ma stały format (przód i tył fiszki).
- FR-004: Użytkownik może zaakceptować, poprawić lub usunąć każdą propozycję. Priority: must-have
  > Socrates: Trzy akcje na karcie / duplikacja edycji z FR-010. Resolution: FR zostaje; świadoma akceptacja lub odrzucenie każdej propozycji jest potrzebna do policzenia metryki 75%, więc brak automatycznego zapisu wszystkiego.
- FR-005: Użytkownik może zapisać zaakceptowaną fiszkę na swoim koncie od razu po jej akceptacji. Priority: must-have
  > Socrates: Counter-argument considered: "zapis zbiorczy grozi utratą pracy przy przerwaniu sesji". Resolution: FR zmieniony — fiszka zapisuje się od razu po akceptacji (zapis jednostkowy zamiast zbiorczego).
- FR-011: Użytkownik, przy błędzie generowania, zachowuje wklejony tekst w polu i widzi czytelny komunikat. Priority: must-have
  > Socrates: Ryzyko wielokrotnych, płatnych wywołań AI po błędzie. Resolution: FR zostaje jako osobny wymóg, bo to guardrail testowany osobno; ponowne wywołanie w trakcie generowania jest niemożliwe (przycisk „Generuj” nieaktywny w trakcie).
- FR-012: Autor produktu może policzyć odsetek zaakceptowanych propozycji AI, bo zapisywana jest liczba zaproponowanych i zaakceptowanych fiszek. Priority: must-have
  > Socrates: Counter-argument considered: nieostra definicja akceptacji dla poprawionej fiszki. Resolution: FR zostaje, bo metryka 75% jest kryterium sukcesu i wymaga liczników. Propozycja zaakceptowana, także po poprawce, liczy się jako zaakceptowana; usunięta liczy się jako odrzucona.

### Zarządzanie zapisanymi fiszkami
- FR-010: Użytkownik może zobaczyć listę zapisanych fiszek oraz je edytować i usuwać. Priority: must-have
  > Socrates: Counter-arguments considered: pusty CRUD poza główną wartością; usunięcie psuje harmonogram. Resolution: FR zostaje (realizuje zarządzanie danymi; logika domenowa jest w generowaniu i powtórkach). Usunięcie fiszki usuwa też jej dane powtórek; edycja treści nie zeruje jej historii. Zakres v1 minimalny: bez filtrów, wyszukiwania i paginacji.

### Powtórki
- FR-006: Użytkownik może przejść sesję powtórek: zobaczyć przód fiszki, odsłonić odpowiedź i ocenić, jak dobrze ją pamięta. Priority: must-have
  > Socrates: Counter-arguments considered: samoocena bywa zawodna; pusta sesja. Resolution: FR zostaje; samoocena jest podstawą gotowego algorytmu powtórek i nie zmienia się w v1. Dodane zachowanie: gdy nie ma fiszek do powtórki (brak zaległości albo brak fiszek), użytkownik widzi czytelny komunikat zamiast pustego ekranu.
- FR-013: Użytkownik, po ocenie fiszki, ma jej termin powrotu wyznaczony przez algorytm powtórek. Priority: must-have
  > Socrates: Counter-arguments considered: gotowy algorytm może nie pasować do fiszek z AI; brak weryfikacji bez widocznego terminu. Resolution: FR zostaje; fiszki z AI trafiają do powtórek dopiero po akceptacji, więc słabe karty są odsiewane wcześniej. Wyznaczony termin jest zapisywany przy fiszce i weryfikowany testem (po ocenie zapisany termin zmienia się zgodnie z algorytmem).
- FR-007: Użytkownik może zobaczyć wyznaczony termin powrotu fiszki. Priority: nice-to-have
  > Socrates: Brak kontrargumentu; FR stoi jak napisany.

## User Stories

### US-01: Użytkownik zamienia wklejony tekst w fiszki i ćwiczy je

- **Given** zalogowany użytkownik z tekstem artykułu
- **When** wkleja tekst, klika „Generuj”, przegląda propozycje i zapisuje zaakceptowane
- **Then** zaakceptowane fiszki są na jego koncie i może od razu przejść do sesji powtórek, w której po ocenie fiszki algorytm wyznacza jej kolejny termin

#### Acceptance Criteria
- Gdy pole z tekstem jest puste, aplikacja nie wywołuje AI i pokazuje czytelny komunikat.
- Tekst ma limit długości (propozycja użytkownika: ok. 10 000 znaków). Po przekroczeniu użytkownik widzi komunikat, a tekst zostaje w polu.
- Liczba propozycji na jeden tekst: nieustalona (patrz Open Questions).

## Forward: tech-stack

- Konta użytkowników (FR-001/008/009): użytkownik chce użyć gotowego rozwiązania do kont zamiast własnego (informacja dla wyboru stacku, nie część PRD).
- Wybór modelu AI nieustalony; limit długości tekstu (ok. 10 000 znaków) do potwierdzenia przy jego wyborze.

## Forward: scope-notes (do Non-Goals w Fazie 6)

- W v1 bez weryfikacji adresu email i bez resetu hasła (v2).

## Forward: technical-roadmap

- Edycja z FR-004 i FR-010 ma być zrealizowana jednym wspólnym komponentem (uniknięcie dublowania pracy).

## Business Logic

Aplikacja zamienia wklejony tekst w propozycje fiszek (przód i tył), a po akceptacji przez użytkownika sama wyznacza termin powtórki każdej fiszki.

Dane wejściowe widoczne dla użytkownika: wklejony tekst (z limitem długości), jego decyzja o każdej propozycji (zaakceptuj, popraw, usuń) oraz jego ocena, jak dobrze pamięta fiszkę podczas powtórki.

Wynik: lista propozycji fiszek o stałym formacie (przód i tył), a dla zaakceptowanych fiszek — termin ich powrotu do powtórki, który zmienia się po każdej ocenie.

Użytkownik spotyka regułę w dwóch miejscach przepływu: po kliknięciu „Generuj” dostaje gotowe propozycje, które tylko akceptuje, poprawia lub usuwa; w sesji powtórek sam nie ustala harmonogramu, tylko ocenia swoją pamięć. Antywzorzec pustego CRUD nie wystąpił.

## Non-Functional Requirements

- Propozycje fiszek pojawiają się w ciągu 30 s od kliknięcia „Generuj” dla tekstu do limitu długości (cel do potwierdzenia pomiarem po wyborze modelu).
- Użytkownik widzi wyłącznie swoje fiszki; konto A nigdy nie widzi fiszek konta B.
- Aplikacja działa w aktualnych wersjach głównych przeglądarek na komputerze; urządzenia mobilne są poza zakresem v1.
- Wklejony tekst jest używany wyłącznie do wygenerowania propozycji fiszek i nie pozostaje w żadnym trwałym magazynie ani zapisie dostępnym operatorowi po zakończeniu żądania, które go przetworzyło; trwale zapisywane są tylko fiszki użytkownika oraz liczniki z FR-012.
- Fiszki zostają na koncie do czasu ich usunięcia przez użytkownika (retencja świadomie bez dodatkowych wymagań w v1).

## Non-Goals

- Własny zaawansowany algorytm powtórek (typu SuperMemo/Anki) — używany jest gotowy algorytm; budowa własnego poza zakresem.
- Import PDF, DOCX i innych formatów — jedyne wejście to wklejony tekst.
- Współdzielenie zestawów fiszek między użytkownikami — każdy użytkownik widzi tylko swoje fiszki.
- Integracje z innymi platformami edukacyjnymi.
- Aplikacje mobilne — tylko web na komputerze.
- Ręczne tworzenie fiszek — przesunięte na v2; w v1 fiszki powstają wyłącznie z AI.
- Weryfikacja adresu email i reset hasła — v2.
- Wyświetlanie terminu powrotu fiszki (FR-007, nice-to-have) — v2.
- Ustawienia powtórek.
- Filtry, wyszukiwanie i paginacja na liście zapisanych fiszek — lista minimalna w v1.
- Limit generowań na użytkownika — w v1 nie występuje; byłby potrzebny dopiero przy dużo większej skali.

## Quality cross-check

Wynik: accepted — wszystkie elementy obecne (Access Control, Business Logic, Timeline-cost, Non-Goals; preserved behavior n/a dla greenfield). Nierozstrzygnięte kwestie są w `## Open Questions`.
