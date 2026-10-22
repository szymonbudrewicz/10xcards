# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-22

## 1. Strategy

Testy w tym projekcie przestrzegają trzech nienegocjowalnych zasad:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje prawdziwy sygnał
   dla danego ryzyka. Nie promuj testu do e2e tylko dlatego, że e2e „wydaje
   się bezpieczniejsze”. Nie nakładaj modelu wizji na deterministyczny diff,
   który już łapie regresję.
2. **Obawy użytkownika są pełnoprawnym dowodem.** Ryzyka zakotwiczone w
   „autor boi się X, a awaria ujawniłaby się gdzieś w <obszarze>” ważą tyle
   samo co linie PRD czy dane hot-spotów.
3. **Ryzyka to scenariusze, nie miejsca w kodzie.** Ten plan opisuje, *co
   może zawieść* i *dlaczego uważamy to za prawdopodobne* — na podstawie
   dokumentów, wywiadu i *sygnału* z repozytorium (churn, struktura, baza
   testów). NIE twierdzi, że wie, która linia odpowiada za awarię. Tę wiedzę
   wytwarza `/10x-research` w każdej fazie wdrożenia. Jeśli plan i research
   nie zgadzają się co do miejsca awarii, prawdą jest research.

Wyrocznia testu (oczekiwany wynik) pochodzi z PRD, kontraktu API
(`{ error: { code, message } }`, komunikaty po polsku) albo z wywiadu — nigdy
z implementacji, którą test sprawdza.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`, `scripts/`
(19 commitów w ostatnich 30 dniach; wykluczone `dist/`, `node_modules/`,
`context/`, `lessons/`).

## 2. Risk Map

Najważniejsze scenariusze awarii, uporządkowane według ryzyko = wpływ ×
prawdopodobieństwo. Kolumna Source cytuje *dowód, który podniósł ryzyko* —
nigdy konkretnego pliku jako „miejsca awarii” (to zadanie researchu, §1
zasada 3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Użytkownik akceptuje propozycję, a fiszka nie zapisuje się na jego koncie (albo zapisuje się ze złą treścią lub bez zliczenia akceptacji) — a on myśli, że ją ma | High | High | PRD Guardrails („zaakceptowane fiszki nigdy nie giną”), FR-005, FR-012; interview Q1; roadmap S-03 (następny wycinek) |
| 2 | Aplikacja działa lokalnie, a na produkcji się sypie (brak lub zła wartość sekretu, różnice runtime'u Workers, hostowana baza) | High | High | interview Q2; lessons.md („Sekret SUPABASE_URL: sprawdzaj wartość”); archive `2026-10-21-account-lifecycle-on-prod` |
| 3 | Konto B czyta, zmienia lub usuwa fiszki konta A przez nowe endpointy zapisu i edycji | High | Medium | PRD NFR („konto A nigdy nie widzi fiszek konta B”), Access Control; archive `2026-10-19-cards-table-with-isolation`; roadmap S-03, S-04 |
| 4 | Przy pustym polu, za długim tekście lub błędzie AI użytkownik traci wklejony tekst, nie dostaje czytelnego komunikatu albo jedno kliknięcie wywołuje kilka płatnych generowań | Medium | High | PRD FR-011, US-01 Acceptance Criteria (10 000 znaków, maks. 10 propozycji); interview Q3; hot-spot dir `src/pages/api` (7 zmian/30d) |
| 5 | Niezalogowany wywołuje płatne generowanie AI albo wklejony tekst trafia do logów lub trwałego magazynu | High | Medium | lessons.md („Endpointy API wywołujące AI wymagają sesji (401)”); PRD NFR (wklejony tekst nie jest przechowywany); CLAUDE.md Conventions |
| 6 | Rejestracja, logowanie lub wylogowanie przestaje działać po zmianie przekierowań lub widoków auth | High | Medium | hot-spot dirs `src/components/auth` (11 zmian/30d), `src/pages/auth` (9 zmian/30d); PRD FR-001, FR-008, FR-009 |
| 7 | Po ocenie fiszki w sesji powtórek jej termin powrotu się nie zmienia (albo zmienia się niezgodnie z algorytmem), więc powtórki przestają działać | Medium | Medium | PRD FR-013 („weryfikowany testem”), Success Criteria Primary; roadmap S-05 |

Ryzyka #3 i #5 to scenariusze nadużycia (autoryzacja, nadużycie płatnego
zasobu, wyciek danych użytkownika). Awaria dostawcy (OpenRouter, Supabase,
Cloudflare) to wysoki wpływ przy niskim prawdopodobieństwie — należy do
obserwowalności, nie do testów.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | Po akceptacji (także po poprawce) fiszka jest w bazie na koncie użytkownika z treścią, którą zaakceptował; licznik akceptacji rośnie, usunięta propozycja liczy się jako odrzucona; błąd zapisu jest widoczny dla użytkownika, a nie cichy | „200 OK z endpointu = fiszka zapisana” | punkt wejścia zapisu, stan trwały (tabela fiszek, liczniki), zachowanie przy błędzie zapisu | integracja (endpoint + lokalny Supabase), jeden krok w e2e | asercja tylko na status odpowiedzi, bez odczytu stanu z bazy |
| #2 | Zbudowana aplikacja na runtime Workers przechodzi kluczowe kroki; po wdrożeniu smoke trafia w prawdziwe zdrowie auth i bazy | „Zielone lokalnie i w CI = działa na produkcji” | jak budowany jest preview w CI, które sekrety czyta produkcja, co dziś sprawdza smoke | smoke na buildzie (CI) + smoke po wdrożeniu | sprawdzanie obecności nazwy sekretu zamiast działania |
| #3 | Konto B dostaje odmowę przy odczycie, edycji i usunięciu fiszki A; dane A pozostają nietknięte; właściciel fiszki nigdy nie pochodzi z danych klienta | „RLS w bazie wystarczy, endpoint niczego nie musi sprawdzać” | granica auth w endpointach fiszek, skąd brany jest identyfikator właściciela, co już pokrywa skrypt `isolation` | integracja z dwoma kontami (jak `isolation`) | test tylko na jednym koncie (happy path właściciela) |
| #4 | Pusty tekst i tekst > 10 000 znaków nie wywołują AI i dają komunikat po polsku; błąd AI zostawia tekst w polu; wynik ma maks. 10 propozycji przód/tył; przycisk jest nieaktywny w trakcie generowania | „Brak wyjątku = poprawny błąd dla użytkownika” | walidacja po stronie serwera vs klienta, kształt błędu `{ error: { code, message } }`, granica z dostawcą AI (mock) | unit (walidacja/parsowanie) + integracja endpointu z mockiem AI; zachowanie pola w e2e | oczekiwane wartości przepisane z kodu zamiast z PRD (problem wyroczni) |
| #5 | Bez sesji endpoint generowania zwraca 401 i nie wywołuje AI; ani logi, ani baza nie zawierają wklejonego tekstu | „Middleware chroni wszystko” (PROTECTED_ROUTES przekierowuje, nie zwraca 401) | sprawdzanie sesji w endpointach JSON, co trafia do logów przy błędzie | integracja endpointu | sprawdzanie tylko kodu 401 bez dowodu, że AI nie zostało wywołane |
| #6 | Nowe konto: rejestracja → logowanie → strona chroniona → wylogowanie działa w przeglądarce; niezalogowany jest przekierowany na logowanie | „Smoke HTTP = działa w przeglądarce” | co już pokrywa smoke, przekierowania w middleware, obsługa cookies | e2e (jedna ścieżka) — bez dublowania smoke | e2e na każdy wariant błędu formularza (taniej integracją) |
| #7 | Po ocenie fiszki zapisany termin powrotu zmienia się zgodnie z gotowym algorytmem dla każdej oceny | „Termin zmienił się = jest poprawny” | wybrana biblioteka algorytmu, gdzie zapisywany jest termin | unit z wyrocznią z biblioteki/dokumentacji algorytmu + integracja zapisu | kopiowanie obliczeń algorytmu do testu |

## 3. Phased Rollout

Każdy wiersz to osobna faza wdrożenia, która otworzy własny folder zmiany
przez `/10x-new`. Status przesuwa się od lewej do prawej; orkiestrator
aktualizuje go, gdy artefakty pojawiają się na dysku.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Ochrona generowania | Udowodnić, że generowanie odrzuca złe wejście i brak sesji bez wywołania AI i zwraca czytelny błąd; postawić runner testów | #4, #5 | unit + integration (Vitest) | not started | — |
| 2 | E2E kluczowego przepływu | Udowodnić w przeglądarce, że użytkownik loguje się, wkleja tekst i widzi propozycje (mock AI), a przy błędzie zachowuje tekst; uruchamiane w CI (wymóg certyfikacji) | #6, #4 | e2e (Playwright) | not started | — |
| 3 | Zapis i izolacja fiszek | Po S-03: udowodnić, że zaakceptowana fiszka trwale ląduje na koncie właściciela z licznikiem i jest niedostępna dla innego konta; rozszerzyć e2e o akceptację i zapis | #1, #3 | integration + e2e | not started | — |
| 4 | Bramki jakości i smoke produkcji | Zablokować w CI testy z faz 1–3 jako wymagane; dodać smoke po wdrożeniu i lokalny hook po edycji | #2 | gates, post-edit-hook, smoke | not started | — |
| 5 | Harmonogram powtórek | Po S-05: udowodnić, że ocena fiszki zmienia zapisany termin zgodnie z gotowym algorytmem | #7 | unit + integration | not started | — |

## 4. Stack

Klasyczna baza testów projektu. Narzędzia AI-native mają datę `checked:`.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | 5.0.5 (npm, checked: 2026-10-22) | none yet — see Phase 1 |
| API mocking | lokalny mock OpenRouter (`scripts/mock-openrouter.mjs`) | n/a | istnieje dla smoke; dostawca AI mockowany tylko na granicy sieci |
| e2e | Playwright | 1.64.1 (npm, checked: 2026-10-22) | none yet — see Phase 2 |
| smoke (istniejące) | `scripts/smoke.mjs`, `scripts/isolation-check.mjs` | n/a | bez zależności, uruchamiane w jobie CI `smoke` na lokalnym Supabase |
| (optional) AI-native | post-edit hook agenta — checked: 2026-10-22 | n/a | When NOT to use: jako zamiennik CI ani do uruchamiania e2e po każdej edycji (za wolne) |
| (optional) AI-native | Playwright CLI / MCP do eksploracji przeglądarki przez agenta — checked: 2026-10-22 | n/a | When NOT to use: jako bramka; deterministyczny test e2e jest sygnałem, eksploracja agenta tylko pomaga go napisać |

Profil bazy testów: `none` — brak konfiguracji runnera i plików testowych w
kodzie aplikacji; istnieją dwa skrypty sprawdzające w CI (smoke, isolation).

**Stack grounding tools (current session):**
- Docs: none — Context7 / docs MCP not available in current session; wersje sprawdzone przez `npm view`; checked: 2026-10-22
- Search: none — Exa.ai not available in current session; web search nie był potrzebny; checked: 2026-10-22
- Runtime/browser: skill `playwright-cli` dostępny w repo, Claude in Chrome w sesji — możliwe użycie w fazie 2, not used; checked: 2026-10-22
- Provider/platform: GitHub przez `gh` CLI (CI na PR); Supabase/Cloudflare MCP not available in current session; checked: 2026-10-22

## 5. Quality Gates

Bramki, które zmiana musi przejść przed produkcją. „Required after §3 Phase
<N>” oznacza, że bramka jest egzekwowana po wdrożeniu tej fazy.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + lint:ui + typecheck (`astro check`) + build | CI (job `ci`) | required (wired) | dryf składni, typów, literałów UI |
| isolation A/B + smoke na buildzie | CI (job `smoke`) | required (wired) | wyciek danych między kontami, zepsuty auth i generowanie |
| unit + integration | local + CI | required after §3 Phase 1 | regresje walidacji, 401, kształtu błędu, zapisu |
| e2e on critical flows | CI on PR | required after §3 Phase 2 | zepsuty kluczowy przepływ użytkownika |
| post-edit hook | local (agent loop) | recommended after §3 Phase 4 | regresje w chwili edycji |
| pre-prod / post-deploy smoke | po wdrożeniu | optional, wired in §3 Phase 4 | awarie specyficzne dla produkcji |

Pre-commit (husky) nie jest podłączony — nie traktuj go jako bramki
(lessons.md). Wynik bramki oceniaj po kodzie wyjścia.

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każda podsekcja wypełnia się po
wdrożeniu odpowiedniej fazy; do tego czasu brzmi „TBD — see §3 Phase <N>”.

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 (walidacja wejścia generowania z wyrocznią z PRD).

### 6.2 Adding an integration test for an API endpoint

- TBD — see §3 Phase 1 (401 bez sesji, brak wywołania AI, kształt błędu) i Phase 3 (zapis z odczytem stanu z bazy, dwa konta).

### 6.3 Adding an e2e test

- TBD — see §3 Phase 2 (kluczowy przepływ z mockiem AI, zachowanie tekstu przy błędzie).

### 6.4 Adding a cross-account isolation check

- TBD — see §3 Phase 3 (wzorzec z dwoma kontami; punkt wyjścia: istniejący `npm run isolation`).

### 6.5 Adding a scheduling (SRS) test

- TBD — see §3 Phase 5 (wyrocznia z gotowego algorytmu, nie z kodu).

### 6.6 Per-rollout-phase notes

(Uzupełniane po każdej fazie.)

## 7. What We Deliberately Don't Test

Wykluczenia uzgodnione w wywiadzie (Phase 2 interview, Q5).

- **Wygląd UI, snapshoty i testy wizualne** — tokeny i literały pilnuje `lint:ui`; snapshoty się psują i niczego nie łapią. Re-evaluate if pojawi się regresja wizualna, której lint nie złapał. (Source: interview Q5.)
- **`/dev/kitchen-sink` i strony statyczne (index)** — tylko dev albo brak logiki. Re-evaluate if strona zacznie pobierać dane. (Source: interview Q5.)
- **Jakość treści fiszek z AI** — mierzy ją metryka akceptacji ≥ 75% (FR-012), nie test. Re-evaluate if zmieni się model lub prompt i metryka spadnie. (Source: interview Q5.)
- **Wydajność i obciążenie** — do 5 użytkowników (PRD target_scale). Re-evaluate if skala wzrośnie. (Source: interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-22
- Stack versions last verified: 2026-10-22
- AI-native tool references last verified: 2026-10-22

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
