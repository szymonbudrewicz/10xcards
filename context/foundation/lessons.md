# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Endpointy API wywołujące AI wymagają sesji (401)

- **Context**: nowe endpointy w src/pages/api/, szczególnie te, które będą wywoływać płatne AI (np. /api/generate).
- **Problem**: agent za każdym razem zgaduje inaczej: raz dodał sprawdzanie locals.user i zwrócił 401, w innych przebiegach pominął autoryzację całkiem. PROTECTED_ROUTES w middleware przekierowuje na stronę logowania zamiast zwracać 401, więc nie nadaje się do endpointów JSON.
- **Rule**: Endpointy API wywołujące AI sprawdzają locals.user i bez sesji zwracają 401 w formacie { error: { code, message } }. Nie polegaj na PROTECTED_ROUTES, bo przekierowuje zamiast zwracać 401.
- **Applies to**: plan, implement, impl-review
