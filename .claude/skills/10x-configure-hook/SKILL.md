---
name: 10x-configure-hook
description: >
  Turn the quality gates from context/foundation/test-plan.md into working
  agent hooks and prove them before handing off. Detects the harness from the
  repo (Claude Code, Cursor, Codex, GitHub Copilot), audits existing hook
  config, maps each gate to a moment (per edit, end of turn, commit, push,
  CI), generates config and scripts in that harness's signal protocol, and
  runs every script against a deliberately broken file. Trigger phrases:
  "configure hooks", "set up agent hooks", "lint after every edit", "hook
  fires but the agent ignores it", "skonfiguruj hooki", "hook po edycji",
  "agent nie widzi błędów z hooka". Use AFTER /10x-test-plan (M3L1). Does
  not write git pre-commit/pre-push config — it only recommends it.
---
# 10x Configure Hook — bramki jakości jako hooki agenta, sprawdzone

Ta umiejętność zamienia bramki już ustalone przez projekt w hooki, które agent faktycznie odbiera. Hook jest użyteczny tylko wtedy, gdy jego komunikat dociera do agenta kanałem odczytywanym przez harness dla danego zdarzenia. Większość niedziałających hooków uruchamia się poprawnie i wypisuje dane do kanału, którego nikt nie nasłuchuje — dlatego ta umiejętność nigdy nie przekazuje hooka, którego nie uruchomiła.

Pracuj w tej kolejności. Każdy krok ma wynik zużywany przez następny krok; raport końcowy (Krok 8) je zbiera.

## Kluczowe zasady

1. **Przeprowadź wywiad z repozytorium, nie z użytkownikiem.** Wszystko widoczne na dysku — harness, toolchain, istniejące hooki, plan testów — należy odczytać, a nie o to pytać. Pytaj tylko o to, na co repozytorium nie może odpowiedzieć.
2. **Kanał sygnału zależy od harnessa i zdarzenia.** Nigdy nie zakładaj, że kody wyjścia, stderr, stdout lub pole JSON znaczą to samo w dwóch harnessach. Fakty znajdują się w `references/<harness>.md`; korzystaj z nich, a gdy możesz przeglądać dokumentację, preferuj aktualną dokumentację, jeśli jest z nimi sprzeczna.
3. **Dla każdej edycji oznacza edytowany plik.** Hook dla każdej edycji odczytuje edytowaną ścieżkę z payloadu i sprawdza wyłącznie ten plik. Sprawdzenia całego projektu przenieś na koniec tury lub później.
4. **Najpierw udowodnij, potem przekaż.** Każdy wygenerowany skrypt jest uruchamiany z przykładowym payloadem na celowo uszkodzonym pliku oraz na czystym pliku, zanim zostanie napisany raport.
5. **Scalaj, nigdy nie nadpisuj.** Istniejąca konfiguracja hooków jest audytowana i scalana; diff jest pokazywany przed zapisaniem.

---

## Krok 1 — Warunki wstępne: przeczytaj plan testów

Poszukaj `context/foundation/test-plan.md`. Znajdź sekcję bramek jakości **po tytule** (`Quality Gates` lub bliskim wariancie) — nigdy po numerze sekcji; numeracja różni się między wersjami schematu.

Z tabeli bramek zapisz po jednym wierszu dla każdej bramki: nazwę bramki, miejsce jej uruchamiania (`local`, `local (agent loop)`, `CI on PR`…), wymagalność (`required`, `required after §3 Phase N`, `recommended after…`, `optional`) oraz to, co wykrywa. Wiersze dotyczące pętli agenta — `post-edit hook`, `lint + typecheck`, `unit + integration` — są głównym wejściem.

Zapisz też **jawne odroczenia**: każdą bramkę lub wiersz oznaczony jako `deferred`, `not v1`, `later`, `out of scope` lub podobnie, wraz z cytowanym brzmieniem i uzasadnieniem podanym przez plan. Odroczenia są decyzjami, nie lukami.

