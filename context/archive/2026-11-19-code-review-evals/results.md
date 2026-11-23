# Wyniki evali recenzenta — code-review-evals

Konfiguracja: `packages/code-reviewer/evals/promptfooconfig.yaml` (commit fazy 2 + poprawki fazy 3), promptfoo 0.126.0, grader `openrouter:anthropic/claude-sonnet-5.5`. Komórka = jeden przebieg recenzenta (`runReview`) na jednym przypadku. PASS = wszystkie asercje zaliczone (is-json ze schematem, skala ocen 1–10, zgodność `modelVerdict` z regułą, `llm-rubric` plik/linia, asercje przypadku).

## Przebieg ×1 — 2026-11-19

Wynik promptfoo: 13 PASS, 6 FAIL, 1 ERROR z 20 komórek; exit 100; czas 2 min 14 s (współbieżność 4).
Koszt: recenzenci $0.0766 (suma `cost` z OpenRoutera; komórka z błędem bez raportu kosztu, szac. ~$0.02 przy 16 000 tokenów wyjścia po cenie katalogowej) + grader ~$0.15 (32 899 tokenów wejścia × $2/M + 8 088 wyjścia × $10/M) ≈ **$0.25** łącznie. Smoke przed przebiegiem: ~$0.02.

### Macierz (oceny: poprawność / izolacja / prywatność / konwencje / prostota / testy)

| Przypadek | glm-5.3@8000 | glm-5.3@no-cap | deepseek-v4.1-flash | gpt-6-luna |
| --- | --- | --- | --- | --- |
| user_id z body (fail, izolacja ≤ 3) | ❌ fail · 8/5/4/5/7/2 · $0.0006 · 6 s · Wafer · rsn 174 | ⚠️ ERROR `OutputTokenLimitError` (16 000 tokenów) · 104 s · rsn 7 322 | ✅ fail · 4/1/5/6/7/2 · $0.0014 · 17 s · InferenceNet | ❌ fail · 4/3/6/5/8/3 · $0.0010 · 20 s · OpenAI |
| wklejony tekst w logach (fail, prywatność ≤ 3) | ✅ fail · 9/8/2/7/8/7 · $0.0030 · 7 s · DigitalOcean | ✅ fail · 8/8/1/8/7/6 · $0.0347 · 66 s · Fireworks · rsn 5 994 | ❌ fail · 8/8/2/7/6/6 · $0.0009 · 5 s · Wafer | ✅ fail · 8/8/1/7/8/4 · $0.0005 · 12 s · OpenAI |
| service-role w bulk delete (fail, izolacja ≤ 3) | ❌ fail · 2/1/2/2/5/1 · $0.0026 · 8 s · Decart | ❌ fail · 2/1/3/4/6/2 · $0.0015 · 10 s · Wafer | ❌ fail · 2/1/3/3/6/2 · $0.0011 · 7 s · InferenceNet | ✅ fail · 3/1/5/5/7/2 · $0.0008 · 17 s · OpenAI |
| czysty test-only (pass) | ✅ pass · $0.0007 · 5 s | ✅ pass · $0.0116 · 45 s · rsn 4 762 | ✅ pass · $0.0009 · 10 s | ✅ pass · $0.0003 · 7 s |
| czysty UI (pass) | ✅ pass · $0.0051 · 3 s | ✅ pass · $0.0087 · 33 s · rsn 3 478 | ✅ pass · $0.0010 · 5 s | ✅ pass · $0.0004 · 7 s |
| **PASS** | **2/5** | **2/5** (+1 error) | **3/5** | **4/5** |

### Dlaczego komórki nie przeszły

- **glm-5.3@8000 · user_id** — jedyny poważny błąd jakości: uzasadnienia to śmieci (`"6"`, `"fiszki"`, `"e2e"`, `"string"`), `accountIsolation` = 5 (próg evala ≤ 3, próg reguły ≤ 4). Werdykt `fail` wyszedł tylko dzięki prywatności = 4 — przy prywatności 5 ten PR przeszedłby bramkę CI. Dostawca Wafer, 174 tokeny rozumowania.
- **glm-5.3@no-cap · user_id** — model wyczerpał 16 000 tokenów wyjścia na rozumowanie (104 s), brak werdyktu; to samo zjawisko co dwa pierwsze przebiegi CI na PR #29.
- **Pozostałe 5 FAIL** (glm@8000, glm@no-cap, deepseek ×2, gpt-6-luna) — wyłącznie ogólny `llm-rubric`: jedno uzasadnienie z oceną < 7 nie wskazuje pliku/linii. W 4 z 5 przypadków to kryterium **prostoty i zakresu (5)**, którego uzasadnienie dotyczy opisu PR-a, a nie kodu — rubryka wymaga pliku z diffa także tam, gdzie właściwym „miejscem” jest opis PR.

### Obserwacje

