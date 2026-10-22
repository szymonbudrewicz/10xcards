# S-02: Generowanie propozycji fiszek — plan implementacji

## Overview

Zalogowany użytkownik na nowej stronie `/generate` wkleja tekst (do 10 000 znaków), klika „Generuj” i dostaje do 10 propozycji fiszek (przód/tył) wygenerowanych przez OpenRouter (`anthropic/claude-haiku-5.5`). Propozycje nie są zapisywane (zapis to S-03). CI testuje cały przepływ HTTP na lokalnej atrapie OpenRouter, bez kosztów i bez prawdziwego klucza.

## Current State Analysis

- Auth działa: middleware ustawia `locals.user` i przekierowuje tylko ścieżki z `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:4`, `:18-22`). Ścieżki `/api/*` nie są chronione.
- Jedyne endpointy to `src/pages/api/auth/{signin,signup,signout}.ts`: formularz + przekierowania, komunikaty po angielsku. W projekcie nie ma endpointu JSON, helpera błędów, `src/lib/services/`, `src/types.ts` ani `src/components/hooks/`.
- `zod` `^4.6.7` jest w `package.json`, ale nigdzie nieużywany.
- Zmienne środowiskowe deklaruje `astro.config.mjs:19-24` (`envField`, `context: "server"`, `access: "secret"`, `optional: true`). Stan konfiguracji pokazuje baner z `src/lib/config-status.ts:11-21`.
- `scripts/smoke.mjs` (bez zależności) przechodzi: rejestracja → logowanie → `/dashboard` → wylogowanie, z ciasteczkami w `jar`. Job `smoke` w `.github/workflows/ci.yml:27-59` stawia lokalny Supabase, zapisuje sekrety do `.env` i `.dev.vars`, buduje aplikację i uruchamia `npm run preview` na porcie 4321.
- Infrastruktura: Cloudflare Workers Free, 10 ms CPU na wywołanie (R2), niezmierzony czas generowania LLM (R10) (`context/foundation/infrastructure.md:63`, `:113`, `:121`). W `wrangler.jsonc` włączone jest `observability`, więc nic, co trafia do logów, nie może zawierać wklejonego tekstu (`infrastructure.md:87`).
- Brak deploy joba w CI. Wdrożenie i sekrety ustawia człowiek przez `wrangler`.

## Desired End State

- `POST /api/generate` z sesją i poprawnym tekstem zwraca `200 { proposals: [{ front, back }] }` (0–10 elementów). Każdy błąd zwraca `{ error: { code, message } }` z kodem snake_case i polskim komunikatem.
- `/generate` jest chroniona. Formularz blokuje przycisk w trakcie generowania, przy błędzie zostawia tekst w polu i pokazuje komunikat. Do strony prowadzi link z `/dashboard`.
- `npm run smoke` lokalnie i w CI sprawdza 401 i oba 400. Z `SMOKE_AI_MOCK=1` (w CI) sprawdza też 200 z atrapy i czytelny błąd AI.
- Na produkcji prawdziwe generowanie działa w ≤ 30 s bez błędu 1102.

### Key Discoveries:

