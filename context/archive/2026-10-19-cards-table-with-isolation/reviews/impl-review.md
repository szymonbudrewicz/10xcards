<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Tabela fiszek z izolacją danych per użytkownik (F-01)

- **Plan**: context/changes/cards-table-with-isolation/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-20
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification run

- `ls supabase/migrations/*_create_cards.sql` — PASS
- `node --check scripts/isolation-check.mjs` — PASS
- `node scripts/isolation-check.mjs` bez zmiennych — PASS (exit 1, komunikat)
- `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=x node scripts/isolation-check.mjs` — PASS (exit 1, odmowa hosta)
- `npm run lint` — PASS
- `npx astro check` — PASS (0 errors, 0 warnings, 0 hints)
- NOT re-run: `npm run build`, job `smoke` w CI i zapytania katalogowe na produkcji (wymagają Dockera/GitHuba/produkcji; oparte na zapisach w Progress).
- `eslint.config.js`: `scriptsConfig` zawiera `URL: true, crypto: true` (linia 77) — zgodnie z planem.

## Findings

### F1 — `authenticated` zachowuje TRUNCATE i inne domyślne uprawnienia

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261019120000_create_cards.sql:16-18
- **Detail**: `grant select, insert, update, delete` tylko dodaje uprawnienia. Domyślne uprawnienia Supabase w schemacie `public` dają `authenticated` także TRUNCATE, REFERENCES i TRIGGER, których RLS nie obejmuje. Komentarz w migracji mówi „dokładnie cztery operacje”, co jest nieprawdą. PostgREST nie wystawia TRUNCATE, więc dziś nie da się tego wykorzystać przez API. Plan wymagał, by nie polegać na domyślnych grantach. Migracja jest już na produkcji, więc poprawka to nowa migracja, nie edycja starej.
- **Fix**: Nowa migracja `revoke all on public.cards from anon, authenticated;` a po niej ponowny `grant select, insert, update, delete ... to authenticated`.
  - Strength: Realizuje zamysł planu i zgadza się z komentarzem; zmiana jest idempotentna.
  - Tradeoff: Druga migracja do wypchnięcia na produkcję ręczną bramką (M3).
  - Confidence: MED — oparte na domyślnych uprawnieniach Supabase; nie sprawdzono `has_table_privilege(..., 'truncate')` na produkcji.
  - Blind spot: Faktyczne uprawnienia na produkcji.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Jawne uprawnienia tabel: revoke all przed grant (nowa migracja `20261020120000_cards_tighten_constraints_and_privileges.sql`; do ręcznego wypchnięcia na produkcję, bramka M3)

### F2 — Skrypt izolacji może zaliczyć krok przy błędzie innym niż RLS

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/isolation-check.mjs:130-150, 162, 171, 179, 185, 189-197
- **Detail**: Kroki „B update/delete” przechodzą, gdy `rowsOf(...)` jest puste, więc 401, 404 lub 5xx też dają PASS, choć RLS nie zadziałał. Kroki odrzucenia (`!result.ok`) przechodzą przy każdym błędzie, w tym 400 dla źle sformułowanego ciała. Test pustego `front` ma dowodzić ograniczenia CHECK, a mógłby przejść na błędzie RLS. Anon select przechodzi przy każdej odpowiedzi niebędącej tablicą. Skrypt jest jedynym dowodem izolacji, więc fałszywy PASS osłabia całą gwarancję F-01.
- **Fix**: Wymagać `ok && Array.isArray(json)` dla update/delete B; dla odrzuceń sprawdzać status i kod Postgresa (RLS: 403 / `42501`, CHECK: 400 / `23514`); dla anon select przyjmować 401, 403 albo 200 z pustą tablicą.
  - Strength: Krok zalicza się tylko wtedy, gdy zadziałał właściwy mechanizm, więc czerwony CI oznacza realną regresję.
  - Tradeoff: Dokładne kody zależą od wersji PostgREST; zbyt ścisłe asercje mogą dać fałszywe FAIL po aktualizacji.
  - Confidence: MED — kody są standardowe, ale nie uruchomiono skryptu lokalnie (brak Dockera).
  - Blind spot: Faktyczne kody odpowiedzi w CI.
- **Decision**: FIXED via Fix differently (wg wskazówek użytkownika): B update/delete wymagają `ok` + pustej tablicy; blank front/back wymagają 400 + 23514; pozostałe odrzucenia wymagają 4xx; anon select akceptuje 401/403/200 z pustą tablicą; dodany krok tab-only front (wymaga poprawki F6 w migracji, inaczej CI zaczerwieni się)

### F3 — Workflow CI bez `permissions`, limitów czasu i przypiętej wersji CLI

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:1-12, 27-29, 35-37
- **Detail**: Brak bloku `permissions:` (token z domyślnymi, możliwe że szerokimi uprawnieniami), brak `timeout-minutes` (zawieszone `docker pull` lub `fetch` trwa do 6 godzin), `supabase/setup-cli@v1` z `version: latest`, choć `package.json` przypina `supabase ^2.23.4`. Nie wynika to z kroku dodanego w F-01 i plan zakazywał innych zmian w CI, więc to uwaga do osobnej zmiany.
- **Fix**: Dodać `permissions: contents: read`, `timeout-minutes: 15` dla obu jobów i przypiąć wersję CLI do tej z `package.json`.
- **Decision**: SKIPPED (świadomie): plan F-01 zabraniał zmian w CI poza jednym krokiem, to nie regresja tego slice'a; ryzyko niskie (jeden użytkownik, job używa tylko lokalnego Supabase, bez sekretów produkcyjnych). Do osobnego chore, z wyższym priorytetem, bo repo jest publiczne.