1. **Twarde progi (≤ 3) i werdykt**: deepseek i gpt-6-luna dały `fail` z niską oceną właściwej osi we wszystkich 3 przypadkach fail (izolacja 1–3, prywatność 1–2); glm@8000 raz dał izolację 5 przy `user_id` z body.
2. **Nadgorliwość**: brak — wszystkie 4 kolumny dały `pass` w obu czystych przypadkach (najniższa ocena 7).
3. **Limit rozumowania**: bez limitu glm-5.3 jest 5–15× droższy i 5–15× wolniejszy (33–104 s) bez poprawy ocen, a raz nie oddał werdyktu. Z limitem 8000 rozumowanie spada do 0–174 tokenów, a raz jakość uzasadnień się załamała — limit zapobiega przekroczeniu, ale nie gwarantuje jakości.
4. **Routing OpenRoutera**: glm-5.3 trafił do 6 różnych dostawców w 10 wywołaniach (Wafer, DigitalOcean, Decart, ModelRun, Fireworks); deepseek do 3; gpt-6-luna zawsze do OpenAI. Koszt glm@8000 dla podobnych diffów: $0.0006–0.0051 (8×).
5. **Rubryka a kryterium 5**: wymóg „plik/linia z diffa” dla prostoty i zakresu kłóci się z tym, że to kryterium ocenia też opis PR-a. Do decyzji: dopuścić w rubryce opis PR jako konkretne źródło dla tego kryterium (zmiana testu, nie promptu).

## Przebieg ×3 — 2026-11-19

Zmiany przed przebiegiem: rubryka ogólna dopuszcza opis PR jako konkretne źródło **tylko** dla `simplicityAndScope`, jednakowo dla wszystkich kolumn (decyzja użytkownika, obs. 5). Kolumna `glm-5.3@no-cap` pominięta (decyzja użytkownika: ×1 pokazał 5–15× wyższy koszt i czas bez poprawy ocen oraz brak werdyktu) — 3 kolumny × 5 przypadków × 3 = **45 komórek** (zamiast 60 z kryterium 4.1).
Wynik promptfoo: 30 PASS / 15 FAIL, exit 100. Koszt: recenzenci $0.072 + grader ~$0.37 (79 042 tokenów wejścia × $2/M + 20 753 wyjścia × $10/M) ≈ **$0.44**.

### (a) Werdykt i progi twardych reguł — podstawa decyzji

Asercja przypadku: `verdict` zgodny z oczekiwanym oraz oś twarda ≤ 3 (user_id, service-role: `accountIsolation`; pasted-text: `privacySecretsAiCost`).

| Przypadek | glm-5.3@8000 | deepseek-v4.1-flash | gpt-6-luna |
| --- | --- | --- | --- |
| user_id z body | **2/3** (izolacja 3, **4**, 3) | 3/3 (2, 1, 0*) | 3/3 (2, 2, 3) |
| wklejony tekst w logach | 3/3 (prywatność 1, 2, 2) | 3/3 (1, 2, 1) | 3/3 (1, 1, 1) |
| service-role | 3/3 (izolacja 1, 1, 2) | 3/3 (1, 1, 1) | 3/3 (1, 1, 1) |
| czysty test-only (pass) | 3/3 | 3/3 | 3/3 |
| czysty UI (pass) | 3/3 | 3/3 | 3/3 |
| **Suma (a)** | **14/15** | **15/15** | **15/15** |

* deepseek raz zwrócił **same zera** (0/0/0/0/0/0) — werdykt `fail` jest „poprawny” tylko dlatego, że 0 ≤ każdy próg; odrzuciła go asercja kontraktu (skala 1–10). To zdegenerowana odpowiedź, nie trafna ocena.

### (b) llm-rubric — uzasadnienia wskazują plik/linię i właściwy problem

| | glm-5.3@8000 | deepseek-v4.1-flash | gpt-6-luna |
| --- | --- | --- | --- |
| Suma (b) | 8/15 | 10/15 | **12/15** |
| Gdzie oblewa | user_id 0/3, pasted 1/3, service 1/3 | user_id 1/3, pasted 1/3, service 2/3 | service-role 0/3 (jedno kryterium < 7 bez pliku) |

### (c) Kontrakt i koszt

| | glm-5.3@8000 | deepseek-v4.1-flash | gpt-6-luna |
| --- | --- | --- | --- |
| Kontrakt (schemat, skala 1–10, `modelVerdict` = reguła) | 15/15 | **14/15** (zera) | 15/15 |
| Koszt recenzji (15 przebiegów) | $0.0459 | $0.0188 | **$0.0074** |
| Mediana kosztu / przebieg | $0.0016–0.0045 | $0.0008–0.0013 | **$0.0003–0.0007** |
| Mediana czasu / przebieg | 5.5–17.7 s | 6.3–13.0 s | 6.6–15.0 s |
| Dostawcy OpenRoutera | 12 różnych | 7 | 1 (OpenAI) |

### Wnioski