- `src/middleware.ts:18`: dopasowanie przez `startsWith`, więc wpis `"/generate"` obejmie też np. `/generated`. Akceptowalne, nie ma takich tras.
- `src/env.d.ts:2-4`: `App.Locals` ma tylko `user`. Endpoint nie potrzebuje klienta Supabase (nic nie zapisuje), więc wystarczy `locals.user`.
- `context/foundation/lessons.md`: endpointy wywołujące AI sprawdzają `locals.user` i zwracają 401 JSON, a nie przekierowanie.
- OpenRouter: `POST {base}/chat/completions`, `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. Model bez wsparcia zwraca błąd. `anthropic/claude-haiku-5.5` jest na liście `supported_parameters=structured_outputs` (stan z 2026-10-20), cena 0,10 $/0,50 $ za 1M tokenów.

## What We're NOT Doing

- Zapis propozycji, akceptacja, edycja i usuwanie propozycji, liczniki FR-012 (to S-03).
- Limit generowań na użytkownika (PRD Non-Goals).
- Streaming odpowiedzi, ponawianie wywołań AI, wybór modelu w UI.
- Wykrywanie języka i tłumaczenie. Model dostaje polecenie, by pisał w języku tekstu.
- Prawdziwe wywołania AI w CI.
- Przerabianie istniejących endpointów auth na format JSON.
- Deploy job w CI.

## Implementation Approach

Najpierw backend z kontraktem błędów, który powtórzą S-03 i S-04, sprawdzany smoke testem bez AI. Potem atrapa OpenRouter, żeby CI testował też ścieżkę sukcesu. Kod produkcyjny zna tylko konfigurowalny `OPENROUTER_BASE_URL`, nic o atrapie. Dalej UI na przetestowanym endpoincie, a na końcu osobno produkcja (sekret i pomiar).

Pracuj na gałęzi `feat/generate-card-proposals` z PR do `main`. CI (lint, `astro check`, build, smoke) musi przejść przed merge.

## Critical Implementation Details

- **Prywatność tekstu:** w endpoincie i serwisie nie logować `text`, promptu ani odpowiedzi modelu. W `catch` logować tylko kod błędu i status HTTP dostawcy. Komunikat błędu zwracany klientowi nie może zawierać fragmentu tekstu.
- **Limit czasu:** wywołanie OpenRouter przerywane `AbortSignal.timeout(30_000)`, co mapuje się na `ai_timeout`. Na Workers czekanie na `fetch` nie zużywa CPU, ale parsowanie tak. Odpowiedź parsować raz (`JSON.parse` + zod), bez dodatkowych przejść.
- **Atrapa a workerd:** `astro preview` uruchamia workerd, który musi mieć dostęp do atrapy na `http://127.0.0.1:<port>`. Jeśli workerd zablokuje adres lokalny, zgłoś to jako blokadę fazy 2. Nie obchodź tego trybem „mock” w kodzie produkcyjnym.

## Phase 1: Endpoint generowania

### Overview

Kontrakt API, serwis OpenRouter i konfiguracja. Po tej fazie endpoint działa (z prawdziwym kluczem w `.dev.vars`), a smoke sprawdza walidację.

### Changes Required:

#### 1. Konfiguracja środowiska

**File**: `astro.config.mjs`, `.env.example`, `src/lib/config-status.ts`

**Intent**: Dodać klucz i adres OpenRouter jako opcjonalne sekrety serwerowe oraz wpis w banerze konfiguracji, żeby brak klucza był widoczny, a nie powodował awarii.

**Contract**: `env.schema` dostaje `OPENROUTER_API_KEY` i `OPENROUTER_BASE_URL` (oba `envField.string({ context: "server", access: "secret", optional: true })`). `.env.example` dostaje oba klucze z pustą wartością i komentarzem, że `OPENROUTER_BASE_URL` jest tylko dla CI/atrapy. `configStatuses` dostaje wpis `{ name: "OpenRouter", configured: Boolean(OPENROUTER_API_KEY), message: "Klucz OpenRouter nie jest skonfigurowany — generowanie fiszek jest wyłączone." }`.

#### 2. Typy współdzielone

**File**: `src/types.ts` (nowy)

**Intent**: Jedno źródło kształtów żądania, odpowiedzi i błędu dla endpointu, serwisu i UI.

**Contract**: `CardProposal { front: string; back: string }`, `GenerateProposalsRequest { text: string }`, `GenerateProposalsResponse { proposals: CardProposal[] }`, `ApiError { error: { code: string; message: string } }`, stałe `MAX_TEXT_LENGTH = 10_000` i `MAX_PROPOSALS = 10` (używane przez endpoint i formularz).

#### 3. Helper odpowiedzi JSON

