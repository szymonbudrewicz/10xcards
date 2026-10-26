# Awaria Supabase widoczna w logach i jako 503 — Plan Brief

> Full plan: `context/changes/auth-outage-visible/plan.md`
> Audyt (zamiast research): `context/audits/observability/2026-10-26_generowanie.md` (G1)

## What & Why

Gdy Supabase nie odpowiada, middleware wyrzuca błąd z `getUser()`, więc każdy zalogowany użytkownik wygląda na wylogowanego: strony przekierowują na logowanie, a API odpowiada 401 „Zaloguj się”. W logach nie zostaje nic. To połknięty błąd (OWASP A10:2025) i krytyczne ustalenie audytu.

## Starting Point

`src/middleware.ts:16-18` czyta tylko `data.user`. SDK Supabase przy awarii sieci/5xx nie rzuca, tylko zwraca `{ user: null, error: AuthRetryableFetchError }` (potwierdzone sondą). Middleware nie ma testów.

## Desired End State

Awaria Supabase zostawia jeden wiersz `console.error` (nazwa, status, kod błędu). Chronione strony pokazują 503 „Logowanie jest chwilowo niedostępne…”, a `POST /api/generate` zwraca 503 `auth_unavailable` bez wołania AI. Zwykły gość działa jak dziś.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Odpowiedź API przy awarii | 503 `auth_unavailable` | Kod już istnieje w `auth-errors.ts`; 401 kłamie, że brak sesji | Research (audyt) / change.md |
| Chronione strony przy awarii | Prosta strona 503 zamiast redirectu | CLAUDE.md: żadnych awarii zamienianych w przekierowania | Plan |
| Co jest awarią | `AuthRetryableFetchError` lub status ≥ 500 | Stare ciasteczko (4xx) nie może blokować użytkownika 503 | Plan |
| Inne błędy 4xx | Gość + `console.warn` | Zły klucz i stare ciasteczka zostawiają ślad bez blokady | Plan |
| Brak sesji | Gość, bez logu | Najczęstszy przypadek — log byłby szumem | Plan |
| Treść logu | Tylko `name`, `status`, `code` | Prywatność: bez `message`, emaila, ciasteczek | Research (audyt) |
| Kolejność | Test czerwony → poprawka | Zasada lekcji M3L5 / CLAUDE.md | change.md |

## Scope

**In scope:** klasyfikacja błędu `getUser()` (`src/lib/auth-session.ts`), middleware, flaga `locals.authUnavailable`, 503 w `/api/generate`, testy middleware i endpointu, raport `--verify`.

**Out of scope:** signin/signup przy awarii, ustalenia G2–G8, Sentry i alerty, ponawianie, ładna strona 503.

## Architecture / Approach

`getUser()` → `classifyGetUserError()` → `ok | signed_out | rejected | unavailable`. Middleware loguje (`error` dla `unavailable`, `warn` dla `rejected`), ustawia `locals.user` i `locals.authUnavailable`; dla `PROTECTED_ROUTES` przy `unavailable` zwraca 503. Endpoint sprawdza flagę przed sesją.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Test regresji → poprawka (TDD) | Czerwony, potem zielony test G1; poprawka w middleware i API | Mock kontekstu middleware niezgodny z prawdziwym Astro |
| 2. Potwierdzenie | Raport `--verify` (G1 fixed) + ręczna próba z zatrzymanym lokalnym Supabase | Ręczna próba wymaga Dockera i `.dev.vars.e2e` |

**Prerequisites:** `npm test` zielony na `main`; do Fazy 2 ręcznej — Docker + lokalny Supabase.
**Estimated effort:** ~1 sesja.

## Open Risks & Assumptions

- Zakładamy, że `@supabase/ssr` przekazuje błędy `auth-js` bez zmian (potwierdzone sondą na `createServerClient`).
- Zły `SUPABASE_KEY` dalej wygląda dla użytkownika jak wylogowanie — widoczny tylko jako `warn` w logach (świadoma decyzja).

## Success Criteria (Summary)

- Zatrzymany Supabase → użytkownik widzi „Logowanie chwilowo niedostępne”, a nie formularz logowania; w logu jest przyczyna.
- Test regresji zostaje w `npm test` i w CI.
- Raport weryfikacyjny oznacza G1 jako `fixed`.
