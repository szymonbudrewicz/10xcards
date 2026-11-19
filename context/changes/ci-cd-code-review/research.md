---
date: 2026-11-19T10:12:31+01:00
researcher: Claude (Opus 5.5) z Szymonem Budrewiczem
git_commit: 3f4eb890eead0ed78f8dc7dc9ebfb5c1db205593
branch: feat/m5l3-ci-code-review
repository: szymonbudrewicz/10xcards
topic: "Recenzent AI (packages/code-reviewer) w GitHub Actions jako bramka merge — na podstawie requirements.md"
tags: [research, ci, github-actions, code-reviewer, composite-action]
status: complete
last_updated: 2026-11-19
last_updated_by: Claude (Opus 5.5)
---

# Research: recenzent AI w GitHub Actions jako bramka merge

**Date**: 2026-11-19T10:12:31+01:00
**Git Commit**: 3f4eb89 (plus niezacommitowane zmiany zadania 2 M5L3 w `packages/code-reviewer` na gałęzi `feat/m5l3-ci-code-review`)
**Repository**: szymonbudrewicz/10xcards (publiczne)

## Research Question

Co trzeba wiedzieć o repo i o szablonach kursu (`m5l3-review.yml.template`, `m5l3-action.yml.template`), żeby zaplanować workflow GHA, który na każdym PR do `main` uruchamia recenzenta z `packages/code-reviewer`, publikuje komentarz z ocenami, ustawia etykietę `ai-cr:passed`/`ai-cr:failed`, failuje check przy `fail` i pozwala na ponowną recenzję etykietą `ai-cr:review` (`context/changes/ci-cd-code-review/requirements.md`).

## Summary

- Recenzent jest gotowy do użycia w CI bez builda: CLI czyta diff z pliku podanego jako argument albo ze stdin, wypisuje sam JSON na stdout, a usage i ostrzeżenia na stderr; kody wyjścia to 0 (recenzja), 1 (setup/provider), 2 (limit) (`packages/code-reviewer/src/cli.ts:1-15,44,58,89`). Tytuł i opis PR przyjmuje z `PR_TITLE`/`PR_BODY` (`cli.ts:66-70`). Werdykt jest już liczony regułą w kodzie (`src/verdict.ts`), a komentarz renderuje `renderComment()` (`src/comment.ts`), ale nic nie wystawia tego renderu na zewnątrz CLI.
- Szablon akcji zakłada inny kontrakt niż repo: `dist/review.js`, zmienną `LLM_PROVIDER_API_KEY` i `REVIEW_MODEL` (`.claude/config-templates/m5l3-action.yml.template:4-5,49-55`). Repo nie ma builda paczki (`packages/code-reviewer/package.json:10-14`, tylko `tsx`), a CLI czyta `OPENROUTER_API_KEY` (`cli.ts:55-59`). `REVIEW_MODEL` się zgadza (`cli.ts:21`).
- Szablon workflow celuje w `master` (`m5l3-review.yml.template:10`); domyślna gałąź repo to `main` (`gh repo view`), a istniejący `ci.yml` też używa `main` (`.github/workflows/ci.yml:3-7`).
- Stan GitHuba na 2026-11-19: brak sekretów Actions (`gh secret list` → `[]`), brak etykiet `ai-cr:*`, brak ochrony gałęzi `main` (API 404 „Branch not protected”), domyślne uprawnienia `GITHUB_TOKEN` = `read`. Workflow musi więc sam deklarować `pull-requests: write` i `issues: write` (szablon to robi, `m5l3-review.yml.template:14-17`), sekret trzeba dodać, a bramka merge zadziała dopiero po ustawieniu wymaganego checka.
- SHA w szablonach zgadzają się z tagami i są najnowszymi wydaniami na 2026-11-19: `actions/checkout` v7.0.1 = `3d3c42e5…`, `actions/setup-node` v7.1.0 = `949feb24…` (sprawdzone przez `gh api repos/<repo>/git/ref/tags/<tag>`). Istniejący `ci.yml` używa niepinowanych `@v4` (`ci.yml:13-14`) — poza zakresem tej zmiany, ale łamie twardą zasadę z CLAUDE.md.
- Trzy ryzyka szablonu wymagają decyzji w planie (szczegóły niżej): (1) etykieta inna niż `ai-cr:review` tworzy pominięty run tego samego checka, a pominięty job GitHub raportuje jako sukces dla wymaganych checków; (2) `concurrency` na poziomie workflow z `cancel-in-progress` może anulować trwającą recenzję przy dowolnym zdarzeniu `labeled`; (3) diff z lockfile'ami może przekroczyć `REVIEW_MAX_DIFF_CHARS` (200 000) i skończyć się exit 2 bez werdyktu.