Jeśli plik nie istnieje lub nie ma sekcji bramek jakości: wyprowadź kandydatów na bramki z własnych skryptów repozytorium (Krok 3) i stwierdź w raporcie `No test plan found — gates derived from the toolchain`. Zasugeruj `/10x-test-plan`, aby podjąć rzeczywistą decyzję o bramkach, ale nie zatrzymuj się.

## Krok 2 — Wykryj harness(y)

Każdy plik referencyjny zaczyna się sekcją **Detection signals**. Przeczytaj te sekcje dla każdego pliku w `references/` i dopasuj je do repozytorium. Typowe sygnały:

- Claude Code: katalog `.claude/` (`settings.json`, `settings.local.json`, `skills/`), `CLAUDE.md`.
- Cursor: `.cursor/` (`hooks.json`, `rules/`, `skills/`), `.cursor/rules/10x-course.mdc`.
- Codex: `.codex/` (`hooks.json`, `config.toml`), `.agents/skills/`, `AGENTS.md`.
- GitHub Copilot: `.github/hooks/`, `.github/skills/`, `.github/copilot-instructions.md`.
- Manifest 10x-cli: `.claude/`, `.cursor/`, `.github/` lub `.agents/.10x-cli-manifest.json` — jego pole `"tool"` wskazuje harness, dla którego zainstalowano artefakty kursu.

Katalogi konfiguracji specyficzne dla harnessa i manifest są silnymi sygnałami. `AGENTS.md` i `.agents/skills/` są słabe: wiele harnessów odczytuje `AGENTS.md`, a 10x-cli zapisuje też `.agents/skills/` w repozytoriach Claude Code.

**Rozstrzygnięcie remisu:** katalog, z którego załadowano tę umiejętność, określa harness, który konfigurujesz. Wymień każdy inny znaleziony harness wraz ze ścieżką dowodu; zapytaj raz — oferując wykryte opcje — tylko wtedy, gdy potrzebny jest również inny harness lub ma już konfigurację hooków.

## Krok 3 — Wykryj toolchain

Czytaj manifest i konfigurację, nie polegaj na pamięci. Dla każdej bramki zapisz dokładne polecenie używane przez to repozytorium:

- **Lint / formatowanie** — linter projektu oraz to, czy akceptuje ścieżkę pojedynczego pliku (ESLint, Biome, Ruff, golangci-lint, RuboCop…). Preferuj lokalny binarny program (`npx`, `pnpm exec`, `uv run`, …), którego repozytorium już używa. Wyprowadź sprawdzane rozszerzenia plików z konfiguracji lintowania, a nie z przykładów (np. dodaj `.astro`, gdy skonfigurowano `eslint-plugin-astro`, analogicznie `.vue` / `.svelte`). **Brak jakiegokolwiek lintera:** sprawdzeniem dla każdej edycji są diagnostyki typecheckera filtrowane do edytowanego pliku oraz `node --check` dla zwykłego JavaScriptu (`check-edited-file.sh` w referencji Claude Code); zarekomenduj linter w raporcie, ale go nie instaluj.
- **Typecheck** — polecenie dla całego projektu (`tsc --noEmit`, `astro check`, `mypy`, `cargo check`, …) oraz przybliżony czas jego działania. Frameworki z generowanymi typami wymagają najpierw kroku synchronizacji (`tsc` kończy się niepowodzeniem dla modułów `astro:*`, dopóki `astro sync` nie wygeneruje `.astro/`; `astro check` synchronizuje sam, ale jest wolniejszy). Wygenerowane katalogi są zwykle ignorowane przez git, więc synchronizacja naprawiająca bazowy stan powinna należeć do skryptu końca tury, a nie do jednorazowego polecenia.
- **Stan bazowy** — uruchom każde sprawdzenie końca tury raz na nietkniętym drzewie. Jeśli już jest czerwone (brakujące wygenerowane typy, zagnieżdżony pakiet z niezainstalowanymi zależnościami objęty przez główne include `**/*`, …): napraw warunek wstępny (wygeneruj typy), zawęź polecenie (projektowy tsconfig, filtr ścieżek, diagnostyki ograniczone do zmienionych plików) albo zgłoś to jako blokadę. Nigdy nie przekazuj hooka Stop, który blokuje na czystym drzewie.
  **Czerwony z powodu hosta, a nie kodu** (test przypięty do dokładnej wersji narzędzia, test trybu pliku zależny od `umask`, współdzielona usługa lokalna): skrypt wykrywa ten warunek, pomija wyłącznie dotkniętą część i informuje o tym w swoim wyjściu (wzorzec `SKIPPED` w referencji). Jeśli możesz, napraw środowisko poza hookiem; ciche pominięcie nigdy nie jest dopuszczalne.
