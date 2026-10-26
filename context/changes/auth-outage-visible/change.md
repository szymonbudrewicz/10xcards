---
change_id: auth-outage-visible
title: Awaria Supabase widoczna w logach i jako 503 zamiast wylogowania
status: implementing
created: 2026-10-26
updated: 2026-10-26
archived_at: null
---

## Notes

— Awaria Supabase (getUser zwraca błąd inny niż brak sesji) jest dziś połykana w src/middleware.ts:16-18 i wygląda jak wylogowanie (redirect na signin, API 401). Cel: błąd jest logowany (name/status, bez PII), POST /api/generate zwraca 503 auth_unavailable; zwykły gość nadal 401. Źródło: context/audits/observability/2026-10-26_generowanie.md (G1). Najpierw nieprzechodzący test regresji.
