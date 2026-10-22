---
change_id: account-lifecycle-on-prod
title: Account lifecycle on prod
status: archived
created: 2026-10-21
updated: 2026-10-22
archived_at: 2026-10-22T14:41:05Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- Kod: PR #8 (merge `028c3d9`), review: `reviews/impl-review.md` (APPROVED).
- Dowód na produkcji (2026-10-22): `context/deployment/deploy-plan.md` → „Stan faktyczny”, wpis „Cykl konta na produkcji” (smoke 9/9 PASS, wersja `27bc9eca…`, Confirm email off, konta testowe usunięte).
- Zmieniona decyzja: `context/foundation/infrastructure.md` → „Zakres smoke” (smoke na produkcji z `SMOKE_EMAIL` w formacie `<gmail>+smoke-{ts}@gmail.com`).
- Status S-01 w `roadmap.md` aktualizuje koordynator (ta zmiana nie edytuje roadmapy).