- **Testy** — runner oraz to, czy ma tryb powiązanych testów (`vitest related <file> --run`, `jest --findRelatedTests <file> --passWithNoTests`, `pytest` ze ścieżką, …). Zanotuj, co runner robi, gdy żaden test nie pasuje (czy kończy się kodem 0). **Brak trybu powiązanego** (`node --test`, `bun test`): wybierz pliki testowe importujące edytowany moduł za pomocą `git grep` po plikach testowych (`related-tests-by-import.sh` w referencji Claude Code); jeden poziom importu, przemiatanie na końcu tury i bramka commita obejmują resztę. Zmierz raz czas całego pakietu testów jednostkowych: jeśli kończy się w około 30 s lub szybciej, skrypt końca tury uruchamia całość (dzięki temu wykrywa też czerwony test w module, który agent tylko zaimportował); w przeciwnym razie uruchamia testy powiązane ze zmienionymi plikami.
- **Menedżer git-hooków** — Husky, lint-staged, Lefthook, pre-commit lub brak. Istniejące git hooki nigdy nie są modyfikowane przez tę umiejętność.
- **Wymagania wstępne skryptów** — `jq` dla skryptów bash albo Node/Python, jeśli skrypt inny niż bash jest bezpieczniejszy (Windows bez Git Bash).

## Krok 4 — Przypisz bramki do momentów; przeprowadź audyt istniejących elementów

**Momenty**, najpierw najtańszy sygnał:

| Moment | Należy tutaj | Dociera do agenta |
| --- | --- | --- |
| Dla każdej edycji | Lint/formatowanie edytowanego pliku; powiązane testy, gdy kończą się w sekundy | Tak |
| Koniec tury | Lint + testy dla każdego pliku zmienionego w tej turze; typecheck całego projektu | Tak |
| Przed commitem | Lint + testy na plikach w stage (wychwytuje edycje dokonane bez agenta) | Nie |
| Przed push | Cięższe pakiety, lokalne e2e | Nie |
| CI | Integracja, współdzielony stan, infrastruktura niedostępna lokalnie | Nie |

Heurystyka szybkości: **im wolniejsze sprawdzenie, tym rzadszy moment.** Kilka sekund pasuje do każdej edycji; dziesiątki sekund lub zakres całego projektu należą do końca tury; minuty należą do commita, push lub CI.

Moment dla każdej edycji widzi wyłącznie narzędzia edycji harnessa. Agenci przepisują też pliki przez polecenia powłoki (`cat > file <<EOF`, `sed -i`), których nie otrzymuje żaden hook dla każdej edycji. Koniec tury jest zatem siatką bezpieczeństwa dla całej tury, nie tylko momentem typecheck: ponownie sprawdza każdy zmieniony plik z `git diff`.

**Odroczenia.** Gdy plan testów jawnie odracza bramkę, która stałaby się hookiem (na przykład `post-edit hook — deferred, not v1`), zacytuj użytkownikowi odroczenie i jego powód, a następnie zapytaj **raz**: skonfigurować mimo to czy uszanować odroczenie? Zapisz odpowiedź jako `override` lub `skip` w raporcie. Nie pytaj ponownie o każdy hook.