**File**: `src/lib/api-response.ts` (nowy)

**Intent**: Pierwszy wzorzec odpowiedzi JSON, do powtórzenia w S-03/S-04.

**Contract**: `jsonOk(data, status = 200): Response` i `jsonError(status, code, message): Response`. Oba z `Content-Type: application/json; charset=utf-8`, kształt błędu zgodny z `ApiError`.

#### 4. Serwis generowania

**File**: `src/lib/services/card-generation.ts` (nowy)

**Intent**: Jedyne miejsce, które zna OpenRouter: buduje prompt, wywołuje API z wymuszonym schematem, waliduje wynik i normalizuje listę.

**Contract**: `generateCardProposals(text: string, config: { apiKey: string; baseUrl: string }): Promise<CardProposal[]>`, rzuca `CardGenerationError` z `code: "ai_failed" | "ai_timeout"`. Stała `GENERATION_MODEL = "anthropic/claude-haiku-5.5"`, domyślny `baseUrl` = `https://openrouter.ai/api/v1`. Żądanie: `POST ${baseUrl}/chat/completions`, nagłówek `Authorization: Bearer <apiKey>`, `response_format` typu `json_schema` (`strict: true`) ze schematem `{ proposals: [{ front: string, back: string }] }`. Prompt systemowy: do 10 fiszek, jedna myśl na fiszkę, w języku tekstu wejściowego. Wynik: `choices[0].message.content` → `JSON.parse` → zod. Odrzucić elementy z pustym `front`/`back` po `trim()`, obciąć do `MAX_PROPOSALS`. Odpowiedź HTTP spoza 2xx, niepoprawny JSON i niezgodność ze schematem dają `ai_failed`, a `AbortError`/`TimeoutError` daje `ai_timeout`.

#### 5. Endpoint

**File**: `src/pages/api/generate.ts` (nowy)

**Intent**: Bramka HTTP: sesja, walidacja wejścia, konfiguracja, wywołanie serwisu, mapowanie błędów.

**Contract**: `export const POST: APIRoute`. Kolejność sprawdzeń i odpowiedzi:

| Warunek | Status | `code` | `message` |
|---|---|---|---|
| brak `locals.user` | 401 | `unauthorized` | „Zaloguj się, aby generować fiszki.” |
| ciało nie jest JSON-em lub `text` nie jest stringiem | 400 | `invalid_request` | „Nieprawidłowe żądanie.” |
| `text.trim().length === 0` | 400 | `text_empty` | „Wklej tekst, z którego mają powstać fiszki.” |
| `text.length > MAX_TEXT_LENGTH` | 400 | `text_too_long` | „Tekst może mieć najwyżej 10 000 znaków.” |
| brak `OPENROUTER_API_KEY` | 503 | `ai_not_configured` | „Generowanie fiszek jest chwilowo niedostępne.” |
| `CardGenerationError` `ai_timeout` | 504 | `ai_timeout` | „Generowanie trwało zbyt długo. Spróbuj ponownie.” |
| `CardGenerationError` `ai_failed` lub inny wyjątek | 502 | `ai_failed` | „Nie udało się wygenerować fiszek. Spróbuj ponownie.” |
| sukces | 200 | — | `{ proposals }` (0–10) |

Walidacja wejścia przez zod. Limit liczony jako `String.prototype.length`, tak samo jak w formularzu. Brak sesji sprawdzany jest przed odczytem ciała, więc AI nie zostaje wywołane. W logach tylko `code`.

#### 6. Smoke: walidacja bez AI

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzać w każdym uruchomieniu (także na prawdziwym serwerze) tylko kroki, które nie wołają AI.

**Contract**: Funkcja `request` dostaje opcję `json` (wysyła `Content-Type: application/json`) i zwraca też sparsowane ciało, a asercja potrafi sprawdzić `body.error.code`. Nowe kroki: przed logowaniem `POST /api/generate` z tekstem → 401 `unauthorized`. Po logowaniu: `{ text: "   " }` → 400 `text_empty`, tekst 10 001 znaków → 400 `text_too_long`. Istniejące kroki bez zmian.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke przechodzi lokalnie na `npm run preview` (z lokalnym Supabase), z nowymi krokami 401/400/400: `npm run smoke`

