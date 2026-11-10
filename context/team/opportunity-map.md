# Mapa okazji

## Kontekst

- **Projekt / kontekst**: projekt kursowy 10xCards (solo + agent) oraz praca nad tldraw w M4; publiczne repo `szymonbudrewicz/10xcards`.
- **Ograniczenie danych**: mock / lokalne / tylko do odczytu / niewrażliwe (git, `gh`, pliki `context/`, publiczne PR-y).
- **Data**: 2026-11-10 (M5L1).

## Mapa

| Sygnał | SaaS / domyślna odpowiedź | Cienki helper | Pierwsza użyteczna wersja | Ryzyko danych | Kierunek, jeśli się sprawdzi |
|---|---|---|---|---|---|
| Rytuał zamknięcia lekcji (diff bloku CLI w CLAUDE.md i manifestu → branch → PR → CI → merge → wpis stanu) | 10x CLI zarządza blokiem `BEGIN/END`, `gh pr create`, CI, agent robi to z reguły | — | — | lokalne | Wait / no build |
| Dryf dokumentów (`deploy-plan.md`, roadmapa, lista funkcji w CLAUDE.md nie nadążają) | `/10x-archive`, `/10x-status`, `/10x-rule-review` | skrypt porównujący `wrangler deployments`, `src/pages/`, `context/archive/` z dokumentami | lokalny raport rozjazdów w Markdownie | lokalne, read-only | Review / CI gate (później, jako reguła reviewera) |
| PR bez drugiej pary oczu (uwagi z `lessons.md` i dryf od planu nie są bramką) | Copilot code review / CodeRabbit, `/code-review`, `/10x-impl-review`, CI | diff + `plan.md` + `lessons.md` + status CI → jeden komentarz | ręcznie uruchamiany prompt na 3 historycznych PR-ach (#16, #17, #18) | publiczne repo, read-only; bez `.dev.vars` | Review / CI gate (M5L2 → M5L3) |

## Rekomendowany pierwszy kandydat

```
Helper:
plan-aware PR reviewer

Czyta:
diff PR-a (gh pr diff), context/changes/<id>/plan.md, context/foundation/lessons.md, status jobów CI (gh pr checks)

Zwraca:
jeden komentarz: dryf od planu, naruszone lekcje, czerwone joby — z linkami do linii i jobów

Nie robi:
nie blokuje merge'a, nie poprawia kodu, nie zastępuje lint/testów ani GitHuba, nie działa jeszcze w Actions

Ryzyko danych:
publiczne repo, tylko do odczytu; do kontekstu LLM nie trafiają .dev.vars ani sekrety

Kierunek, jeśli się sprawdzi:
Review / CI gate (M5L2 → M5L3)
```

## Dlaczego ten kandydat

- Powtarza się przy każdym PR-ze (25 PR-ów dotąd, każdy mergowany bez drugiego recenzenta).
- Łączy trzy źródła (diff, plan zmiany, `lessons.md`) plus CI. Żadne z istniejących narzędzi nie widzi ich naraz, a gotowe reviewery oceniają kod ogólnie, nie względem planu zmiany.
- Da się go sprawdzić tylko do odczytu na historycznych PR-ach, bez budowania integracji.
- Nie zastępuje GitHuba ani CI: tylko dokłada komentarz i odsyła do źródeł.
- Odrzucone: rytuał lekcji jest już obsłużony przez CLI i agenta (wait); dryf dokumentów jest po części złożonością istotną (dokumenty to decyzje), więc lepiej dołożyć go jako regułę do reviewera niż budować osobne narzędzie.

## Następny kierunek, jeśli się sprawdzi

Review / CI gate: w M5L2 helper staje się agentem zespołowym, w M5L3 trafia do pipeline'u GitHub Actions jako komentarz LLM pod PR-em. To jednocześnie dowód na odznakę 10xChampion (widok pipeline'u, logi joba, komentarz na PR). Przed przejściem do Actions sprawdzić wartość na 3 historycznych PR-ach: czy komentarz wskazałby coś, co faktycznie wyszło później w impl-review lub po merge'u.
