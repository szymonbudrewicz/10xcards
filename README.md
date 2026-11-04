# 10xCards

Fiszki z AI: wklejasz tekst (artykuł, dokumentację, notatki), dostajesz propozycje fiszek przód/tył, poprawiasz je i zapisujesz na swoim koncie.

**Aplikacja:** https://10xcards.szymon-10x.workers.dev

Projekt zaliczeniowy kursu 10xDevs 4.0, budowany z agentem AI (Claude Code) według przepływu PRD → roadmapa → plan → implementacja → testy → wdrożenie. Cała dokumentacja projektowa jest w [`context/`](./context).

## Co działa

- **Konto:** rejestracja, logowanie i wylogowanie (Supabase Auth). Każdy użytkownik widzi wyłącznie własne fiszki.
- **Generowanie (`/generate`):** do 10 000 znaków tekstu → maks. 10 propozycji z AI (OpenRouter). Przy błędzie wklejony tekst zostaje w polu.
- **Akceptacja:** każdą propozycję można zaakceptować, poprawić przed zapisem albo odrzucić. Zaakceptowane zapisują się od razu, a liczniki propozycji i akceptacji pozwalają policzyć odsetek akceptacji (cel PRD ≥ 75%).
- **Moje fiszki (`/cards`):** lista zapisanych fiszek z edycją i usuwaniem.
- **Prywatność:** wklejony tekst nie jest zapisywany ani logowany. Trwałe są tylko fiszki i liczniki.

Następny krok z roadmapy: sesja powtórek (spaced repetition, S-05).

## Gdzie co jest

| Obszar                | Miejsce w repo                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kontrola dostępu      | `src/middleware.ts`, `src/lib/supabase.ts`; RLS i uprawnienia w `supabase/migrations/`; dowód izolacji kont A/B: `scripts/isolation-check.mjs`                                                                                                                                                                                                                                                           |
| CRUD fiszek           | `POST /api/cards` (zapis przez funkcję `accept_proposal()`), `PATCH`/`DELETE /api/cards/[id]`, widok `src/pages/cards.astro`; logika w `src/lib/services/cards.ts`                                                                                                                                                                                                                                       |
| Logika biznesowa      | generowanie i walidacja propozycji: `src/lib/services/card-generation.ts`, `src/pages/api/generate.ts`; liczniki akceptacji w `accept_proposal()`                                                                                                                                                                                                                                                        |
| Dokumenty kontekstowe | [`prd.md`](./context/foundation/prd.md), [`roadmap.md`](./context/foundation/roadmap.md), [`tech-stack.md`](./context/foundation/tech-stack.md), [`infrastructure.md`](./context/foundation/infrastructure.md), [`test-plan.md`](./context/foundation/test-plan.md), [`lessons.md`](./context/foundation/lessons.md); zamknięte zmiany z planami i przeglądami w [`context/archive/`](./context/archive) |
| Testy                 | Vitest (`tests/`), testy integracyjne na lokalnym Supabase (`tests/integration/`), E2E Playwright (`tests/e2e/`): każdy plik wskazuje ryzyko z `test-plan.md`, które pokrywa                                                                                                                                                                                                                             |
| CI                    | `.github/workflows/ci.yml`                                                                                                                                                                                                                                                                                                                                                                               |
| Wdrożenie             | [`context/deployment/deploy-plan.md`](./context/deployment/deploy-plan.md) (stan produkcji, pomiary, rollback)                                                                                                                                                                                                                                                                                           |

## Stack

Astro 7 (SSR) + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui, Supabase (Auth + Postgres z RLS), OpenRouter (AI), Cloudflare Workers (hosting). Uzasadnienie wyboru: [`tech-stack.md`](./context/foundation/tech-stack.md).

## Testy i CI

| Polecenie                  | Co sprawdza                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                 | Vitest: endpointy wywoływane bezpośrednio, AI zastąpione stubem `fetch` (walidacja, 401 bez wywołania AI, kształt błędów, prywatność) |
| `npm run test:integration` | zapis fiszek i liczniki na lokalnym Supabase, z odczytem stanu z bazy                                                                 |
| `npm run isolation`        | konto B nie czyta, nie zmienia i nie usuwa fiszek konta A; anonim nie ma dostępu                                                      |
| `npx playwright test`      | E2E w przeglądarce: logowanie, błąd AI z zachowaniem tekstu, akceptacja i zapis, edycja i usunięcie na `/cards`                       |
| `npm run smoke`            | przepływ konta i generowania przez HTTP na działającym serwerze                                                                       |

GitHub Actions przy każdym pushu i PR do `main`:

- **ci:** lint, `lint:ui`, `astro check`, `npm test`, build;
- **smoke:** lokalny Supabase z migracjami, izolacja kont, testy integracyjne, E2E Playwright z atrapą AI, smoke na buildzie produkcyjnym (runtime Cloudflare).

## Uruchomienie lokalnie

Wymagania: Node.js 22.14.0 (`.nvmrc`), npm, Docker (lokalny Supabase).

```bash
npm install
npx supabase start          # lokalny Supabase, stosuje migracje z supabase/migrations/
npx supabase status -o env  # API_URL i ANON_KEY do skopiowania poniżej
cp .env.example .dev.vars   # uzupełnij SUPABASE_URL, SUPABASE_KEY, OPENROUTER_API_KEY
npm run dev                 # http://localhost:4321
```

Sekrety: Cloudflare (lokalnie `npm run dev`) czyta `.dev.vars`, Node czyta `.env`. Na produkcji: `npx wrangler secret put <NAZWA>`. Wdrożenie: `npm run build && npx wrangler deploy`; migracje na produkcję stosuje człowiek (`npx supabase db push`), zob. `deploy-plan.md`.

Pozostałe polecenia: `npm run lint`, `npm run lint:ui`, `npm run format`, `npx astro check`.

## Licencja

MIT
