---
type: observability-audit
date: 2026-10-26 21:41
mode: verify
commit: e0037a2
branch: chore/m3l5-observability-debugging
dirty_tree: true
areas: [generowanie]
area_source: arguments
runtime_proof: observed
error_tracker: none (console.* → Cloudflare Workers Logs)
previous_report: context/audits/observability/2026-10-26_generowanie.md
findings: { critical: 0, high: 2, medium: 3, low: 2 }
---

# Weryfikacja audytu obserwowalności — generowanie (2026-10-26)

Ponowne sprawdzenie raportu `2026-10-26_generowanie.md` (commit `f4da533`) po zmianie `auth-outage-visible` (commit `e0037a2`). Zmodyfikowane drzewo: niezacommitowane są tylko pliki narzędzi kursu i raporty audytu, kod aplikacji = `e0037a2`.

## 1. TL;DR

- **G1 (critical) → fixed.** Awaria Supabase nie wygląda już jak wylogowanie. Middleware loguje `auth: getUser failed { name, status, code }`, chronione strony dostają 503, a `POST /api/generate` zwraca 503 `auth_unavailable`. Dowód: test regresji był czerwony na `f4da533`, a na `e0037a2` jest zielony.
- G2–G8 → still open (kod bez zmian, zgodnie z zakresem zmiany).
- Pierwsza z trzech przyczyn źródłowych („wynik błędu z SDK traktowany jak brak danych”) jest zamknięta. Pozostają: tłumaczenie błędów bez oryginału (G3–G5) i łagodne gałęzie bez sygnału (G2, G6, G7).

## 3. Przed / po (G1)

| Postać awarii | Przed (`f4da533`) | Po (`e0037a2`) |
| --- | --- | --- |
| `AuthRetryableFetchError` na `/generate` | 302 → `/auth/signin`, log: nic | 503 „Logowanie jest chwilowo niedostępne…”, `console.error` z `AuthRetryableFetchError` |
| `AuthApiError` 500 na `/dashboard` | 302, log: nic | 503, `console.error` |
| Awaria → `POST /api/generate` | 401 `unauthorized` | 503 `auth_unavailable`, AI nie wywołane |
| `AuthApiError` 403 (stara sesja) | 302, log: nic | 302, `console.warn` z `bad_jwt` |
| `AuthSessionMissingError` (gość) | 302, log: nic | 302, log: nic (bez zmian) |

Źródło: `npx vitest run tests/middleware/auth-outage.test.ts tests/api/generate.test.ts`. Przed: 6 failed | 21 passed. Po: 27 passed. Wyniki zapisane w notatce Fazy 1 `context/changes/auth-outage-visible/plan.md`.

## 7. Zmiany od ostatniego audytu

| Previous id | Status | Evidence |
| --- | --- | --- |
| G1 | **fixed** | `src/middleware.ts:17-34` odbiera `error` i klasyfikuje go (`src/lib/auth-session.ts` `classifyGetUserError`): `unavailable` → `console.error` + `locals.authUnavailable`. `src/middleware.ts:43-48` zwraca 503 zamiast `redirect`. `src/pages/api/generate.ts:17-19` zwraca 503 `auth_unavailable`. Log zawiera tylko `name`/`status`/`code` (`authErrorLogFields`), a test sprawdza, że wartość ciasteczka nie trafia do logu. |
| G2 | still open | `src/pages/api/generate.ts:49-51`: 503 `ai_not_configured` bez logu. |
| G3 | still open | `src/pages/api/generate.ts:61-65`: obcy wyjątek logowany jako `{ code: "ai_failed" }` bez nazwy i stacka. |
| G4 | still open | `src/lib/services/card-generation.ts:107-110` bez zmian (brak `cause`). |
| G5 | still open | `src/lib/services/card-generation.ts:113-127` bez zmian. |
| G6 | still open | `src/lib/services/card-generation.ts:129-132` bez zmian. |
| G7 | still open | `src/components/hooks/useGenerateProposals.ts:42,51` bez zmian. |
| G8 | still open | `src/pages/api/generate.ts:65`: bez `userId`. |

## 8. Metoda i ograniczenia

- Wszystkie cytowane miejsca przeczytane ponownie. `git diff f4da533 -- src/lib/services src/components` jest pusty.
- Dowód G1 (test): test regresji w Vitest z prawdziwymi klasami błędów z `@supabase/supabase-js`, w którym Supabase jest zamockowany na granicy `createClient`.
- Dowód G1 (runtime, Workers): build `CLOUDFLARE_ENV=e2e` + `astro preview` (port 4399, lokalny Supabase, nigdy produkcja). Po zalogowaniu kontem E2E `/generate` zwróciło 200. Po `docker stop supabase_auth_10x-astro-starter`: `GET /generate` → 503 „Logowanie jest chwilowo niedostępne…” (bez `Location`), `POST /api/generate` → 503 `{"error":{"code":"auth_unavailable",…}}`, a w logu serwera pojawił się wiersz `auth: getUser failed { name: 'AuthRetryableFetchError', status: 503, code: undefined }`, bez emaila i ciasteczek. Po `docker start` `/generate` znów zwraca 200.
- Ograniczenie, które zostaje (świadoma decyzja planu): zły `SUPABASE_KEY` (401) dla użytkownika nadal wygląda jak wylogowanie i jest widoczny tylko jako `console.warn`.
- Nadal poza zakresem: obsługa awarii w `src/pages/api/auth/signin.ts` / `signup.ts` (przepływ auth nie był audytowany).