**Przeprowadź audyt istniejącej konfiguracji hooków przed zaproponowaniem czegokolwiek.** Przeczytaj pliki konfiguracji hooków harnessa (ścieżki w referencji) oraz każdy skrypt w jego katalogu hooków, w tym skrypty, do których nie odwołuje się żadna konfiguracja (np. osierocony `.claude/hooks/run-related-tests.mjs`, który wypisuje tylko na stdout). Dla każdego istniejącego hooka nazwij konkretne wady, na przykład:

- lint całego projektu lub `--fix .` przy każdej edycji (wolne, dotyka plików, których agent nie edytował, zgłasza stare błędy jako szum);
- polecenie, którego niepowodzenie kończy się kodem traktowanym przez harness jako nieblokujący lub wypisuje do kanału, który nigdy nie dociera do agenta (np. exit 1 + stdout, gdy harness przekazuje tylko stderr przy exit 2);
- limity czasu wyglądające jak milisekundy (`10000`, `30000`), gdy harness oczekuje sekund;
- typecheck całego projektu przy każdej edycji zamiast na końcu tury;
- hook końca tury bez zabezpieczenia przed ponowną próbą (może zapętlić się aż do limitu harnessa);
- to samo sprawdzenie zarejestrowane dwukrotnie (Cursor i Copilot mogą importować `.claude/settings*.json` — patrz ich referencje).

Przedstaw razem mapę momentów i ustalenia audytu jako propozycję. Poczekaj na zgodę użytkownika przed zapisaniem plików — **chyba że żądanie już jest taką zgodą**: użytkownik poprosił o skonfigurowanie konkretnych hooków w tym repozytorium, a propozycja nie dodaje niczego, o co nie prosił (brak zastąpienia odroczenia, brak zastąpionego hooka, brak zmiany poza katalogiem hooków i konfiguracją). Wtedy przedstaw propozycję i kontynuuj; pytaj tylko o to, co wykracza poza żądanie.

## Krok 5 — Załaduj referencję harnessa

Przeczytaj `references/<harness>.md` dla każdego harnessa, który skonfigurujesz:

- `references/anthropic.md` — Claude Code
- `references/cursor.md`
- `references/codex.md`
- `references/copilot.md`
- `references/other-harnesses.md` — Devin Desktop, Gemini CLI, OpenCode, Kiro, Junie: wyłącznie linki i uwagi o możliwościach. Dla nich wyjaśnij ograniczenie i wskaż dokumentację zamiast generować konfigurację, której nie możesz udowodnić.

Każda referencja zaczyna się od `Verified on:` oraz kanonicznych URL-i dokumentacji. Jeśli możesz przeglądać internet, otwórz podlinkowaną dokumentację i ponownie sprawdź pole payloadu dla edytowanego pliku, kanał docierający do agenta oraz jednostkę limitu czasu. W przypadku konfliktu postępuj zgodnie z aktualną dokumentacją i zapisz rozbieżność w raporcie (`reference says X, doc now says Y`).

## Krok 6 — Wygeneruj konfigurację i skrypty

Postępuj zgodnie z minimalnymi przykładami z referencji; dostosuj polecenia do toolchaina z Kroku 3.

