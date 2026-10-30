# S-02: Generowanie propozycji fiszek — Plan Brief

> Full plan: `context/changes/generate-card-proposals/plan.md`

## What & Why

Użytkownik wkleja tekst i dostaje do 10 propozycji fiszek (przód/tył) od AI. To pierwsza połowa głównego przepływu 10xCards i logika biznesowa wymagana do certyfikatu. Bez niej S-03 (akceptacja i zapis) nie ma czego zapisywać.

## Starting Point

Działa logowanie i chroniony `/dashboard`. Istnieje tabela `cards`. Nie ma żadnego endpointu JSON, serwisów, typów DTO ani integracji z AI. Smoke test w CI sprawdza tylko przepływ logowania.

## Desired End State

Zalogowany użytkownik na `/generate` wkleja tekst, klika „Generuj” i widzi listę propozycji. Przy pustym polu, zbyt długim tekście albo błędzie AI dostaje polski komunikat, a tekst zostaje w polu. CI automatycznie sprawdza walidację i ścieżkę sukcesu na atrapie AI. Na produkcji generowanie mieści się w 30 s.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Dostawca AI | OpenRouter, `anthropic/claude-haiku-5.5`, wymuszony JSON | Rekomendacja kursu, < 0,001 $ za generowanie, zmiana modelu bez zmiany integracji | Plan |
| Ekran | Nowa chroniona strona `/generate`, link z dashboardu | S-03 dołoży akceptację w tym samym miejscu, dashboard zostaje prosty | Plan |
| Testy | Smoke 401/400 zawsze + atrapa OpenRouter w CI (200 i błąd AI) | CI testuje ścieżkę sukcesu bez kosztów; atrapa przyda się w teście „generuj → zapisz” | Plan |
| Przełączenie na atrapę | Tylko `OPENROUTER_BASE_URL` w env; kod produkcyjny nie zna atrapy | Brak „trybu testowego” w produkcji, który mógłby się przypadkiem włączyć | Plan |
| Kontrakt błędów | `{ error: { code, message } }`, kody `unauthorized`, `invalid_request`, `text_empty`, `text_too_long`, `ai_not_configured`, `ai_failed`, `ai_timeout` | Reguła z CLAUDE.md; pierwszy wzorzec dla S-03/S-04 | Plan |
| Limity | Pusty = sam biały znak; limit 10 000 jako `length`; max 10 propozycji, obcinanie, odrzucanie pustych; 0 propozycji = sukces z komunikatem | Reguły PRD doprecyzowane do przypadków granicznych | PRD + Plan |
| Prywatność | Bez logowania tekstu, promptu i odpowiedzi; tylko kod błędu | NFR PRD i włączone `observability` na Workers | PRD |
| Timeout | 30 s po stronie serwera → `ai_timeout` | Cel 30 s z PRD | PRD |

## Scope

**In scope:**
- `POST /api/generate`, serwis OpenRouter, helper JSON, `src/types.ts`, zmienne env i baner
- Atrapa OpenRouter i rozszerzony smoke w CI
- Strona `/generate` z formularzem React i hookiem, link z dashboardu
- Sekret na Cloudflare i pomiar na produkcji

**Out of scope:**
- Zapis, akceptacja i edycja propozycji, liczniki (S-03)
- Limit generowań, streaming, ponawianie, wybór modelu w UI
- Prawdziwe wywołania AI w CI, deploy job

## Architecture / Approach

`GenerateForm` (React) → `useGenerateProposals` → `POST /api/generate` (sesja, zod, konfiguracja) → `generateCardProposals()` w `src/lib/services/` → OpenRouter (albo atrapa w CI przez `OPENROUTER_BASE_URL`) → zod → max 10 propozycji → JSON.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Endpoint generowania | Działający `/api/generate` + smoke 401/400 | Pierwszy wzorzec JSON, który powtórzą kolejne slice'y |
| 2. Atrapa AI w CI | CI testuje 200 i błąd AI bez kosztów | workerd w `preview` może nie mieć dostępu do 127.0.0.1 |
| 3. Ekran /generate | Formularz z komunikatami i listą | Stan pola tekstu przy błędach |
| 4. Produkcja | Sekret, wdrożenie, pomiar 30 s / CPU | Błąd 1102 na planie Free (R2) |

**Prerequisites:** konto OpenRouter z doładowaniem i kluczem w `.dev.vars` przed ręcznym testem fazy 1; lokalny Supabase (`npx supabase start`) do smoke.
**Estimated effort:** ~3–4 sesje (po jednej na fazę, faza 4 krótka).

## Open Risks & Assumptions

- Zakładamy, że `anthropic/claude-haiku-5.5` nadal wspiera structured outputs w chwili implementacji (stan z 2026-10-20). Jeśli nie, zmienia się tylko stała modelu.
- workerd w `astro preview` musi móc wywołać atrapę na `127.0.0.1`. Jeśli nie, faza 2 jest zablokowana i wymaga decyzji, bez trybu mock w kodzie.
- Limit 10 ms CPU na Free nie jest zmierzony. Przy błędach 1102 trzeba przejść na plan Paid (5 $/mies.).

## Success Criteria (Summary)

- Zalogowany użytkownik zamienia wklejony tekst w listę propozycji przód/tył w ≤ 30 s.
- Każdy błąd daje polski komunikat i nie kasuje tekstu.
- CI na każdym PR sprawdza walidację, ochronę strony i ścieżkę sukcesu na atrapie.