#### Manual Verification:

- Z prawdziwym `OPENROUTER_API_KEY` w `.dev.vars`: `POST /api/generate` z zalogowaną sesją i krótkim artykułem zwraca 200 z 1–10 propozycjami przód/tył
- Bez `OPENROUTER_API_KEY` endpoint zwraca 503 `ai_not_configured`, a baner pokazuje komunikat OpenRouter
- Logi `astro dev` po generowaniu nie zawierają fragmentu wklejonego tekstu

**Implementation Note**: Po fazie i przejściu automatycznych kontroli zatrzymaj się na ręcznym potwierdzeniu.

---

## Phase 2: Atrapa AI w CI

### Overview

Lokalny serwer udający OpenRouter i kroki smoke dla sukcesu i błędu AI, uruchamiane w CI. Atrapa ma być reużywalna w teście E2E „generuj → zapisz” w S-03.

### Changes Required:

#### 1. Serwer-atrapa

**File**: `scripts/mock-openrouter.mjs` (nowy)

**Intent**: Zastąpić OpenRouter w testach stałą, przewidywalną odpowiedzią, bez zależności.

**Contract**: `node:http`, port z `MOCK_OPENROUTER_PORT` (domyślnie `4399`), host `127.0.0.1`. `POST /api/v1/chat/completions`: wymaga nagłówka `Authorization: Bearer <cokolwiek>` (inaczej 401). Jeśli ciało żądania zawiera znacznik `SMOKE_AI_ERROR`, zwraca 500. W przeciwnym razie zwraca odpowiedź w formacie OpenRouter: `{ choices: [{ message: { role: "assistant", content: "<JSON string { proposals: [3 stałe fiszki] }>" } }] }`. `GET /health` → 200. Atrapa nie loguje ciał żądań. Znacznik i oczekiwane fiszki eksportowane jako stałe w nagłówku pliku (komentarz), żeby S-03 mógł ich użyć.

#### 2. Kroki smoke z atrapą

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzić ścieżkę sukcesu i błąd AI tylko wtedy, gdy wiadomo, że aplikacja jest podpięta pod atrapę.

**Contract**: Gdy `SMOKE_AI_MOCK=1`, po logowaniu dochodzą kroki: poprawny tekst → 200, `proposals` to tablica 1–10 elementów, każdy z niepustym `front` i `back`; tekst ze znacznikiem `SMOKE_AI_ERROR` → 502 `ai_failed`. Bez flagi te kroki są pomijane, a skrypt wypisuje `SKIP` z powodem.

#### 3. Job CI

**File**: `.github/workflows/ci.yml` (job `smoke`)

**Intent**: Uruchomić atrapę przed `preview` i skierować na nią aplikację sztucznym kluczem.

**Contract**: Krok „Configure secrets” dopisuje do `.env`/`.dev.vars` `OPENROUTER_API_KEY=ci-mock-key` i `OPENROUTER_BASE_URL=http://127.0.0.1:4399/api/v1`. Przed `npm run preview` w tle startuje `node scripts/mock-openrouter.mjs`, z oczekiwaniem na `/health`. Smoke dostaje `SMOKE_AI_MOCK=1`. Job `ci` bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Lokalnie: atrapa + `npm run preview` z `OPENROUTER_BASE_URL` atrapy + `SMOKE_AI_MOCK=1 npm run smoke` przechodzi z krokami 200 i 502
- Job `smoke` w CI na PR przechodzi z krokami 200 i 502 (widoczne `PASS` w logu)

#### Manual Verification:

- Smoke bez `SMOKE_AI_MOCK` wypisuje `SKIP` dla kroków AI i nie wywołuje OpenRouter