- **Skrypt dla każdej edycji** — odczytuje payload ze stdin, wyodrębnia ścieżkę edytowanego pliku za pomocą pól wskazanych przez referencję, kończy się powodzeniem, gdy ścieżki brakuje lub typ pliku nie jest sprawdzany, i uruchamia sprawdzenie **wyłącznie na tym pliku**. W razie niepowodzenia wysyła krótki nagłówek oraz wyjście narzędzia kanałem docierającym do agenta.
- **Skrypt końca tury** — przemiata turę: zbiera zmienione i nowe pliki (`git diff --name-only HEAD` plus nieśledzone), kończy się wcześniej, gdy ich nie ma, uruchamia sprawdzenia dla każdej edycji na wszystkich z nich (lint na objętych plikach; powiązane testy albo cały pakiet jednostkowy, gdy Krok 3 wykazał, że jest szybki), następnie typecheck całego projektu i zgłasza każde niepowodzenie w jednej wiadomości. Uwzględnia flagę ponownej próby harnessa (`stop_hook_active` w Claude Code lub odpowiednik wskazany przez referencję), aby agent otrzymał **jedną** szansę na naprawę, a potem mógł zakończyć pracę. To, czego nie może naprawić, pozostawia bramce commita. Utrzymuj łączny czas poniżej limitu (domyślnie 120 s); jeśli przemiatanie jest wolniejsze, najpierw ogranicz testy do tylko powiązanych.
- **Zwykłe wyjście** — wyjście hooka jest czytane przez model, nie terminal: `tsc --pretty false`, `grep --color=never`, `NO_COLOR=1 FORCE_COLOR=0` dla wszystkiego innego. Skrypty dziedziczą środowisko powłoki użytkownika (np. `GREP_OPTIONS=--color=always` psuje filtr grep), więc ustawiaj je jawnie.
- **Payloady są niezaufanymi kształtami wejścia.** Akceptuj każdy udokumentowany kształt: toleruj brakujące pola, pusty stdin i alternatywne nazwy pól; nigdy nie kończ hooka niepowodzeniem, ponieważ brakuje pola. Brakująca ścieżka oznacza „nic do sprawdzenia”, nie błąd.
- **Limity czasu** w jednostce oczekiwanej przez harness (zwykle sekundy): około 30 dla lintowania każdej edycji, 60 dla powiązanych testów, 120 dla typecheck — potem dostrój.
- **Ścieżki** — rozwiąż checkout w sposób pokazany przez referencję, nigdy przez samo `cd` do zmiennej katalogu projektu. W Claude Code `$CLAUDE_PROJECT_DIR` to katalog, w którym rozpoczęła się sesja, i staje się nieaktualny po `EnterWorktree`, a edycja w sąsiednim worktree nie należy ani do tej zmiennej, ani do `cwd`: polecenie znajduje skrypt przez `git rev-parse --show-toplevel`, skrypt dla każdej edycji pobiera checkout z edytowanego pliku (ścieżki względne rozwiązywane względem `cwd`; pliki z innych repozytoriów są pomijane), a skrypt końca tury przemiata payload `cwd` oraz każdy checkout zarejestrowany dla `session_id`. Uczyń skrypty wykonywalnymi (`chmod +x`).
- **Brak cichego powodzenia** — exit 0 oznacza „sprawdzono i czysto” albo „nic do sprawdzenia”. Brakujące narzędzie (`jq`, niezainstalowany linter), typechecker, który się nie uruchomił, lub wrapper taki jak `[ -x script ] && exec script; exit 0` muszą kończyć się widocznym niepowodzeniem (kanał sprzężenia zwrotnego lub komunikat widoczny dla użytkownika), nigdy powodzeniem.
- **Konfiguracja commitowana** — sprawdź, czy pliki hooków nie są ignorowane (`git check-ignore -v .claude/settings.json`). Ignorowany katalog hooków istnieje tylko na jednym dysku; zaproponuj ponowne uwzględnienie z referencji i pokaż diff `.gitignore`.
- **Windows** — zanotuj powłokę używaną przez harness (Git Bash, PowerShell, pole polecenia zależne od OS). Jeśli bash lub `jq` nie są dostępne, wygeneruj zamiast tego skrypt Node.
- **Istniejąca konfiguracja** — scal ją, zachowaj niezwiązane hooki, zastąp tylko wadliwe wpisy wymienione w Kroku 4 i pokaż diff przed zapisaniem. Skrypt pozostawiony przez zastąpiony lub osierocony hook pozostaje na dysku: wymień go w raporcie i zalecaj usunięcie; nigdy nie usuwaj go po cichu.
- **Podwójna rejestracja** — hooki `.claude/settings*.json` są również uruchamiane przez Cursor (import domyślnie włączony), przez Copilot CLI oraz przez VS Code, gdy `chat.useClaudeHooks` jest włączone. Jeśli jedno z nich jest używane, a `.claude/settings*.json` już zawiera hooki, nie rejestruj ponownie tego samego sprawdzenia w jego natywnej konfiguracji bez uwzględnienia importu (zobacz `references/cursor.md`, `references/copilot.md`).

