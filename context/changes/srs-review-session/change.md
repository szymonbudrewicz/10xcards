---
change_id: srs-review-session
title: Srs review session
status: preparing
created: 2026-10-20
updated: 2026-10-20
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- Z S-04 (`manage-saved-cards`): rola `authenticated` ma `update` na `cards` tylko dla kolumn `front` i `back` (grant kolumnowy). Zapis kolumn powtórek (np. termin, interwał, liczba powtórek) wymaga funkcji `security definer` albo rozszerzenia grantu kolumnowego w nowej migracji (zaczynającej się od `revoke all on cards from anon, authenticated`).
