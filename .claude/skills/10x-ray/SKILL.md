---
name: 10x-ray
description: >
  Learn how a skill works by watching it run. Maps the target skill's anatomy
  (steps, loops, fan-outs, human gates, branches, and why each exists), runs
  the skill in a background subagent, and reveals the map concept by concept
  as the run reaches each step, ending with a full "skill anatomy". The
  skill's own questions are handed to the user exactly as the skill would ask
  them. Use when the user invokes /10x-ray <skill> [args], or asks to
  "x-ray", "watch", "trace", "visualize" or "understand" a skill by running
  it. `--mode html` shows the same view on a live page in the browser instead
  of the terminal.
argument-hint: "[--mode terminal|html] <skill-name> [args for that skill]"
allowed-tools:
  - Bash
  - Read
  - Write
  - Agent
  - Monitor
  - SendMessage
  - TaskStop
  - AskUserQuestion
---
# 10x-ray

Jesteś obserwatorem i interpretatorem. Czytasz docelową umiejętność i odwzorowujesz
jej anatomię, subagent działający w tle (worker) uruchamia ją i oznacza każde zdarzenie
krokiem mapy, w którym się znajduje, a Monitor przekształca to w ramki na poziomie
koncepcji: „umiejętność teraz rozdziela pracę między subagentów i oto dlaczego”.
Użytkownik powinien wyjść ze zrozumieniem projektu umiejętności, a nie tylko po
obejrzeniu przewijających się wywołań narzędzi. Pośredniczysz też w każdym pytaniu,
które umiejętność kieruje do człowieka.

Skrypt: `XRAY=<this skill's base directory>/scripts/xray.mjs`. Harness
wypisuje katalog bazowy podczas ładowania umiejętności („Base directory for this
skill: …”); umiejętność może znajdować się w `.claude/skills/` projektu albo w
`~/.claude/skills/`, więc nigdy nie wyprowadzaj go z bieżącego repozytorium. Używaj
wszędzie ścieżki bezwzględnej; worker także jej potrzebuje. Wymaga Node 18+.

## 1. Przeanalizuj wywołanie

- Początkowe `--mode <terminal|html>` (lub `--mode=<…>`) wybiera miejsce
  wyświetlania widoku; domyślnie `terminal`. Liczy się tylko flaga trybu *przed*
  nazwą umiejętności; wszystko po nazwie umiejętności należy do tej umiejętności.
- Następny token = nazwa docelowej umiejętności (usuń początkowy `/`). Wszystko po nim
  = `ARGS` dla tej umiejętności, przekazywane dosłownie.
- Nie podano umiejętności: wyświetl kilka umiejętności z listy dostępnych umiejętności
  i zapytaj, którą uruchomić. Na tym zakończ.
- Cel musi znajdować się na liście dostępnych umiejętności. Jeśli go tam nie ma, powiedz
  to i zasugeruj najbliższe nazwy. Odmów użycia samego `10x-ray` jako celu.
- `LANG` = język, w którym użytkownik pisze do Ciebie w tej rozmowie: `pl`
  dla polskiego, `en` dla każdego innego. Ustawia każdy widoczny dla użytkownika
  etykietę, język, w którym piszesz mapę, oraz narrację workera.

## 2. Zmapuj umiejętność

Przeczytaj `references/mapping-guide.md` (schemat, wzorce, sposób pisania koncepcji)
oraz, za pierwszym razem w sesji, `references/example-map-10x-research.json`.
Następnie przeczytaj SKILL.md celu (`.claude/skills/<skill>/` lub
`~/.claude/skills/<skill>/`) oraz pliki, których zaleca przestrzegać w ramach swojego
przepływu pracy. Zapisz mapę do pliku tymczasowego i zarejestruj ją:

```bash
LOG=$(node "$XRAY" init <skill> "<ARGS>" --lang <LANG>)
node "$XRAY" map "$LOG" <map.json>      # validates; fix and rerun on error
node "$XRAY" emit "$LOG" start - "Worker launched: /<skill> <ARGS>"
```

Zachowaj mapę dla siebie. Nie wypisuj jej ani nie opisuj kroków umiejętności na
czacie: użytkownik odkrywa je po kolei, gdy uruchomienie do nich dociera.

## 3. Uruchom widoki

**tylko tryb html:** uruchom serwer strony przez Bash z
`run_in_background: true`: `node "<XRAY>" serve "<LOG>"`. Odczytaj jego wyjście
w poszukiwaniu linii `x-ray page: http://127.0.0.1:<port>/` (pojawia się w ciągu
sekundy), a następnie `open <url>`. Strona (`assets/xray.html`) pokazuje jedną kartę
na ujawniony krok, z jego koncepcją, bieżącą linią „teraz”, notatkami i zwiniętym
śladem agenta; ścieżki fan-out zagnieżdżają się w niej. Po zakończeniu uruchomienia
serwer zapisuje samodzielny zrzut obok logu (`<LOG>.html`).

Uruchom Monitor:

- `command`: `node "<XRAY>" watch "<LOG>"` w trybie terminalowym,
  `node "<XRAY>" watch "<LOG>" --quiet` w trybie html (ścieżki bezwzględne,
  już rozwinięte). Cichy watch wybudza Cię tylko dla pytań i końca
  uruchomienia. Dodaj `--verbose` tylko jeśli użytkownik chce zobaczyć każde działanie agenta.
- `description`: `x-ray of /<skill>`
- `timeout_ms`: `1800000`

`watch` pamięta, co już wyrenderował, więc ponowne uzbrojenie nigdy nie powtarza
ramki.

## 4. Uruchom workera

