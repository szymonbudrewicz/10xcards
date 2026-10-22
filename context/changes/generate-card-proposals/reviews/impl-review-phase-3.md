<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-02 Generowanie propozycji fiszek

- **Plan**: context/changes/generate-card-proposals/plan.md
- **Scope**: Phase 3 of 4
- **Reviewed phases**: 3
- **Date**: 2026-10-22
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Scope note: two extras outside Changes Required, both justified: `src/components/ui/textarea.tsx` (missing shadcn primitive the form needs, `cn` from `@/lib/utils`) and `scripts/ui-literal-scan.mjs` (new view under `lint:ui`, requested by the user).

Success criteria: 3.1–3.3 green locally on 5beb8cb content; 3.4 green in CI run 39824925662 (`/generate` 302/200); 3.5–3.10 confirmed manually by the user.

## Findings

### F1 — Old proposals stay visible after a new or failed generation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useGenerateProposals.ts:31
- **Detail**: `generate` clears `error` but not `proposals`. After an edit + failed regeneration the error alert shows next to cards from the previous text. Once S-03 adds "accept", a user could save cards that no longer match the text.
- **Fix**: Call `setProposals(null)` at the start of `generate`, next to `setError(null)`.
- **Decision**: FIXED (Fix now)

### F2 — Live region is mounted together with its content

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/generate/GenerateForm.tsx:72
- **Detail**: `aria-live="polite"` sits on a `<section>` rendered only when `proposals` exists, so screen readers usually don't announce the results or the "no proposals" message. Errors are fine (`Alert` has `role="alert"`).
- **Fix**: Keep an always-rendered wrapper with `aria-live="polite"` and render the results inside it.
- **Decision**: FIXED (Fix now)

### F3 — Response items are not shape-checked on the client

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useGenerateProposals.ts:16
- **Detail**: `isProposalsResponse` checks only `Array.isArray`. A non-string `front`/`back` would crash the island on render. Low risk: the server validates with zod.
- **Fix**: Also require every item to have string `front` and `back`.
- **Decision**: SKIPPED

### F4 — "Connection" message for non-network failures (plan wording)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/hooks/useGenerateProposals.ts:46
- **Detail**: A malformed body (e.g. an HTML 500 page) shows "Nie udało się połączyć z serwerem". This is exactly what the plan specified, so it is a plan-level choice, not drift.
- **Fix**: Leave as planned (optionally a generic message for malformed bodies in a later change).
- **Decision**: SKIPPED

### F5 — "10 000" hard-coded in the limit message

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/generate/GenerateForm.tsx:12 (also src/pages/api/generate.ts:36)
- **Detail**: The message duplicates `MAX_TEXT_LENGTH`; changing the limit would leave two stale strings.
- **Fix**: Build both messages from `MAX_TEXT_LENGTH.toLocaleString("pl-PL")`.
- **Decision**: FIXED (Fix now)

### F6 — Field error and subtitle differ from existing UI pieces

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/generate/GenerateForm.tsx:51; src/pages/generate.astro:16
- **Detail**: The field error is an always-rendered `<p>` without the `CircleAlert` icon / `-error` id used by `FormField`; the page subtitle is a raw `<p>` instead of `CardDescription`.
- **Fix**: Render the error like `FormField` (conditional, icon, `source-text-error` id) and use `CardDescription`.
- **Decision**: SKIPPED

### F7 — Shared pieces live in the auth folder

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/generate/GenerateForm.tsx:6, :66
- **Detail**: `ServerError` is imported from `components/auth/`, and the submit button repeats `SubmitButton` markup by hand (justified: `useFormStatus` doesn't apply to a fetch submit).
- **Fix**: Leave for now; move `ServerError` (and a `pending` prop for `SubmitButton`) to a shared place when a third consumer appears.
- **Decision**: SKIPPED

### F8 — Plan says "style like dashboard.astro", which is not on tokens

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/dashboard.astro:9-23
- **Detail**: Dashboard still uses palette classes (`text-white`, `bg-white/10`, `text-blue-100/80`) and English text. The implementation correctly copied only `bg-cosmic` and used tokens, but the plan wording could steer a future agent to copy the palette.
- **Fix**: Leave code as is; clean dashboard later via `/10x-ui dashboard`.
- **Decision**: SKIPPED
