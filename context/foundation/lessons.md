# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Endpointy API wywołujące AI wymagają sesji (401)

- **Context**: nowe endpointy w src/pages/api/, szczególnie te, które będą wywoływać płatne AI (np. /api/generate).
- **Problem**: agent za każdym razem zgaduje inaczej: raz dodał sprawdzanie locals.user i zwrócił 401, w innych przebiegach pominął autoryzację całkiem. PROTECTED_ROUTES w middleware przekierowuje na stronę logowania zamiast zwracać 401, więc nie nadaje się do endpointów JSON.
- **Rule**: Endpointy API wywołujące AI sprawdzają locals.user i bez sesji zwracają 401 w formacie { error: { code, message } }. Nie polegaj na PROTECTED_ROUTES, bo przekierowuje zamiast zwracać 401.
- **Applies to**: plan, implement, impl-review

## Sekret SUPABASE_URL: sprawdzaj wartość, nie tylko obecność nazwy

- **Context**: pierwsze wdrożenie na Cloudflare Workers, sekrety `SUPABASE_URL` i `SUPABASE_KEY` ustawiane przez `wrangler secret put` (i `.dev.vars` lokalnie).
- **Problem**: `SUPABASE_URL` był najpierw pusty, potem błędny. Objaw: najpierw komunikat „Supabase is not configured" (createClient() zwraca null), po wpisaniu błędnej wartości błąd 500. `wrangler secret list` pokazuje same nazwy, więc obie nazwy były „obecne" mimo złej wartości. Wcześniej zdarzył się też adres panelu zamiast adresu API (`.../dashboard/project/<ref>`, odpowiedź HTML, a nie JSON).
- **Rule**: Przed deployem sprawdź kształt wartości, bez wypisywania sekretów: `SUPABASE_URL` niepusty i w formie `https://<ref>.supabase.co`, `SUPABASE_KEY` jeden klucz (prefiks `sb_pub`, długość ok. 46). `secret list` nie dowodzi poprawności wartości, potwierdza ją dopiero żądanie do `/auth/v1/health` lub smoke.
- **Applies to**: plan, implement, impl-review

## Jawne uprawnienia tabel: revoke all przed grant

- **Context**: supabase/migrations/20261019120000_create_cards.sql:16-18 (nowe tabele w schemacie public).
- **Problem**: `grant select, insert, update, delete` tylko dodaje uprawnienia. Domyślne uprawnienia Supabase w `public` dają `authenticated` także TRUNCATE, REFERENCES i TRIGGER, których RLS nie obejmuje, a komentarz w migracji twierdził „dokładnie cztery operacje”.
- **Rule**: Każda migracja z nowym `grant` na tabeli zaczyna się od `revoke all on <tabela> from anon, authenticated`, a dopiero potem nadaje potrzebne operacje.
- **Applies to**: plan, implement, impl-review

## Bramki weryfikacji oceniaj po kodzie wyjścia; w `.astro` bez `return` we frontmatterze

- **Context**: `src/pages/auth/signin.astro` i `src/pages/dev/kitchen-sink.astro` (zmiana `ui-signin-contract`, fazy 4–5). `.husky/pre-commit` istnieje, ale husky nie jest podłączony (brak skryptu `prepare`).
- **Problem**: `return Astro.redirect(...)` / `return new Response(...)` na najwyższym poziomie frontmattera wywracał ESLint (`@typescript-eslint/no-misused-promises`: "Expected node to have a parent"). Bramka lintu była oceniana przez `grep` po tekście wyjścia, więc wyjątek przeszedł jako PASS, a pre-commit go nie złapał, bo się nie uruchamia.
- **Rule**: Wynik bramki (lint, check, build) oceniaj po kodzie wyjścia polecenia, nie po treści wyjścia. Przekierowania i odpowiedzi 404 zależne od ścieżki lub sesji umieszczaj w `src/middleware.ts`, nie jako `return` we frontmatterze `.astro`. Nie zakładaj, że pre-commit cokolwiek sprawdza; egzekwuje to CI.
- **Applies to**: implement, impl-review