## Krok 7 — Udowodnij przed przekazaniem, jako commitowany test

Dowód jest **plikiem testowym commitowanym do repozytorium**, uruchamianym przez własny runner testów repozytorium, a nie jednorazową sekwencją poleceń powłoki. Hooki się zmieniają; dowód, którego nikt nie może uruchomić ponownie, przestaje cokolwiek udowadniać po pierwszej edycji.

Nazwij go `agent-hooks.test.*` i umieść obok istniejących testów narzędziowych repozytorium (w `scripts/__tests__/`, `tools/ci/` lub `tests/`, …) w runnerze, którego repozytorium już używa. Każdy przypadek przekazuje payload (kształt z referencji) do rzeczywistego skryptu i asercją sprawdza kod wyjścia oraz kanał wyjścia. Pracuj na tymczasowej kopii albo jednorazowym git repo/worktree, nigdy na plikach w drzewie dewelopera. Stubuj tylko to, co jest wolne lub nieobecne w środowisku testowym (binarny linter na `PATH`, który oznacza marker), zachowaj rzeczywiste git, `jq` i skrypty.

Przypadki:

1. **Uszkodzony plik** — celowy, oczywisty błąd w pliku objętym sprawdzeniem (nieużywana zmienna, nieprawidłowy typ). Oczekuj blokującego sygnału lub sygnału zwrotnego udokumentowanego przez referencję oraz komunikatu nazywającego plik i problem. Dla skryptów uruchamiających testy błąd musi być behawioralny (nieudana asercja): błędy samych typów nie powodują niepowodzenia Vitest, który usuwa typy.
2. **Czysty plik** — oczekuj powodzenia i braku blokującego wyjścia. Dla skryptów końca tury wymaga to zielonego stanu bazowego z Kroku 3.
3. **Pomijany typ** — plik nieobjęty sprawdzeniem (np. `README.md`). Oczekuj powodzenia.
4. **Nieistniejący plik** — payload wskazujący ścieżkę, która nie istnieje. Oczekuj powodzenia.
5. **Pusty payload** — `{}` oraz payload nieparsowalny lub bez ścieżki (np. `not json`, wywołanie narzędzia bez ścieżki). Oczekuj powodzenia.
6. **Koniec tury z ustawioną flagą ponownej próby** — oczekuj powodzenia nawet wtedy, gdy błąd nadal występuje.
7. **Edycja omijająca hook dla każdej edycji** — błąd lintowania zapisany bezpośrednio na dysku, bez payloadu dla każdej edycji, skrypt końca tury. Oczekuj, że zablokuje i nazwie ten plik. Gdy nie ma żadnych zmienionych plików, oczekuj powodzenia bez uruchamiania jakiegokolwiek sprawdzenia.
8. **Rozwiązywanie checkoutu** — zmienna katalogu projektu wskazująca inny checkout zawierający błąd: hooki sprawdzają checkout sesji i pozostają zielone. Ścieżka względna rozwiązuje się względem `cwd`. Uszkodzony plik z innego repozytorium jest pomijany. Edycja w sąsiednim worktree jest przemiatania przez skrypt końca tury. Każde `command` z konfiguracji, uruchomione z worktree przy ustawionej zmiennej katalogu projektu na nieistniejącą ścieżkę, dociera do wykonywalnego skryptu.
9. **Brak cichego powodzenia** — brakujący linter lub typechecker: oczekuj sygnału niepowodzenia, nie powodzenia.
10. **Kształty specyficzne dla harnessa** — dodatkowe przypadki wymienione przez referencję (np. Codex: payload inny niż patch, patch wielu plików, `cwd` w podkatalogu).

Raz celowo uszkodź sam test: cofnij jedną poprawkę w skrypcie (np. usuń zabezpieczenie przed ponowną próbą) i obserwuj, jak pasujący przypadek staje się czerwony, a następnie przywróć ją. Podłącz test do bramki już uruchamianej przez repozytorium (pakiet jednostkowy, `verify`, pre-push), ograniczając go do zmian pod katalogiem hooków, jeśli pakiet jest wolny. Nie dodawaj zadania CI.