1. Na (a) **deepseek-v4.1-flash i gpt-6-luna mają 15/15**, glm-5.3@8000 14/15 — w jednym z trzech przebiegów zły PR (`user_id` z body) dostał izolację 4, czyli dokładnie próg reguły; przy prywatności > 4 przeszedłby bramkę CI. Łącznie z ×1 glm-5.3@8000 miał to samo zachowanie 2 razy na 4 próby tego przypadku.
2. Spośród 15/15 na (a) **gpt-6-luna jest stabilniejszy**: identyczne oceny twardej osi we wszystkich powtórzeniach, 0 zdegenerowanych odpowiedzi, jeden dostawca, najlepsza rubryka (12/15) i najniższy koszt (~2,5× taniej niż deepseek, ~6× taniej niż glm).
3. Limit rozumowania: `glm-5.3@no-cap` (×1) był 5–15× droższy i wolniejszy bez lepszych ocen i raz nie oddał werdyktu → **limit 8000 zostaje** jako bezpiecznik dla każdego modelu (gpt-6-luna zużywa 170–900 tokenów rozumowania, więc limit go nie ogranicza).

## Decyzja — 2026-11-19

- **Domyślny model recenzenta: `openai/gpt-6-luna`** (było `z-ai/glm-5.3`) w `packages/code-reviewer/src/cli.ts` i `.github/actions/ai-reviewer/action.yml` (input `model`). Podstawa: warstwa (a) 15/15 w ×3, stabilne oceny twardej osi, 0 zdegenerowanych odpowiedzi, najniższy koszt; (b) 12/15 jako drugorzędny sygnał. Decyzja użytkownika: wybór modelu przede wszystkim na podstawie (a).
- **Limit rozumowania: bez zmian, `REVIEW_MAX_REASONING_TOKENS=8000`** — bezpiecznik; `glm-5.3@no-cap` był 5–15× droższy i wolniejszy bez lepszych ocen i raz nie oddał werdyktu.
- Ryzyka przyjęte: kilka sekund dłuższa recenzja (6–17 s na przebieg); jeden dostawca upstream (OpenAI) przez OpenRouter.

### Przebieg potwierdzający — `gpt-6-luna` ×1

(a) 5/5, kontrakt 5/5, (b) 4/5 — service-role: jedno kryterium < 7 bez pliku/linii (jak w ×3). promptfoo exit 100 wyłącznie z powodu (b); krok 4.3 oceniany po (a) (decyzja użytkownika). Koszt: recenzje $0.0030 + grader ~$0.034 ≈ $0.04.

Łączny koszt evali w fazach 3–4: ~$0.02 (smoke) + ~$0.25 (×1) + ~$0.44 (×3) + ~$0.04 (potwierdzenie) ≈ **$0.75**.

## Faza 5 — krótsze uzasadnienia (2026-11-23)

Zmiana: prompt systemowy i opis pola `reason` w schemacie wymagają jednego zdania ≤ 250 znaków (szczegóły i poprawki w podsumowaniu); nowa deterministyczna asercja w `defaultTest` sprawdza długość i liczbę zdań każdego uzasadnienia.

Przebieg `gpt-6-luna` ×1: **5/5 PASS, exit 0** (33 s). (a) werdykt i progi: 5/5 (user_id izolacja 2, wklejony tekst prywatność 1, service-role izolacja 1, oba czyste `pass`); kontrakt 5/5; asercja długości 5/5 (najdłuższe uzasadnienie 155 znaków, wcześniej do 224); (b) llm-rubric 5/5 — pierwszy raz bez oblania service-role. Koszt: recenzje $0.0028 + grader ~$0.03 ≈ $0.03.

## Poprawka po PR #32 — lockfile'e wycięte z diffu (2026-11-23)

Obserwacja: recenzja CI na PR #32 (commit epilogu) dała fałszywy `fail` — poprawność 2/10 za „package.json bez aktualizacji package-lock.json”, choć `review.yml` celowo wycina lockfile'e z diffu, a job `ci` przeszedł `npm ci`. Ten sam model na niemal tym samym diffie dał wcześniej dwa razy `pass` (1 fałszywy alarm na 3 przebiegi).

- Nowy przypadek `dependency-without-lockfile.diff` (zależność + skrypt w `package.json`, bez locka): oczekiwany `pass`, poprawność i konwencje ≥ 7.
- **Nie odtwarza problemu**: na starym prompcie 3/3 PASS (oceny 9–10). Fałszywy alarm wystąpił tylko w dużym diffie (~109 tys. znaków); decyzja użytkownika: poprawka bez czerwonego testu, przypadek zostaje jako strażnik.
- Poprawka promptu: zdanie, że diff może nie zawierać lockfile'i, a ich zgodność sprawdza `npm ci` w CI.
- Po poprawce (`gpt-6-luna`): pełny zestaw ×1 **6/6 PASS, exit 0**; nowy przypadek ×2 2/2. (a) bez regresji (izolacja 3 / prywatność 1 / izolacja 1, oba czyste `pass`). Koszt łącznie z przebiegiem na starym prompcie: recenzje $0.005 + grader ~$0.04 ≈ **$0.05**.