## Detailed Findings

### Kontrakt CLI recenzenta (to, co akcja wywołuje)

- Wejście: `argv[2]` jako ścieżka pliku z diffem, inaczej stdin, a gdy oba puste — fallback na `data/sample.diff` z komunikatem na stderr (`packages/code-reviewer/src/cli.ts:24-35`). W CI fallback byłby mylący: pusty diff zrecenzowałby przykład zamiast PR-a. Plan powinien wykluczyć pusty diff przed wywołaniem.
- `.env` paczki ładowany z katalogu paczki, nie z cwd (`cli.ts:17-19`); w CI pliku nie ma, więc klucz musi przyjść ze zmiennej środowiskowej `OPENROUTER_API_KEY` (`cli.ts:55-59`) — dotenv nie nadpisuje istniejących zmiennych.
- Limity z env: `REVIEW_MAX_COST_USD` (0.10), `REVIEW_MAX_DIFF_CHARS` (200 000), `REVIEW_MAX_OUTPUT_TOKENS` (16 000) (`packages/code-reviewer/.env.example:6-12`, `cli.ts:49-53`).
- Wyjście: stdout = `JSON.stringify(review)`; stderr = `[usage] …`, `[verdict] …` (gdy model złamał regułę), `[limit] …` (`cli.ts:71-90`). Akcja może więc przekierować stdout do pliku i wyciągnąć `verdict` jak w szablonie (`m5l3-action.yml.template:56-60`).
- Komentarz: `renderComment(review)` zwraca Markdown z tabelą sześciu kryteriów (`src/comment.ts`). Szablon renderuje komentarz inline `node -e` z samego `verdict` i `summary` (`m5l3-review.yml.template:52-54`) — nie spełnia wymagania „każde kryterium z oceną i uzasadnieniem” (`requirements.md`, „Oczekiwane skutki uboczne”). Potrzebny jest punkt wejścia, który renderuje komentarz z pliku JSON (np. skrypt w paczce wołający `renderComment`).
- Uruchomienie: `tsx` jest w `devDependencies` (`package.json:23-28`), a `npm ci` instaluje devDependencies, więc `npm ci --prefix packages/code-reviewer` + `npm run review --silent --prefix packages/code-reviewer -- <plik>` działa bez builda (ta sama komenda przeszła lokalnie 2026-11-19, exit 0, $0.016). `package-lock.json` paczki istnieje i jest już w kluczu cache `ci.yml:16-18`.

### Szablon composite action vs repo

- `runs.using: composite` z `actions/setup-node` i jednym krokiem `bash` (`m5l3-action.yml.template:37-60`). Niezaufany tekst PR idzie przez `env`, nie przez interpolację (`:47-55`) — zgodne z wymaganiem i z twardą zasadą o wielowierszowych wartościach (diff przez plik, `diff-file`).
- Rozbieżności do zaadaptowania: `dist/review.js` → wywołanie CLI paczki z repo; `LLM_PROVIDER_API_KEY` → `OPENROUTER_API_KEY`; brak kroku `npm ci` w akcji (szablon zakłada zbudowany, samowystarczalny plik). Lokalna akcja w `.github/actions/ai-reviewer/` ma dostęp do checkoutu repo, więc może wskazać `packages/code-reviewer` względem `$GITHUB_WORKSPACE`.
- Kroki `verdict=...` i `review-file=...` to jednowierszowe wartości w `$GITHUB_OUTPUT` (`:59-60`) — dopuszczalne; wielowierszowe dane (diff, review) idą przez pliki.
- Przy exit 1/2 krok `node … > "$review_file"` failuje (domyślne `bash -e` w krokach composite z `shell: bash`), `verdict` zostaje pusty; workflow wtedy pomija komentarz (`if: … verdict != ''`, `m5l3-review.yml.template:49`) i bramka kończy się „missing” (`:62-66`). Przy limicie (exit 2) autor PR-a nie dostanie żadnego komentarza — do decyzji, czy komentować błąd/limit.

