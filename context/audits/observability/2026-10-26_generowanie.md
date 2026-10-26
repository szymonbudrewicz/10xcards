---
type: observability-audit
date: 2026-10-26 21:15
mode: audit
commit: f4da533
branch: main
dirty_tree: true
areas: [generowanie]
area_source: user
runtime_proof: partial
error_tracker: none (console.* → Cloudflare Workers Logs)
previous_report: null
findings: { critical: 1, high: 2, medium: 3, low: 2 }
---

# Audyt obserwowalności — generowanie (2026-10-26)

Zmodyfikowane drzewo: niezacommitowane były tylko pliki narzędzi kursu (`.claude/`, `CLAUDE.md`); kod aplikacji = `f4da533`.

## 1. TL;DR

- **Awaria Supabase wygląda jak wylogowanie.** `src/middleware.ts:16-18` wyrzuca `error` z `getUser()`. Gdy Supabase jest nieosiągalny albo klucz jest zły, każdy zalogowany użytkownik dostaje przekierowanie na `/auth/signin`, a `POST /api/generate` zwraca 401 „Zaloguj się”. Nie powstaje ani jeden wiersz logu (potwierdzone sondą SDK).
- **Tłumaczenie błędów gubi oryginał.** `CardGenerationError` nie przenosi `cause`, a trasa loguje tylko `{ code, providerStatus }`. Awaria sieci, zły JSON od modelu, niezgodny schemat i błąd w naszym kodzie (np. `TypeError`) dają ten sam wiersz `generate failed { code: "ai_failed" }`.
- **Łagodne ścieżki nie mają własnego sygnału.** Brak klucza OpenRouter (503) i pusta lista propozycji (200 z `[]`) nie logują niczego.
- Kod nie zawiera trackera błędów. Jedyny kanał to `console.*` → Workers Logs.

## 2. Model przechwytywania

- **Środowisko:** Astro SSR (`output: "server"`, `astro.config.mjs:12`) na Cloudflare Workers (`wrangler.jsonc:4`, adapter `@astrojs/cloudflare`). Brak zadań w tle, kolejek i crona.
- **Tracker błędów:** brak, w repo nie ma żadnego SDK (grep `sentry|onerror|unhandledrejection|ErrorBoundary` po `src/`, `astro.config.mjs`, `package.json`: 0 trafień).
- **Granice przechwytywania:** brak granicy trackera. Nieobsłużone wyjątki trafiają do Astro (500) i do logów Workera jako exception. Obsłużone błędy są widoczne tylko wtedy, gdy kod sam wywoła `console.*`.
- **Logowanie:** jedyny wiersz w przepływie to `console.error("generate failed", { code, providerStatus })` (`src/pages/api/generate.ts:59`). `wrangler.jsonc:13-15` ma włączone `observability` (bez `head_sampling_rate`, czyli domyślnie 100%). Kod klienta (`useGenerateProposals.ts`) nie loguje niczego.
- **Czyszczenie danych:** świadoma reguła prywatności. Wklejony tekst, prompt i odpowiedź modelu nie są logowane (`generate.ts:7-8`, `card-generation.ts:4-5`, CLAUDE.md). Każda poprawka musi tę regułę zachować.
- **Tożsamość wdrożenia:** w kodzie brak tagu wersji. Metadane wersji Workera dokłada platforma (poza repo).

**Założenia (poza repozytorium, nie są ustaleniami):**
- Workers Logs zbierają `console.*` na produkcji (włączone w `wrangler.jsonc`, niepotwierdzone w panelu). Niepotwierdzone.
- Brak reguł alertów na wiersze logu. Nikt nie dostaje powiadomienia o `generate failed`. Niepotwierdzone.
- Generowanie nie jest jeszcze wdrożone na produkcję (S-02 faza 4 odłożona), więc audyt dotyczy stanu „przed uruchomieniem”.

## 3. Co trafia do logów (statycznie, poza wierszem G1)

