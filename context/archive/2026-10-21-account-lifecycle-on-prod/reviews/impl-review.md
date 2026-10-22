<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Rejestracja, logowanie i wylogowanie na produkcji (S-01)

- **Plan**: context/changes/account-lifecycle-on-prod/plan.md
- **Scope**: Full plan (completed phases only)
- **Reviewed phases**: 1
- **Date**: 2026-10-22
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Evidence: diff `main..a64a900` touches exactly the five planned source files plus the change folder; `scripts/smoke.mjs` has one hunk (`@@ -7 +7 @@`); `context/foundation/roadmap.md` untouched. PR #8 CI run 39771512266 on `a64a900`: `ci` success (lint, lint:ui, astro check, build), `smoke` success (9/9 account steps + 15 isolation steps). Manual 1.6 confirmed by the coordinator. Reflected free text on `/auth/signup?error=` is gone (code-only URL, generic fallback), which follows the `signInErrorMessage` pattern in `src/lib/auth-errors.ts`.

## Findings

### F1 — Kolejność „Confirm email” → deploy nie jest wymuszona w planie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/account-lifecycle-on-prod/plan.md (Critical Implementation Details, „Kolejność w fazie 3”)
- **Detail**: `src/pages/auth/confirm-email.astro` mówi teraz bezwarunkowo „Twoje konto jest gotowe. Możesz się teraz zalogować”. To prawda dopiero po wyłączeniu „Confirm email” na produkcji. Plan wymaga wyłączenia tylko „przed smoke”, więc deploy przed zmianą w dashboardzie pokazałby nowym użytkownikom nieprawdziwy komunikat, a logowanie zwróciłoby `email_not_confirmed`.
- **Fix**: W „Kolejność w fazie 3” zapisać: „Confirm email” wyłączone przed `wrangler deploy` (krok 3.3 przed 3.4).
- **Decision**: FIXED (Fix now — wymóg kolejności dopisany w plan.md, Critical Implementation Details)

### F2 — Komunikat `weak_password` zakłada 6 znaków

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth-errors.ts:20
- **Detail**: „Użyj co najmniej 6 znaków” odpowiada `minimum_password_length = 6` lokalnie i `MIN_PASSWORD_LENGTH` w `SignUpForm.tsx`, ale hostowany Supabase może mieć inną minimalną długość lub wymagania znaków; `weak_password` obejmuje oba przypadki.
- **Fix**: Zostawić, jeśli hostowany projekt ma domyślne 6 znaków bez wymagań znaków; w przeciwnym razie zmienić na „Hasło nie spełnia wymagań bezpieczeństwa.”
- **Decision**: SKIPPED

### F3 — `SMOKE_EMAIL` bez `{ts}` daje mylący FAIL przy drugim przebiegu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:7
- **Detail**: Bez `{ts}` każdy przebieg rejestruje ten sam adres; drugi kończy się `302 /auth/signup?error=user_already_exists` i FAIL kroku „signup creates account”. Ograniczenie „tylko linia 7” wyklucza walidację lub komentarz w pliku; plan opisuje to w Critical Implementation Details.
- **Fix**: Bez zmian w kodzie; w fazie 3 podawać adres z `{ts}` (np. `adres+{ts}@gmail.com`), a w zapisie dowodu w `deploy-plan.md` przytoczyć ten format.
- **Decision**: SKIPPED
