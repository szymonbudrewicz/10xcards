# Tokeny: wartości i źródła

Aplikacja działa w motywie `.dark` (`class="dark"` na `<html>` w `src/layouts/Layout.astro`). Wartości `.dark` w `src/styles/global.css` pochodzą z literałów widoku logowania sprzed zmiany (commit `0fee682`). Kolory palety to wartości z `node_modules/tailwindcss/theme.css` (Tailwind 4.2), a hex przeliczony na oklch.

## Role w `.dark`

| Rola | Wartość | Źródło (literał, plik:linia przed zmianą) |
|---|---|---|
| `--background` | `oklch(0.166 0.026 269.4)` | `#0a0e1a`, `global.css:114` (`bg-cosmic`) |
| `--background-accent` (nowa) | `oklch(0.201 0.041 269.8)` | `#0f1529`, `global.css:114` (środek gradientu) |
| `--foreground`, `--card-foreground`, `--primary-foreground`, `--accent-foreground` | `oklch(1 0 0)` | `text-white`, `signin.astro:10`, `FormField.tsx:6`, `SubmitButton.tsx:18` |
| `--card` | `oklch(1 0 0 / 10%)` | `bg-white/10`, `signin.astro:10` |
| `--border` | `oklch(1 0 0 / 10%)` | `border-white/10`, `signin.astro:10` |
| `--input` | `oklch(1 0 0 / 20%)` | `border-white/20`, `FormField.tsx:53` |
| `--primary` | `oklch(0.558 0.288 302.321)` | `bg-purple-600`, `SubmitButton.tsx:18` (hover: `bg-primary/90` z `Button` zamiast `purple-500`) |
| `--ring` | `oklch(0.714 0.203 305.504)` | `focus:ring-purple-400`, `FormField.tsx:53` |
| `--muted-foreground` | `oklch(0.932 0.032 255.585 / 60%)` | `text-blue-100/60`, `signin.astro:15` (pokrywa też `blue-100/80` etykiet i `white/40` ikon) |
| `--link` (nowa) | `oklch(0.827 0.119 306.383)` | `text-purple-300`, `signin.astro:17` |
| `--accent` | `oklch(1 0 0 / 10%)` | tło hover przycisków ghost (np. przełącznik hasła). Wcześniej szare `oklch(0.269 0 0)`, zmienione, żeby pasowało do półprzezroczystej karty |
| `--destructive` | `oklch(0.704 0.191 22.216)` (bez zmian) | `red-400`, `FormField.tsx:53` |

Pozostałe role (`--popover`, `--secondary`, `--muted`, `--chart-*`, `--sidebar-*`) bez zmian względem startera.

## Odstępstwa od planu

- **`--link` zamiast `--accent-foreground`/`--primary`.** `accent` to w shadcn kolor hover przycisków ghost, więc ikona przełącznika hasła zrobiłaby się fioletowa. `primary` (`purple-600`) ma za słaby kontrast jako tekst na ciemnym tle. W `:root` `--link` = `--primary` startera.
- **`--accent` zmienione.** Plan zakładał bez zmian, ale szare, nieprzezroczyste tło hover wyglądało jak obca łata na szklanej karcie.

## Znane różnice wizualne (do sprawdzenia w fazie 3)

- Etykiety pól: przed `blue-100/80`, po `Label` dziedziczy `--card-foreground` (biały). Nieco jaśniejsze.
- Tło pola: przed `white/10`, po `dark:bg-input/30` z `Input` = ok. 6% bieli. Nieco ciemniejsze.
- Nagłówek: przed gradient `blue-200 → purple-200`, po jednolity `text-foreground`.

## Skan literałów

Wzorzec z `/10x-ui`, uruchamiany na 6 plikach widoku: `src/pages/auth/signin.astro` i `src/components/auth/{SignInForm,FormField,PasswordToggle,ServerError,SubmitButton}.tsx`.

| Moment | Trafienia (linie) | Użycia tokenów |
|---|---|---|
| Przed zmianą (`0fee682`) | 13 | 0 |
| Po fazie 3 (`31e043d`) | 0 | widok w całości na rolach i `ui/*` |
| Po fazie 6 | 0 (plus 0 w `signup` i kitchen-sink) | — |

Polecenie: `npm run lint:ui` (`scripts/ui-literal-scan.mjs`, lista oczyszczonych plików w skrypcie). Uruchamiane w CI (job `ci`) i w `lint-staged`.

## Do decyzji później

- **husky nie jest podłączony** (brak skryptu `prepare`, brak `core.hooksPath`), więc `.husky/pre-commit` i `lint-staged` nie uruchamiają się przy commitach. Kontrolę egzekwuje CI. Włączenie husky to osobna zmiana: każdy commit uruchamiałby `eslint --fix` z typami.

## Test reguły w nowej sesji (6.5)

Nowa sesja agenta (bez historii) dostała polecenie: dodaj pod polem hasła link „Nie pamiętasz hasła?” do `/auth/forgot-password`. Agent umieścił link w `SignInForm.tsx` z klasą `text-link text-sm hover:underline` (rola, nie kolor palety) i sam uruchomił `npm run lint:ui` (clean). Zmiana testowa została cofnięta.

## Klucze dodane do `:root` (jasna paleta)

`--background-accent` (`oklch(0.97 0 0)`) i `--link` (`oklch(0.205 0 0)`, jak `--primary` startera) dodane do `:root`, żeby nowe role miały wartość także poza `.dark`. Pozostałe wartości `:root` bez zmian. Aplikacja dziś zawsze działa w `.dark`, więc nic się nie zmienia na ekranie.