### Szablon workflow vs repo i GitHub

- Trigger `pull_request` z typami `opened, synchronize, reopened, labeled` i `if` na etykietę `ai-cr:review` (`m5l3-review.yml.template:8-11,24`).
- Checkout zdarzenia `pull_request` to domyślnie merge commit PR-a; `git diff "origin/$BASE_REF...HEAD"` przy `fetch-depth: 0` daje zmiany PR-a względem bazy (`:30-37`).
- Etykiety tworzone `gh label create --force` w każdym przebiegu (`:56-57`) — w repo ich dziś nie ma, więc to potrzebne. Zdarzenia wywołane przez `GITHUB_TOKEN` (dodanie/usunięcie etykiety przez workflow) nie uruchamiają kolejnych workflow (zachowanie GitHub Actions), więc dodanie `ai-cr:passed` nie zapętli recenzji.
- Każdy przebieg dodaje nowy komentarz (`gh pr comment`, `:55`); przy `synchronize` na wielu pushach komentarze się mnożą. Alternatywa: `gh pr comment --edit-last` (edytuje ostatni komentarz bieżącego użytkownika/tokena) — do decyzji.
- **Ryzyko 1 — pominięty job jako sukces.** Dla zdarzenia `labeled` z inną etykietą job `review` jest pomijany przez `if` (`:24`). Według dokumentacji GitHub Actions (`jobs.<job_id>.if`) pominięty job raportuje status „Success” i nie blokuje merge, nawet jako wymagany check. Run powstaje dla tego samego head SHA, więc dodanie dowolnej etykiety po `fail` może zastąpić czerwony check zielonym/pominiętym. Ograniczenie: etykiety dodaje tylko ktoś z uprawnieniem triage/write; w tym repo (jeden autor, publiczne) to głównie ryzyko pomyłki, a nie ataku. Wpływa na wiarygodność bramki i zrzutów.
- **Ryzyko 2 — anulowanie przez `concurrency`.** `concurrency` na poziomie workflow z `cancel-in-progress: true` (`:19-21`) jest wyliczane przed `if` joba, więc zdarzenie `labeled` z inną etykietą w trakcie recenzji może ją anulować. Przeniesienie `concurrency` na poziom joba prawdopodobnie tego unika (job pominięty przez `if` nie wchodzi do grupy) — **niezweryfikowane w tym repo**, do potwierdzenia przy implementacji.
- **Ryzyko 3 — rozmiar diffa.** Zmiana zależności dotyka `package-lock.json` (dwa lockfile'e: root i paczka, `ci.yml:16-18`), co łatwo daje setki tysięcy znaków; przy > 200 000 znaków CLI odmawia z exit 2 przed wywołaniem modelu (`packages/code-reviewer/src/agent.ts`, warstwa 1 limitu). Wykluczenie lockfile'ów z diffa (`git diff … -- . ':(exclude)package-lock.json' ':(exclude)**/package-lock.json'`) obniża koszt i ryzyko; to też temat z Deep Dive lekcji (fragmenty diffa usuwane przed agentem).
- **Forki.** Repo jest publiczne; dla PR-ów z forków `pull_request` nie przekazuje sekretów, więc `OPENROUTER_API_KEY` będzie pusty i CLI skończy z exit 1 (`cli.ts:55-59`). `pull_request_target` dałby sekrety, ale uruchamiałby niezaufany kod z sekretami — wymagania tego nie żądają; żaden z PR-ów #1–#28 nie pochodzi z forka (`gh pr list --json isCrossRepository`).
- **Bramka merge.** Ochrony gałęzi brak (API 404), więc check `review` po dodaniu workflow będzie widoczny, ale nie wymagany. Szablon to zaznacza (`m5l3-review.yml.template:5`). Ustawienie wymaganego checka to zmiana w ustawieniach repo (outward-facing) — poza kodem.

### Istniejący CI

- `ci.yml` ma joby `ci` i `smoke` na `push`/`pull_request` do `main` (`.github/workflows/ci.yml:1-10,54`); joby `ci` już instalują paczkę recenzenta, typecheck i testy bez sekretów (`:19-24`). Nowy workflow to osobny plik — nie trzeba ruszać `ci.yml`.
- `ci.yml` używa Node 22 (`:15-16`), szablon akcji Node 24 (`m5l3-action.yml.template:39-41`); paczka wymaga `>=22` (`package.json:7-9`) — oba działają.

## Code References

- `packages/code-reviewer/src/cli.ts:17-35` — ładowanie `.env` paczki, źródła diffa, fallback na sample.diff
- `packages/code-reviewer/src/cli.ts:49-59` — limity z env, wymagany `OPENROUTER_API_KEY`
- `packages/code-reviewer/src/cli.ts:66-90` — `PR_TITLE`/`PR_BODY`, `[verdict]`, `[usage]`, JSON na stdout, exit 2
- `packages/code-reviewer/src/verdict.ts` — reguła werdyktu w kodzie
- `packages/code-reviewer/src/comment.ts` — `renderComment()` (tabela kryteriów)
- `packages/code-reviewer/package.json:10-14,23-28` — skrypty bez builda, `tsx` w devDependencies
- `.claude/config-templates/m5l3-action.yml.template:37-60` — kroki akcji kompozytowej
- `.claude/config-templates/m5l3-review.yml.template:8-66` — trigger, uprawnienia, concurrency, diff, komentarz, etykiety, bramka
- `.github/workflows/ci.yml:1-24` — istniejący CI na `main`, instalacja i testy recenzenta

## Architecture Insights

- Podział na workflow (zdarzenia GitHuba, komentarz, etykiety, bramka) i akcję (uruchomienie agenta, wyciągnięcie `verdict`) odpowiada wymaganiu „composite action, żeby workflow był czytelny” i trzyma klucz API wyłącznie w akcji.
- Werdykt bramki pochodzi z pola `verdict` JSON-a, a to pole po zadaniu 2 jest wynikiem reguły w kodzie (`verdict.ts`), nie wolnego tekstu modelu — zgodne z twardą zasadą „bramkuj na polu werdyktu”.
- Lekcja `context/foundation/lessons.md` („Bramki weryfikacji oceniaj po kodzie wyjścia”) dotyczy też tej akcji: o sukcesie kroku decyduje exit code CLI i walidacja `verdict ∈ {pass, fail}`, a nie grep po stdout.

## Historical Context (from prior changes)

- `context/changes/tool-loop-agent/plan.md` — M5L2: podział recenzenta na moduły, limit kosztu z exit 2 i testy w CI bez sieci; ten workflow konsumuje te kontrakty bez zmiany.
- PR-y #1–#28: 0 z forków (`gh pr list --state all --json isCrossRepository`) — uzasadnia `pull_request` zamiast `pull_request_target`.

## Related Research

- Nie dotyczy (brak wcześniejszego researchu o CI review).

## Open Questions

1. Komentarz: nowy przy każdym przebiegu czy edycja ostatniego (`--edit-last`)?
2. Ryzyko 1 (pominięty job = sukces): akceptujemy dla repo jednoosobowego, czy plan zmienia mechanizm ponownej recenzji (np. job zawsze uruchamiany, a `labeled` bez `ai-cr:review` kończy się bez nadpisywania checka)?
3. Czy komentować błąd setupu/limitu (exit 1/2), żeby autor wiedział, dlaczego check jest czerwony?
4. Wykluczenie lockfile'ów z diffa — tak/nie i jaka lista ścieżek.
5. Wymagany check w ochronie `main` — czy ustawiamy po pierwszym zielonym przebiegu (zmiana ustawień repo, do potwierdzenia z właścicielem).
6. Model w CI: domyślny `z-ai/glm-5.3` czy wybór po evalach (zadanie 3) — workflow może przyjąć model jako input akcji.