**Implementation Note**: Po fazie i przejściu automatycznych kontroli zatrzymaj się na ręcznym potwierdzeniu.

---

## Phase 3: Ekran /generate

### Overview

Chroniona strona z formularzem React, która korzysta z endpointu z fazy 1.

### Changes Required:

#### 1. Ochrona trasy

**File**: `src/middleware.ts`

**Intent**: Anonimowy użytkownik na `/generate` trafia na logowanie.

**Contract**: `PROTECTED_ROUTES = ["/dashboard", "/generate"]`.

#### 2. Hook generowania

**File**: `src/components/hooks/useGenerateProposals.ts` (nowy)

**Intent**: Logika wywołania endpointu oddzielona od widoku.

**Contract**: `useGenerateProposals(): { proposals: CardProposal[] | null; error: string | null; isLoading: boolean; generate(text: string): Promise<void> }`. `generate` ignoruje wywołanie, gdy `isLoading`. Przy odpowiedzi błędu ustawia `error` na `body.error.message`, a przy błędzie sieci lub niepoprawnym ciele na „Nie udało się połączyć z serwerem. Spróbuj ponownie.”. Nowe wywołanie czyści poprzedni błąd. Nie dotyka tekstu w polu.

#### 3. Formularz

**File**: `src/components/generate/GenerateForm.tsx` (nowy)

**Intent**: Pole tekstu, licznik znaków, przycisk „Generuj”, komunikaty i lista propozycji.

**Contract**: Domyślny eksport, bez propsów. Stan tekstu lokalny (nie jest czyszczony po błędzie ani po sukcesie). Walidacja po stronie klienta przed wywołaniem: pusty tekst (po `trim`) daje komunikat „Wklej tekst, z którego mają powstać fiszki.” bez wywołania. Przy długości > `MAX_TEXT_LENGTH` licznik jest wyróżniony, pokazuje się komunikat limitu, a wywołania nie ma. Przycisk `disabled` w trakcie (`isLoading`) z etykietą „Generowanie…”. Wynik: lista kart przód/tył. Przy 0 propozycji komunikat „AI nie znalazło w tym tekście materiału na fiszki.”. Komponenty: `Button` z `src/components/ui/button.tsx`, klasy przez `cn()`.

#### 4. Strona i link

**File**: `src/pages/generate.astro` (nowy), `src/pages/dashboard.astro`

**Intent**: Osadzić formularz w layoucie i dać do niego drogę z dashboardu.

**Contract**: `generate.astro` używa `Layout` (`title="Generuj fiszki"`) i `<GenerateForm client:load />`, styl zgodny z `dashboard.astro` (`bg-cosmic`). `dashboard.astro` dostaje link „Generuj fiszki” do `/generate` nad formularzem wylogowania.

#### 5. Smoke: ochrona strony

**File**: `scripts/smoke.mjs`

**Intent**: Regresja ochrony nowej strony.

**Contract**: Krok anonimowy `GET /generate` → 302 `/auth/signin` i krok po zalogowaniu `GET /generate` → 200.

### Success Criteria:

#### Automated Verification:

- Typy przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke z atrapą przechodzi z krokami `/generate` 302/200: `SMOKE_AI_MOCK=1 npm run smoke`

#### Manual Verification:

- Pusty tekst: komunikat bez wywołania sieci (zakładka Network)
- Tekst > 10 000 znaków: komunikat i tekst zostaje w polu
- W trakcie generowania przycisk jest nieaktywny i nie da się wysłać drugiego żądania
- Błąd AI (tekst ze znacznikiem `SMOKE_AI_ERROR` przy atrapie): czytelny komunikat, tekst zostaje w polu
- Z prawdziwym kluczem: propozycje przód/tył pojawiają się na liście
- Link z `/dashboard` prowadzi do `/generate`; po wylogowaniu `/generate` przekierowuje na logowanie