Przeczytaj `references/worker-brief.md`, weź wszystko poniżej jego linii `---` i
wypełnij `{{SKILL}}`, `{{ARGS}}`, `{{LANG}}`, `{{XRAY}}`, `{{LOG}}` oraz `{{NODES}}`. Dla
`{{NODES}}` użyj jednej linii na węzeł mapy, `<id>  <pattern>  <title>`, z
dziećmi wciętymi o dwie spacje pod ich rodzicem. Uruchom go za pomocą narzędzia Agent:
`subagent_type: "general-purpose"`, opis `x-ray: /<skill>`. Działa w tle.
Zanotuj jego identyfikator agenta dla SendMessage.

Powiedz użytkownikowi w jednej linii, że x-ray działa (tryb html: wraz z adresem URL
strony), a następnie zakończ swoją turę.

## 5. Pętla przekazywania

**tryb terminalowy**, przy każdym powiadomieniu Monitora:

- Pierwsza linia to linia statusu `x-ray tick …`, którą host już
  pokazuje w swoim wierszu powiadomień. Usuń ją i wypisz resztę dosłownie wewnątrz
  bloku ```` ```text ````. Powiadomienia przychodzą z escapowaniem HTML: zamień `&amp;`
  `&lt;` `&gt;` z powrotem na `&` `<` `>`. Nie zmieniaj niczego innego. Ramki
  niosą naukę (koncepcja na krok, notatki dla wyników), więc dodaj co najwyżej
  jedną krótką linię pod blokiem, tylko gdy ramka potrzebuje kontekstu, na który
  użytkownik może zareagować (np. `WARNING`). Nie przewiduj nadchodzących kroków.
- Monitor wygasł i nie ma jeszcze ramki anatomii: uzbrój ponownie to samo polecenie.

**tryb html:** nie wypisuj ramek. Ciche ticki przychodzą tylko dla pytań
(obsłuż je jak poniżej) oraz dla końca uruchomienia (wypisz ramkę anatomii
w bloku, a następnie wynik).

### Przekazanie kontroli użytkownikowi

Gdy umiejętność o coś pyta, użytkownik otrzymuje dokładnie tę samą interakcję,
którą by pokazała. Działaj na podstawie **zdarzenia Monitora**, a nie zakończenia
workera. Gdy linia tick kończy się na `· ask=<payload file>`:

1. Przekaż ramki jak zwykle (tryb terminalowy).
2. Wykonaj `cat` na pliku payload i dokładnie odtwórz element podrzędny:
   - `"mode":"choice"`: wywołaj AskUserQuestion z niezmienioną tablicą
     `questions` z payload: to samo sformułowanie, nagłówki, opcje, opisy,
     `multiSelect`. Niczego nie przeformułowuj, nie łącz ani nie skracaj.
   - `"mode":"text"`: wypisz `prompt` z payload dosłownie jako swoją wiadomość,
     poza blokiem, i zakończ swoją turę. Następna wiadomość użytkownika jest
     odpowiedzią.
3. Zapisz odpowiedź w śladzie:
   `node "$XRAY" answer "$LOG" "<short form, e.g. Depth: Quick overview · Focus: Identity & sessions>"`.
4. Wyślij ją workerowi przez SendMessage (jego identyfikator agenta): dla wyborów,
   `User answer:`, a następnie po jednej linii na pytanie, `<header>: <chosen labels>`,
   oraz dowolny wolny tekst wpisany w Other lub notatkach; dla trybu tekstowego
   odpowiedź dosłownie. Jeśli zakończenie `NEEDS_INPUT` workera jeszcze nie nadeszło,
   najpierw na nie poczekaj, aby wiadomość wznowiła workera zamiast trafić w środek tury.
5. Uzbrój Monitor ponownie, jeśli w międzyczasie się zatrzymał.

Jeśli AskUserQuestion zostanie odrzucone lub użytkownik odpowie poza opcjami, przekaż
jego słowa jako odpowiedź. Nie pytaj ponownie. Nie wypisuj komunikatu zakończenia
`NEEDS_INPUT` workera; nie dodaje on nic poza payload.

### Koniec uruchomienia

Przy końcowym powiadomieniu o zakończeniu workera (nie `NEEDS_INPUT`):

- Jeśli log nie ma zdarzenia `done`/`fail` (worker uległ awarii lub zapomniał), wyemituj
  je za niego, aby anatomia się wyrenderowała:
  `node "$XRAY" emit "$LOG" fail - "Worker ended without a final event" "<one-line reason>"`
  (`done` zamiast tego, jeśli worker wyraźnie odniósł sukces).
- Przekaż ramkę anatomii z Monitora. Wymienia ona każdy zmapowany krok,
  odwiedzony lub nie, więc jest to moment, gdy widoczny staje się cały projekt.
- tryb html: zatrzymaj serwer strony przez TaskStop, gdy jego wyjście pokaże
  linię `x-ray snapshot:`, i podaj użytkownikowi ścieżkę do zrzutu.
- Podaj rzeczywisty wynik umiejętności z końcowej wiadomości workera: utworzone
  pliki wraz ze ścieżkami, kluczowe ustalenia lub decyzje, otwarte kolejne kroki.
  Następnie, w 2–4 zdaniach, podaj najważniejszy wniosek o projekcie umiejętności:
  jedną lub dwie idee, które sprawiają, że działa (np. „tanie pytanie o zakres przed
  kosztownym fan-out”). Taki jest cel x-ray.

## 6. Wczesne zatrzymanie

Jeśli użytkownik poprosi o zatrzymanie, zatrzymaj workera przez TaskStop, a następnie
wyemituj `fail` z tytułem `Stopped by user` (oznaczonym bieżącym krokiem). Monitor
sam renderuje anatomię i kończy działanie (najpierw uzbrój go ponownie, jeśli
wygasł). Przekaż ją i zgłoś, co worker zdążył już zmienić na dysku.