| Postać awarii | Odpowiedź | Workers Logs | Tracker | Werdykt |
| --- | --- | --- | --- | --- |
| Supabase nieosiągalny / 5xx / zły klucz (`getUser` → `AuthRetryableFetchError`) | `/generate` → 302 na signin; API → 401 `unauthorized` | **nic** | — | niewidoczne (**potwierdzone sondą**) |
| Brak `OPENROUTER_API_KEY` | 503 `ai_not_configured` | **nic** | — | widoczne tylko jako baner w UI |
| OpenRouter non-2xx | 502 `ai_failed` | `generate failed {ai_failed, providerStatus}` | — | diagnozowalne |
| Timeout 30 s | 504 `ai_timeout` | `generate failed {ai_timeout}` | — | diagnozowalne |
| Błąd sieci / DNS / TLS do OpenRouter | 502 `ai_failed` | `generate failed {ai_failed}`, bez przyczyny | — | nie do odróżnienia |
| 2xx z nie-JSON / zły kształt completion / zły JSON w content / zły schemat | 502 `ai_failed` | jak wyżej | — | nie do odróżnienia |
| Bug w naszym kodzie (`TypeError` w serwisie) | 502 `ai_failed` | jak wyżej, **bez stacka** | — | bug udaje awarię dostawcy |
| Model zwraca 0 poprawnych propozycji | 200 `{ proposals: [] }` | **nic** | — | ciche |
| Nieobsłużony wyjątek (np. błędny `SUPABASE_URL` → wyjątek w `createServerClient`) | 500 | exception Workera | — | widoczne (lessons.md) |

## 4. Systemowe przyczyny źródłowe

1. **Wynik błędu z SDK traktowany jak „brak danych”.** `src/middleware.ts:16-18` destrukturyzuje tylko `data.user`. `@supabase/auth-js` (`GoTrueClient._getUser`) nie rzuca przy awarii sieci ani 5xx, tylko zwraca `{ data: { user: null }, error: AuthRetryableFetchError }`. Lokalnie rozsądne, bo `user ?? null` obsługuje gościa, ale awaria i „niezalogowany” zlewają się w jedno. Wyjaśnia G1.
2. **Tłumaczenie błędu bez zachowania oryginału.** `card-generation.ts:107-110` tworzy nowy `CardGenerationError` bez `cause`. `generate.ts:56-59` loguje tylko kod, a obcy wyjątek mapuje na `ai_failed`. Powód był dobry (prywatność: nie logować treści), ale wyrzucono też nazwę i stack, które treści nie zawierają. Wyjaśnia G3, G4, G5.
3. **Łagodne gałęzie bez własnego sygnału.** Fallbacki chronią użytkownika (baner, komunikat, pusta lista), ale nie zostawiają śladu w logach. Wyjaśnia G2, G6, G7.

## 5. Ustalenia

### Generowanie (`/generate` → `POST /api/generate` → `card-generation.ts` → OpenRouter)

