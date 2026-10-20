---
change_id: ui-signin-contract
title: Ui signin contract
status: implementing
created: 2026-10-20
updated: 2026-10-20
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Zmiana UI prowadzona przez `/10x-ui` (M2L5).

- **Widok (jeden):** `src/pages/auth/signin.astro` wraz z `src/components/auth/{SignInForm,FormField,PasswordToggle,ServerError,SubmitButton}.tsx`.
- **Źródło tokenów:** `src/styles/global.css` — wartości w `:root` / `.dark`, publikowane przez `@theme inline` (Tailwind v4 + shadcn/ui).
- **Komponenty współdzielone:** `src/components/ui/` (obecnie tylko `button.tsx`, `LibBadge.astro`); dodawanie przez `npx shadcn add <name>`.
- **Wariant kontraktu:** świeży starter z martwym plikiem tokenów — faza 1 podpina widok pod istniejące tokeny, zanim wybierzemy nowe wartości.
- **Skan literałów (przed):** 13 trafionych linii w 6 plikach widoku, 0 użyć tokenów.