Cofnij każdy celowy błąd i potwierdź, że `git status` pokazuje tylko pliki, które zamierzałeś utworzyć lub zmienić. Jeśli przypadek kończy się niepowodzeniem, napraw skrypt i uruchom test ponownie. Nigdy nie zgłaszaj hooka jako działającego wyłącznie na podstawie konfiguracji.

## Krok 8 — Raport

Wypisz zwięzły raport:

- **Wejścia** — ścieżka planu testów (lub `No test plan found — gates derived from the toolchain`), harness(y) ze ścieżkami dowodów, polecenia toolchaina, stan bazowy końca tury (zielony, naprawiony, zawężony lub blokada).
- **Odroczenia** — każde cytowane odroczenie oraz odpowiedź użytkownika (`override` / `skip`).
- **Audyt** — wady znalezione w istniejącej konfiguracji hooków i to, co je zastąpiło; pozostawione skrypty (osierocone lub zastąpione) wraz z zaleceniem usunięcia.
- **Skonfigurowane** — dla każdego harnessa: pliki konfiguracji, skrypty, zdarzenia, limity czasu; scalony diff.
- **Dowód** — commitowany plik testowy, polecenie go uruchamiające, jego wynik oraz celowe uszkodzenie, które obserwowałeś jako czerwone.
- **Wciąż wymagane od użytkownika** — kroki zaufania lub zatwierdzenia (np. przegląd Codex `/hooks`, zaufanie do workspace Cursor, ponowne uruchomienie sesji) oraz sposób potwierdzenia, że hook jest załadowany (menu hooków harnessa lub log debugowania).
- **Rozbieżności referencji** — każda różnica między referencją a aktualną dokumentacją.
- **Poza zasięgiem** — czego te hooki nie mogą udowodnić: zachowania uruchomionej aplikacji (komponent kliencki, który nigdy się nie hydratuje, routing, polityki bazy danych, efekty uboczne). Lint, typy i testy jednostkowe mogą wszystkie przejść, podczas gdy funkcja jest zepsuta. Nazwij zagrożone powierzchnie repozytorium i wskaż weryfikację E2E lub w przeglądarce; nie konfiguruj jej tutaj.
- **Zalecane bramki git (niezapisane)** — co należy do pre-commit i pre-push dla tego repozytorium, z istniejącym menedżerem hooków, jeśli taki jest. Nie twórz ani nie edytuj konfiguracji git-hooków.
- **Następny krok** — poproś agenta o edycję pliku z błędem lintowania, następnie z błędem typu, i obserwuj, jak naprawia oba w tej samej sesji. Następnie poproś go o przepisanie pliku przez polecenie powłoki z błędem lintowania i obserwuj, jak hook końca tury odsyła go z powrotem.

## Czego ta umiejętność NIE robi

- Nie zmienia bramek ani strategii ryzyka — od tego jest `/10x-test-plan`.
- Nie pisze testów aplikacji, scenariuszy E2E ani potoków CI (jedyny test, który pisze, to test hooka z Kroku 7).
- Nie instaluje ani nie rekonfiguruje menedżerów git-hooków (Husky, Lefthook, pre-commit).
- Nie generuje konfiguracji dla harnessów, których nie może udowodnić (zobacz `references/other-harnesses.md`).

## Interaktywne pytania — niezależne od hosta

Gdy ta umiejętność mówi „zapytaj użytkownika”, użyj dowolnego narzędzia pytań udostępnionego przez hosta; jeśli żadne nie istnieje, zapytaj zwykłym tekstem z oznaczonymi opcjami. Zadaj najwyżej: który harness (tylko jeśli niejednoznaczne), czy zastąpić odroczenie (raz) oraz pytanie o zgodę po propozycji (pomijane, gdy żądanie już jest tą zgodą, Krok 4).

## Ton

Zwięzły, nakazowy, konkretny. Nazywaj pliki, polecenia i kody wyjścia. Bez języka marketingowego.