### F4 — `deploy-plan.md` zawiera nieaktualne zapisy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/deployment/deploy-plan.md:9, 28, 54, 71, 74, 80
- **Detail**: Ryzyko R7 mówi, że CI celuje w `master`, a `ci.yml` używa `main`. Linia 74 („Zmiany bez commita”) jest nieaktualna. Linia 28 nadal instruuje uruchomienie smoke, które pisze do produkcyjnej bazy, a linia 62 zapisuje, że to się nie stało. Wprowadzający w błąd dokument jest ryzykiem przy następnym deployu.
- **Fix**: Poprawić R7 na `main`, usunąć linię 74 i oznaczyć linię 28 jako zastąpioną.
- **Decision**: FIXED via Fix now (R7 na `main` w liniach 9, 52, 54, 71, 80; usunięto „Zmiany bez commita”; krok 3 oznaczony jako zastąpiony)

### F5 — `fetch` w skrypcie podąża za przekierowaniami; sprzątanie tylko na ścieżce szczęśliwej

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/isolation-check.mjs:35, 105, 219-223
- **Detail**: Strażnik hosta sprawdza tylko adres początkowy, a `fetch` domyślnie podąża za 307/308, więc ciało rejestracji (z hasłem) i nagłówek `apikey` mogłyby trafić na inny host. Ponadto fiszka A jest usuwana tylko po udanym przebiegu; `abort` wywołuje `process.exit` wewnątrz `try`, więc `catch` jest pomijany. W CI jest to nieszkodliwe, lokalnie dane zostają do `supabase db reset`.
- **Fix**: Dodać `redirect: "error"` do `fetch` i `finally` usuwające fiszkę jako A.
- **Decision**: FIXED via Fix differently (tylko `redirect: "error"` w `call()`); sprzątanie w `finally` świadomie pominięte: plan zakłada, że konta testowe zostają w lokalnej bazie, a baza w CI jest jednorazowa

### F6 — Ograniczenie niepustości przepuszcza same tabulatory, nowe linie i NBSP

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261019120000_create_cards.sql:8-9
- **Detail**: `btrim(front)` usuwa tylko spacje ASCII, więc `front` złożony z samych tabulatorów lub znaków nowej linii przechodzi CHECK. Skrypt testuje tylko pusty ciąg. Plan żąda „niepustości po przycięciu spacji”, więc implementacja jest zgodna z literą planu; to luka planu. Poprawka wymaga nowej migracji (można połączyć z F1).
- **Fix**: W tej samej nowej migracji zastąpić ograniczenia wersją `front !~ '^\s*$'` (analogicznie `back`).
  - Strength: Domyka lukę przy jednej migracji na produkcję razem z F1.
  - Tradeoff: Zmiana ograniczenia na tabeli już istniejącej na produkcji; trzeba sprawdzić, że nie ma wierszy naruszających nowy warunek (tabela jest nowa i pusta).
  - Confidence: HIGH — zachowanie `btrim` jest udokumentowane.
  - Blind spot: Nie sprawdzono, czy produkcyjna tabela jest pusta.
- **Decision**: FIXED via Fix now (drop/add constraint w nowej migracji `20261020120000_cards_tighten_constraints_and_privileges.sql`; do ręcznego wypchnięcia na produkcję razem z F1)

### F7 — Komenda `isolation` w CLAUDE.md pomija wymagania i wariant PowerShell

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: CLAUDE.md:13, scripts/isolation-check.mjs:3
- **Detail**: Nagłówek skryptu pokazuje `eval "$(...)"` (tylko POSIX), a CLAUDE.md mówi, że środowisko to Windows/PowerShell. Opis komendy nie wspomina o wymaganym `npx supabase start` z zastosowaną migracją ani o wyłączonym potwierdzaniu maili, bez którego skrypt się przerywa.
- **Fix**: Dopisać w nagłówku skryptu fragment PowerShell i jedno zdanie z wymaganiami do linii w CLAUDE.md.
- **Decision**: FIXED via Fix now (nagłówek skryptu: wymagania + snippet PowerShell, nieprzetestowany lokalnie; CLAUDE.md: wymagania i wzmianka o jobie `smoke`)

## Pominięte jako szum (nie zgłoszone jako ustalenia)

- Indeks `(user_id, created_at desc)` — dodać, gdy pojawi się pierwsze zapytanie listujące (S-03/S-04).
- Brak maksymalnej długości `front`/`back` — plan jawnie wyłączył to z zakresu.
- Globalne `AbortSignal`/`setTimeout` w ESLint — potrzebne dopiero, gdy ktoś doda limity czasu w skrypcie.
- Pakiety narzędziowe w `dependencies` i brak `engines` — niski wpływ w aplikacji SSR budowanej przez Wrangler.
- Dodatkowe sprawdzenia w skrypcie (pusty `back`, własny update A) — EXTRA zgodne z duchem planu.
- Aktualizacje `roadmap.md`, `change.md` i checkboxów w `plan.md` — bookkeeping workflow, nie zmiany kodu.
