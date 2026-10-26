# Awaria Supabase widoczna w logach i jako 503 — plan implementacji

## Overview

Middleware połyka błąd z `supabase.auth.getUser()`, więc awaria Supabase (sieć, 5xx) wygląda dla użytkownika jak wylogowanie, a w logach nie zostaje nic. Zmiana rozróżnia „brak sesji” od „usługa logowania nie działa”: awaria jest logowana (bez PII), chronione strony zwracają 503 zamiast przekierowania, a `POST /api/generate` zwraca 503 `auth_unavailable` zamiast 401. Źródło: audyt `context/audits/observability/2026-10-26_generowanie.md`, ustalenie G1 (critical).

## Current State Analysis

- `src/middleware.ts:16-18` destrukturyzuje tylko `data.user`, `error` jest wyrzucany; `user ?? null` zamienia każdą awarię w gościa.
- `@supabase/auth-js` (`GoTrueClient._getUser`) nie rzuca przy awarii — zwraca `{ data: { user: null }, error }`. Sieć/5xx → `AuthRetryableFetchError` (status 0 lub 5xx); brak ciasteczka → `AuthSessionMissingError`; stare/odrzucone ciasteczko → `AuthApiError` 4xx. Potwierdzone sondą (audyt §8).
- Skutki: `/generate` i `/dashboard` → 302 na `/auth/signin` (`src/middleware.ts:30-34`); `POST /api/generate` → 401 `unauthorized` (`src/pages/api/generate.ts:15-17`). Zero wierszy logu.
- Jedynym odbiorcą `locals.user` w kodzie jest `src/pages/api/generate.ts:15`; typ `App.Locals` w `src/env.d.ts`.
- Middleware nie ma testów. Testy endpointów wywołują handler bezpośrednio z fałszywym kontekstem (`tests/helpers/api-context.ts`); `vitest.config.ts` aliasuje moduły wirtualne Astro na zaślepki w `tests/stubs/`.

## Desired End State

- Supabase nieosiągalny lub 5xx: jeden `console.error` z `{ name, status, code }` błędu; chroniona strona → 503 z polskim komunikatem; `POST /api/generate` → 503 `{ error: { code: "auth_unavailable", message } }` i AI nie jest wywoływane.
- Brak sesji: bez zmian (gość, 302 na signin, API 401), bez logu.
- Inny błąd auth (4xx, np. stare ciasteczko lub zły klucz): zachowanie gościa jak dziś + jeden `console.warn` z `{ name, status, code }`.
- Test regresji w `tests/` był czerwony na obecnym kodzie i jest zielony po poprawce.

### Key Discoveries:

- Kod `auth_unavailable` i komunikat „Logowanie jest chwilowo niedostępne.” już istnieją (`src/lib/auth-errors.ts:7`) — używamy tej samej nazwy.
- `@supabase/supabase-js` re-eksportuje `isAuthError`, `isAuthRetryableFetchError`, `isAuthSessionMissingError` (`export * from "@supabase/auth-js"`) — klasyfikacja na oficjalnych predykatach SDK, a test może tworzyć prawdziwe instancje błędów.
- Prywatność (CLAUDE.md, NFR): logujemy wyłącznie `name`, `status`, `code` — nigdy `message`, emaila, ciasteczek ani tokenów.

## What We're NOT Doing

- Obsługa awarii w `src/pages/api/auth/signin.ts` / `signup.ts` (błąd sieci → ogólny komunikat, bez logu) — przepływ auth nie był audytowany; kandydat na kolejny audyt.
- Pozostałe ustalenia audytu (G2–G8: przyczyna błędów AI, 503 bez klucza, pusta lista).
- Przypadek `createClient()` → `null` (brak env) — to zaprojektowany stan z banerem (`src/lib/config-status.ts`), bez zmian.
- Tracker błędów (Sentry) i alerty.
- Ponawianie żądań do Supabase.
- Strona 503 w layoucie aplikacji — wystarczy prosta odpowiedź tekstowa.

## Implementation Approach

Mała czysta funkcja klasyfikuje wynik `getUser()` na cztery stany; middleware na jej podstawie loguje, ustawia `locals.user` i nową flagę `locals.authUnavailable`, a dla chronionych stron przy awarii zwraca 503 zamiast przekierowania. Endpoint sprawdza flagę przed sprawdzeniem sesji. TDD: najpierw testy (czerwone), potem kod.

## Faza 1: Test regresji → poprawka (TDD)

### Overview