**Implementation Note**: Po fazie i przejściu automatycznych kontroli zatrzymaj się na ręcznym potwierdzeniu.

---

## Phase 4: Produkcja

### Overview

Klucz OpenRouter jako sekret na Cloudflare, wdrożenie i pomiar prawdziwego generowania (R2, R10). Fazę wykonuje człowiek, agent przygotowuje polecenia i interpretuje wyniki.

### Changes Required:

#### 1. Sekret i wdrożenie

**File**: brak zmian w kodzie (operacja na Cloudflare). Wynik zapisany w `context/deployment/deploy-plan.md`, sekcja stanu.

**Intent**: Włączyć generowanie na produkcji i zamknąć ryzyka R2/R10 pomiarem.

**Contract**: `npx wrangler secret put OPENROUTER_API_KEY` (człowiek wpisuje wartość). `OPENROUTER_BASE_URL` **nie** jest ustawiany na produkcji. Wdrożenie z `main` po merge, tą samą procedurą co F-01. Kształt klucza sprawdzony bez wypisywania (reguła z `lessons.md` o sekretach: `secret list` nie dowodzi wartości, dowodem jest działające żądanie). Po teście w `deploy-plan.md` dopisać datę, zmierzony czas generowania i to, czy wystąpił błąd 1102.

### Success Criteria:

#### Automated Verification:

- `npx wrangler secret list` pokazuje `OPENROUTER_API_KEY`
- Smoke na produkcji bez flagi AI przechodzi: `BASE_URL=<prod-url> npm run smoke`

#### Manual Verification:

- Na produkcji tekst ~10 000 znaków daje propozycje w ≤ 30 s
- `npx wrangler tail --status error` podczas 3 generowań nie pokazuje błędu 1102
- `wrangler tail` nie pokazuje wklejonego tekstu
- Wynik pomiaru R2/R10 dopisany do `context/deployment/deploy-plan.md`

**Implementation Note**: Po fazie zatrzymaj się na ręcznym potwierdzeniu.

---

## Testing Strategy

### Unit Tests:

- Brak runnera testów jednostkowych w projekcie (CLAUDE.md). Normalizację wyniku (puste pola, > 10 propozycji) pokrywa atrapa w smoke oraz przegląd kodu.

### Integration Tests:

- `scripts/smoke.mjs`: 401 bez sesji, 400 `text_empty`, 400 `text_too_long`, ochrona `/generate`. Z `SMOKE_AI_MOCK=1` dodatkowo 200 z propozycjami i 502 `ai_failed`.

### Manual Testing Steps:

1. Zaloguj się, przejdź z dashboardu do `/generate`.
2. Kliknij „Generuj” przy pustym polu: komunikat, brak żądania.
3. Wklej artykuł, kliknij „Generuj”: przycisk nieaktywny, potem lista przód/tył.
4. Wklej 10 001 znaków: komunikat, tekst zostaje.
5. Z atrapą wklej tekst ze `SMOKE_AI_ERROR`: komunikat błędu, tekst zostaje.

## Performance Considerations

- Cel 30 s (PRD NFR) pilnuje timeout 30 s po stronie serwera. Pomiar na produkcji w fazie 4.
- Limit 10 ms CPU (Free): jedno `JSON.parse` + zod na małej odpowiedzi. Przy błędach 1102 decyzja z `infrastructure.md` to plan Paid (5 $/mies.).
- Koszt: < 0,001 $ za generowanie przy cenach z 2026-10-20.

## Migration Notes

Brak zmian w bazie. Wycofanie: `wrangler rollback`. Sekret można zostawić, bez kodu jest nieużywany.

## References

