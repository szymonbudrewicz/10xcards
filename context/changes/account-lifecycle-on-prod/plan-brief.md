# Rejestracja, logowanie i wylogowanie na produkcji (S-01) — Plan Brief

> Full plan: `context/changes/account-lifecycle-on-prod/plan.md`

## What & Why

Udowadniamy, że na publicznym adresie `https://10xcards.szymon-10x.workers.dev` nowy użytkownik może się zarejestrować, zalogować i wylogować (S-01: FR-008, FR-001, FR-009). Przepływ jest w kodzie, ale na produkcji nikt go nie sprawdził, bo smoke używa adresów `example.com`, które hostowany Supabase odrzuca. To jeden z dwóch równoległych pasów lekcji M2L6 (drugi: `generate-card-proposals`).

## Starting Point

Endpointy auth, middleware i 9-krokowy `scripts/smoke.mjs` już działają lokalnie i w CI. Decyzja z 2026-10-18 wykluczała konta testowe na produkcji; rejestracja zwraca surowe angielskie błędy, a strona po rejestracji poza DEV każe sprawdzić maila.

## Desired End State

Smoke z prawdziwym adresem przechodzi 9× PASS na produkcji, potwierdzanie maila jest wyłączone zgodnie z PRD, rejestracja pokazuje prawdziwe i polskie komunikaty, a dowód jest zapisany w dokumentach wdrożenia. Zmiana weszła do `main` osobnym PR po zielonym CI i Solo Code Review.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Sposób weryfikacji | Smoke na produkcji z `SMOKE_EMAIL` + jeden ręczny test w przeglądarce | Powtarzalny, zapisany dowód na publicznym URL; zastępuje decyzję z 2026-10-18 | Plan |
| Adres testowy | Linia 7 smoke: `SMOKE_EMAIL` z `{ts}` → `Date.now()`, bez zmiennej jak dotąd | Ponowna rejestracja tego samego adresu kończy się błędem; CI bez zmian | Plan (ograniczenie użytkownika) |
| Potwierdzanie maila | Wyłączone w hostowanym Supabase (ręcznie) | PRD v1 bez weryfikacji maila; inaczej logowanie po rejestracji nie przejdzie | Plan |
| Luki w kodzie | Kody błędów rejestracji → polskie komunikaty; jedna prawdziwa treść `confirm-email` | Spójność z logowaniem i konwencją CLAUDE.md; strona nie powtarza tekstu z URL | Plan |
| Sprzątanie | Konta testowe usuwa człowiek w dashboardzie | Automatyczne usuwanie wymaga klucza `service_role` | Plan |
| Pliki wspólne z drugim pasem | `smoke.mjs` tylko linia 7, `roadmap.md` bez zmian | Drugi worktree zmienia resztę smoke i roadmapę | Ograniczenie użytkownika |

## Scope

**In scope:**
- linia 7 `scripts/smoke.mjs`
- `src/lib/auth-errors.ts`, `signup.ts`, `signup.astro`, `confirm-email.astro`
- PR z zielonym CI, Solo Code Review, merge
- ustawienie Supabase, deploy z `main`, smoke na produkcji, ręczny test, zapis dowodu

**Out of scope:**
- reszta `smoke.mjs`, `roadmap.md`
- tłumaczenie formularza, porządki palety w `confirm-email`
- weryfikacja maila / reset hasła (v2)
- job deploy w CI, Playwright

## Architecture / Approach

Kod w worktree → PR i job `smoke` w CI (lokalnie brak Dockera) → merge → deploy z `main` → smoke na produkcji. Kolejność chroni przed wdrożeniem niezmergowanego kodu i rozjazdem z drugim pasem.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Adres smoke i poprawki rejestracji | `SMOKE_EMAIL` w linii 7, polskie błędy rejestracji, prawdziwa strona po rejestracji | Konflikt z drugim pasem w `smoke.mjs`, jeśli diff wyjdzie poza linię 7 |
| 2. PR i CI | Zielone `ci` i `smoke`, review, merge | Pełny smoke działa tylko w CI |
| 3. Dowód na produkcji | Confirm email off, deploy, 9× PASS na prod, ręczny test, konta usunięte, wpisy w dokumentach | `main` z S-02 może wymagać sekretu `OPENROUTER_API_KEY` przed deployem |

**Prerequisites:** sesja `gh` i `wrangler`, dostęp do dashboardu produkcyjnego Supabase, własny adres obsługujący aliasy `+` (np. Gmail), produkcyjne `SUPABASE_URL`/`SUPABASE_KEY` lokalnie.
**Estimated effort:** ~1 sesja kodu + oczekiwanie na CI + ~30 min kroków ręcznych na produkcji.

## Open Risks & Assumptions

- Zakładamy, że hostowany Supabase akceptuje adres z aliasem `+`; jeśli nie, użyć innej skrzynki.
- Każdy przebieg smoke na produkcji zostawia konto, które trzeba usunąć ręcznie.
- Jeśli S-02 zmerguje się pierwszy, deploy z `main` obejmie też jego kod.

## Success Criteria (Summary)

- `npm run smoke` na produkcji: 9× PASS, kod 0.
- Ręcznie: rejestracja, logowanie, dashboard i wylogowanie działają w przeglądarce na publicznym URL.
- Dowód zapisany w `deploy-plan.md` i `infrastructure.md`, zmiana w `main`.