Napisać testy odtwarzające G1, zobaczyć je czerwone na niezmienionym kodzie, potem wprowadzić klasyfikację, flagę i odpowiedzi 503.

### Changes Required:

#### 1. Zaślepka `astro:middleware` dla Vitest

**File**: `tests/stubs/astro-middleware.ts`, `vitest.config.ts`

**Intent**: Umożliwić import `src/middleware.ts` w teście bez runtime'u Astro.

**Contract**: zaślepka eksportuje `defineMiddleware` jako funkcję tożsamościową; nowy alias `"astro:middleware"` w `resolve.alias` obok istniejącego `astro:env/server`.

#### 2. Test middleware (nowy)

**File**: `tests/middleware/auth-outage.test.ts`

**Intent**: Reprodukcja G1 i zabezpieczenie zachowania gościa. Mock `@/lib/supabase` (`createClient` zwraca obiekt z `auth.getUser` podającym zadany wynik), fałszywy kontekst (`url`, `request`, `cookies`, `locals: {}`, `redirect` zwracające 302 z `Location`), `next` jako spy, `console.error`/`console.warn` jako spy. Wyrocznia: change.md, decyzje planu i audyt G1 — nie implementacja.

**Contract**: przypadki:
- `AuthRetryableFetchError` (status 0) na `/generate` → 503, `next` nie wywołane, jeden `console.error`, którego argumenty zawierają `"AuthRetryableFetchError"` i nie zawierają emaila ani wartości ciasteczka.
- `AuthApiError` ze statusem 500 na `/dashboard` → 503.
- `AuthRetryableFetchError` na `/api/generate` → `next` wywołane, `locals.authUnavailable === true`, `locals.user === null`.
- `AuthSessionMissingError` na `/generate` → 302 na `/auth/signin`, brak `console.error` i `console.warn`.
- `AuthApiError` 403 (stare ciasteczko) na `/generate` → 302 na `/auth/signin`, jeden `console.warn`, brak `console.error`.
- poprawny użytkownik na `/generate` → `next` wywołane, `locals.authUnavailable === false`.

#### 3. Test endpointu

**File**: `tests/api/generate.test.ts`, `tests/helpers/api-context.ts`

**Intent**: Endpoint przy awarii auth zwraca 503 `auth_unavailable` i nie woła AI; istniejący test 401 zostaje bez zmian.

**Contract**: `apiContext` przyjmuje opcjonalne `authUnavailable?: boolean` (domyślnie `false`) i wkłada je do `locals`. Nowy przypadek: `user: null, authUnavailable: true` → status 503, `error.code === "auth_unavailable"`, niepusty komunikat, `fetch` nie wywołany.

#### 4. Klasyfikacja błędu `getUser()` (nowa)

**File**: `src/lib/auth-session.ts`

**Intent**: Jedno miejsce, które decyduje, czy błąd to awaria, czy zwykły brak sesji.

**Contract**: `classifyGetUserError(error: unknown): "ok" | "signed_out" | "rejected" | "unavailable"` — `null`/`undefined` → `ok`; `isAuthSessionMissingError` → `signed_out`; `isAuthRetryableFetchError` lub `isAuthError` ze `status >= 500` → `unavailable`; każdy inny błąd → `rejected`. Importy z `@supabase/supabase-js`.

#### 5. Middleware

**File**: `src/middleware.ts`

**Intent**: Odbierać `error`, klasyfikować, logować i nie zamieniać awarii w przekierowanie.

**Contract**:
- `unavailable` → `console.error("auth: getUser failed", { name, status, code })`; `locals.user = null`, `locals.authUnavailable = true`; dla ścieżek z `PROTECTED_ROUTES` zwraca `503` z `Content-Type: text/plain; charset=utf-8` i treścią „Logowanie jest chwilowo niedostępne. Spróbuj ponownie za chwilę.” zamiast `redirect`.
- `rejected` → `console.warn("auth: getUser rejected", { name, status, code })`; dalej jak gość.
- `signed_out`/`ok` → bez logu, jak dziś.
- Gałąź `createClient() === null` ustawia `authUnavailable = false`.

#### 6. Typ `Locals` i endpoint

**File**: `src/env.d.ts`, `src/pages/api/generate.ts`

**Intent**: Endpoint rozróżnia awarię auth od braku sesji.

**Contract**: `App.Locals` dostaje `authUnavailable: boolean`. W `POST` przed sprawdzeniem `locals.user`: gdy `authUnavailable` → `jsonError(503, "auth_unavailable", "Logowanie jest chwilowo niedostępne. Spróbuj ponownie za chwilę.")`.