- PRD: `context/foundation/prd.md` (US-01, FR-002, FR-003, FR-011, NFR prywatności i 30 s)
- Roadmapa: `context/foundation/roadmap.md` (S-02)
- Ryzyka: `context/foundation/infrastructure.md:63`, `:87`, `:113`, `:121`; `context/deployment/deploy-plan.md` (R10)
- Reguły: `context/foundation/lessons.md` (401 dla endpointów AI, sekrety)
- Konwencje web/API (research innego change'a, ta sama baza kodu): `context/changes/srs-review-session/research.md`
- OpenRouter structured outputs: https://openrouter.ai/docs/features/structured-outputs

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Endpoint generowania

#### Automated

- [x] 1.1 Typy przechodzą: `npx astro check` — 2ae0721
- [x] 1.2 Lint przechodzi: `npm run lint` — 2ae0721
- [x] 1.3 Build przechodzi: `npm run build` — 2ae0721
- [x] 1.4 Smoke przechodzi lokalnie na `npm run preview` (z lokalnym Supabase), z nowymi krokami 401/400/400: `npm run smoke` — 2ae0721

#### Manual

- [x] 1.5 Z prawdziwym `OPENROUTER_API_KEY` w `.dev.vars`: `POST /api/generate` z zalogowaną sesją i krótkim artykułem zwraca 200 z 1–10 propozycjami przód/tył — 2ae0721
- [x] 1.6 Bez `OPENROUTER_API_KEY` endpoint zwraca 503 `ai_not_configured`, a baner pokazuje komunikat OpenRouter — 2ae0721
- [x] 1.7 Logi `astro dev` po generowaniu nie zawierają fragmentu wklejonego tekstu — 2ae0721

### Phase 2: Atrapa AI w CI

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — ab7a812
- [x] 2.2 Lokalnie: atrapa + `npm run preview` z `OPENROUTER_BASE_URL` atrapy + `SMOKE_AI_MOCK=1 npm run smoke` przechodzi z krokami 200 i 502 — ab7a812
- [x] 2.3 Job `smoke` w CI na PR przechodzi z krokami 200 i 502 (widoczne `PASS` w logu) — ab7a812

#### Manual

- [x] 2.4 Smoke bez `SMOKE_AI_MOCK` wypisuje `SKIP` dla kroków AI i nie wywołuje OpenRouter — ab7a812

### Phase 3: Ekran /generate

#### Automated

- [ ] 3.1 Typy przechodzą: `npx astro check`
- [ ] 3.2 Lint przechodzi: `npm run lint`
- [ ] 3.3 Build przechodzi: `npm run build`
- [ ] 3.4 Smoke z atrapą przechodzi z krokami `/generate` 302/200: `SMOKE_AI_MOCK=1 npm run smoke`

#### Manual

- [ ] 3.5 Pusty tekst: komunikat bez wywołania sieci (zakładka Network)
- [ ] 3.6 Tekst > 10 000 znaków: komunikat i tekst zostaje w polu
- [ ] 3.7 W trakcie generowania przycisk jest nieaktywny i nie da się wysłać drugiego żądania
- [ ] 3.8 Błąd AI (tekst ze znacznikiem `SMOKE_AI_ERROR` przy atrapie): czytelny komunikat, tekst zostaje w polu
- [ ] 3.9 Z prawdziwym kluczem: propozycje przód/tył pojawiają się na liście
- [ ] 3.10 Link z `/dashboard` prowadzi do `/generate`; po wylogowaniu `/generate` przekierowuje na logowanie

### Phase 4: Produkcja

#### Automated

- [ ] 4.1 `npx wrangler secret list` pokazuje `OPENROUTER_API_KEY`
- [ ] 4.2 Smoke na produkcji bez flagi AI przechodzi: `BASE_URL=<prod-url> npm run smoke`

#### Manual

- [ ] 4.3 Na produkcji tekst ~10 000 znaków daje propozycje w ≤ 30 s
- [ ] 4.4 `npx wrangler tail --status error` podczas 3 generowań nie pokazuje błędu 1102
- [ ] 4.5 `wrangler tail` nie pokazuje wklejonego tekstu
- [ ] 4.6 Wynik pomiaru R2/R10 dopisany do `context/deployment/deploy-plan.md`
