---
change_id: code-review-evals
title: Evale recenzenta AI w promptfoo jako bramka regresji
status: implementing
created: 2026-11-19
updated: 2026-11-19
archived_at: null
---

## Notes

Przeanalizuj obecny stan 'packages/code-reviewer' w kontekście wprowadzenia evali — możliwość ponownego użycia promptów, importowalność agenta itd. Pierwszy wybór narzędzia: promptfoo (zgodność ze stackiem: Node 24, TS ESM, AI SDK 7, OpenRouter). Użyj Web Search dla aktualnej dokumentacji. Cele: przypadki user_id z body → fail + niska accountIsolation, czysty diff → pass, logowanie wklejonego tekstu → fail z prywatności; asercje is-json, javascript (werdykt, progi), llm-rubric (plik/linia); 2–3 modele przez OpenRouter z kosztem i czasem; skrypt npm jako bramka regresji, bez sieci w npm test; ocena REVIEW_MAX_REASONING_TOKENS=8000.
