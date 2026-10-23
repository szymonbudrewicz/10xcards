---
change_id: testing-generation-guard
title: Test rollout phase 1 — generation guard (bad input, AI errors, 401, no text leaks)
status: implemented
created: 2026-10-22
updated: 2026-10-23
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Ochrona generowania".
Risks covered: #4 (złe wejście / błąd AI przy generowaniu), #5 (niezalogowany wywołuje płatne AI lub wklejony tekst trafia do logów/magazynu). Test types planned: unit + integration (Vitest); this phase also bootstraps the test runner.
Risk response intent:
- #4: prove that empty text and text > 10 000 chars do not call AI and return a Polish error in { error: { code, message } }; an AI error leaves the pasted text in place; the result has at most 10 front/back proposals.
- #5: prove that without a session the generation endpoint returns 401 AND the AI provider is never called; neither logs nor the database contain the pasted text.
After creating the folder, follow the downstream continuation rule