| # | Lokalizacja | Kategoria | Ważność | Co dzieje się na produkcji | Kierunek poprawki |
| --- | --- | --- | --- | --- | --- |
| G1 | `src/middleware.ts:16-18` | swallowed + flattened-response | **critical** | Awaria lub zła konfiguracja Supabase „wylogowuje” wszystkich: przekierowanie na signin, API 401 „Zaloguj się”. W logach nic. Dokładnie ta klasa awarii kosztowała już czas przy pierwszym wdrożeniu (lessons.md, `SUPABASE_URL`). | Odbierać `error`. Gdy to nie `AuthSessionMissingError` (zwykły gość), `console.error` z `name`/`status`/`code` (bez emaila i tokenów). API zwraca 503 `auth_unavailable` zamiast 401. |
| G3 | `src/pages/api/generate.ts:56-60` | identity-lost | high | Bug w naszym kodzie jest logowany jako `ai_failed` bez nazwy i stacka i wygląda jak awaria OpenRouter. | Dla błędów spoza `CardGenerationError` logować `error.name` i `error.stack`. |
| G4 | `src/lib/services/card-generation.ts:107-110` | identity-lost | high | Awaria sieci, DNS czy TLS albo nie-JSON na 2xx daje `ai_failed` bez przyczyny. Nie wiadomo, czy padła sieć, czy dostawca. | `new CardGenerationError(code, { cause })` i logowanie `cause.name`. |
| G5 | `src/lib/services/card-generation.ts:113-127` | identity-lost | medium | Trzy różne naruszenia kontraktu modelu (kształt completion, JSON, schemat) są nie do odróżnienia w logu. | Pole `reason` (`network`/`bad_status`/`bad_completion`/`bad_json`/`bad_schema`) w błędzie i w logu. **Nie logować `message` z `JSON.parse`**: zawiera fragment odpowiedzi modelu. |
| G2 | `src/pages/api/generate.ts:46-49` | flattened-response | medium | Brak sekretu OpenRouter po wdrożeniu (faza 4) daje 503 dla każdego żądania i zero wierszy logu. Widać tylko baner w UI. | `console.error("generate: ai_not_configured")`. |
| G6 | `src/lib/services/card-generation.ts:129-132` | missing-throw | medium | Model zwraca same puste karty → 200 z `[]`. Ciche pogorszenie, które psuje metrykę akceptacji 75%. | `console.warn` z liczbami (otrzymane vs zachowane), bez treści. |
| G7 | `src/components/hooks/useGenerateProposals.ts:42,51` | swallowed | low | Błąd sieci i nie-JSON (także 2xx bez `proposals`) dają ten sam komunikat „Nie udało się połączyć”. Brak trackera klienta, więc nikt tego nie zobaczy. | `console.error` w `catch` (pomaga przy debugowaniu w przeglądarce). Osobny komunikat dla 2xx o złym kształcie. |
| G8 | `src/pages/api/generate.ts:59` | missing-context | low | Wiersz `generate failed` nie wskazuje użytkownika ani żądania. Nie da się połączyć zgłoszenia z wpisem w logu. | Dodać `userId` (UUID, nie email). Ewentualnie `cf-ray` z nagłówka. |

### Platforma / infrastruktura kodu

Brak ustaleń poza modelem przechwytywania. Próbkowanie wynosi 100% (domyślne). Kod nie ma hooków czyszczenia, które gubiłyby stack. Brak trackera to warunek wstępny, nie przyczyna źródłowa (zob. Założenia).

## 6. Zalecana kolejność poprawek

1. **G1 (middleware):** jedna zmiana w kilku wierszach zamyka jedyną niewidoczną awarię, która dotyczy wszystkich użytkowników i wszystkich stron chronionych. Ograniczenie: nie logować `AuthSessionMissingError` (to zwykły gość, byłby szum) ani danych użytkownika.
2. **G3 + G4 + G5:** jeden helper albo jedno rozszerzenie `CardGenerationError` (`cause` + `reason`) i jedno miejsce logowania w trasie. Ograniczenie prywatności: logować `name`, `reason`, `providerStatus`, `stack`, nigdy `message` błędów parsowania treści, promptu ani odpowiedzi.
3. **G2 + G6:** dwa wiersze `console.*`. Warto przed fazą 4 (wdrożenie generowania).
4. **G7 + G8:** kosmetyka.

## 8. Metoda i ograniczenia

- Audyt bez rozdzielania na podagentów: przepływ to 7 plików (`generate.astro`, `GenerateForm.tsx`, `useGenerateProposals.ts`, `middleware.ts`, `supabase.ts`, `api/generate.ts`, `card-generation.ts`, `api-response.ts`), przeczytane w całości ręcznie.
- **Sprawdzone ręcznie:** zachowanie `GoTrueClient._getUser` w `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js` (AuthError jest zwracany, nie rzucany). `fetch.js`: awaria sieci i 5xx → `AuthRetryableFetchError`.
- **Sonda środowiska (częściowa):** skrypt poza repo (`scratchpad/probe-getuser.cjs`) z `createServerClient` (@supabase/ssr) skierowanym na `http://127.0.0.1:9` i ważnym ciasteczkiem sesji. Wynik: `RESOLVED user=null error=AuthRetryableFetchError 0`, czyli bez wyjątku. Middleware i aplikacji nie uruchamiano. Pozostałe wiersze tabeli z sekcji 3 są statyczne.
- **Niezweryfikowane:** jak Workers Logs renderują obiekty z `console.error`; czy na produkcji istnieją alerty.