### Success Criteria:

#### Automated Verification:

- Nowe testy z punktów 2–3 są czerwone na niezmienionym kodzie (przypadki awarii i `rejected`), wynik zapisany w notatce fazy
- `npm test` przechodzi w całości (nowe testy zielone, stare bez zmian)
- `npx astro check` bez błędów
- `npm run lint` bez błędów

#### Manual Verification:

- Przegląd diffu: logi zawierają tylko `name`/`status`/`code`, bez `message`, emaila i ciasteczek

**Implementation Note**: Po zielonych bramkach zatrzymaj się na ręcznym potwierdzeniu przed Fazą 2.

**Notatka z wykonania (RED, 2026-10-26, kod `f4da533`):** `npx vitest run tests/middleware/auth-outage.test.ts tests/api/generate.test.ts` → 6 failed | 21 passed. Powody: `expected 302 to be 503` (strona przy awarii i przy 5xx — przekierowanie na signin), `expected 401 to be 503` (API), `expected undefined to be true/false` (brak flagi `authUnavailable`), `expected "warn" to be called 1 times, but got 0` (odrzucona sesja). Przypadek „brak sesji → 302, bez logu” przechodził już przed poprawką (zachowanie utrzymywane). Po poprawce: 27 passed.

---

## Faza 2: Potwierdzenie

### Overview

Udowodnić, że G1 jest zamknięte: ponowny audyt w trybie weryfikacji i ręczna próba na lokalnym Supabase.

### Changes Required:

#### 1. Raport weryfikacyjny

**File**: `context/audits/observability/2026-10-26_verify-generowanie.md` (tworzy skill)

**Intent**: `/10x-observability-audit --verify context/audits/observability/2026-10-26_generowanie.md` oznacza G1 jako `fixed` z dowodem; pozostałe ustalenia `still open`.

**Contract**: nowy plik raportu, poprzedni raport nietknięty.

### Success Criteria:

#### Automated Verification:

- Raport weryfikacyjny istnieje i oznacza G1 jako `fixed`

#### Manual Verification:

- Lokalnie (`npx supabase start -x ...` + `.dev.vars.e2e`, nigdy produkcyjne `.dev.vars`): zalogowany użytkownik, potem `npx supabase stop` → odświeżenie `/generate` pokazuje 503 „Logowanie jest chwilowo niedostępne…”, a terminal dev servera pokazuje wiersz `auth: getUser failed` z `AuthRetryableFetchError`

---

## Testing Strategy

### Unit Tests:

- Middleware: sześć przypadków z Fazy 1, punkt 2 (awaria na stronie, 5xx, awaria na API, brak sesji, odrzucone ciasteczko, poprawny użytkownik).
- Endpoint: 503 `auth_unavailable` bez wywołania AI; istniejący 401 bez zmian.

### Manual Testing Steps:

1. Uruchom lokalny Supabase i dev server na `.dev.vars.e2e`, zaloguj się.
2. Zatrzymaj Supabase, odśwież `/generate` → 503 z komunikatem, wiersz `auth: getUser failed` w terminalu.
3. Uruchom Supabase ponownie → `/generate` działa jak wcześniej.

## References

- Audyt: `context/audits/observability/2026-10-26_generowanie.md` (G1)
- Sonda SDK: audyt §8
- Wzorzec testów endpointu: `tests/api/generate.test.ts`, `tests/helpers/api-context.ts`
- Istniejący kod błędu: `src/lib/auth-errors.ts:7`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test regresji → poprawka (TDD)

#### Automated

- [x] 1.1 Nowe testy z punktów 2–3 są czerwone na niezmienionym kodzie (przypadki awarii i `rejected`), wynik zapisany w notatce fazy
- [x] 1.2 `npm test` przechodzi w całości (nowe testy zielone, stare bez zmian)
- [x] 1.3 `npx astro check` bez błędów
- [x] 1.4 `npm run lint` bez błędów

#### Manual

- [x] 1.5 Przegląd diffu: logi zawierają tylko `name`/`status`/`code`, bez `message`, emaila i ciasteczek

### Phase 2: Potwierdzenie

#### Automated

- [ ] 2.1 Raport weryfikacyjny istnieje i oznacza G1 jako `fixed`

#### Manual

- [ ] 2.2 Lokalnie: po `npx supabase stop` odświeżenie `/generate` daje 503 z komunikatem, a terminal pokazuje `auth: getUser failed`
