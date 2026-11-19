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

### Przebieg ×3

Patrz faza 4 (`plan.md`).
