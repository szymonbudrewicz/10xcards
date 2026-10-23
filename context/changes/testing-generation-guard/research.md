---
date: 2026-10-23T13:14:41+02:00
researcher: Claude (Opus 5.5) with Szymon Budrewicz
git_commit: 76f1ee9
branch: main
repository: szymonbudrewicz/10xcards
topic: "Rollout Phase 1 (Ochrona generowania): grounding of risks #4 and #5"
tags: [research, testing, generate, api, vitest, privacy]
status: complete
last_updated: 2026-10-23
last_updated_by: Claude (Opus 5.5)
---

# Research: Rollout Phase 1 — Ochrona generowania (risks #4, #5)

**Date**: 2026-10-23T13:14:41+02:00
**Researcher**: Claude (Opus 5.5) with Szymon Budrewicz
**Git Commit**: 76f1ee9 (uncommitted local edits in CLAUDE.md, test-plan.md; none in `src/`)
**Branch**: main
**Repository**: szymonbudrewicz/10xcards

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` (risks #4, #5): find the
real failure paths, verify or correct the response guidance, locate existing tests,
pick the cheapest useful test layer, and flag speculative risks or misleading
hot-spot evidence. Vitest is not installed yet; this phase bootstraps it.

## Summary

- **The generation path is three files**: endpoint `src/pages/api/generate.ts`,
  service `src/lib/services/card-generation.ts` (the only module that calls
  OpenRouter, via global `fetch`, `card-generation.ts:83`), and the client pair
  `src/components/hooks/useGenerateProposals.ts` + `src/components/generate/GenerateForm.tsx`.
- **Server guards exist and are ordered correctly on this path**: session check
  (`generate.ts:15-17`) → JSON parse → zod shape → empty after trim
  (`generate.ts:32-34`) → `length > 10_000` (`generate.ts:35-41`) → API key
  (`generate.ts:43-46`) → AI call (`generate.ts:49`). Every early return happens
  before the only `fetch` in the service.
- **Existing coverage is HTTP-status-only**: `scripts/smoke.mjs` (CI job `smoke`)
  asserts status + `error.code` for 401 anonymous, 400 `text_empty` ("   "),
  400 `text_too_long` (10 001 chars), 200 with 1–10 proposals and 502 `ai_failed`
  (`smoke.mjs:103-137`, assertion logic `smoke.mjs:148-152`). There is no unit or
  integration test in the repo and no test runner in `package.json`.
- **Gaps that smoke cannot close** (all are the "must challenge" items of §2):
  1. No proof that the AI is *not called* on 401/400 — the mock has no call counter
     (`scripts/mock-openrouter.mjs:36-63`). Smoke asserts the 401 status only —
     exactly the anti-pattern named for #5.
  2. The ≤ 10 cap is never exercised: the mock always returns 3 cards
     (`mock-openrouter.mjs:16-20`), so `.slice(0, MAX_PROPOSALS)`
     (`card-generation.ts:132`) has no test that would fail if removed.
  3. Error `message` is never asserted (smoke checks `code` only) — neither that it
     is present nor that it never echoes the pasted text.
  4. Logging: the only log call on this path is `console.error("generate failed",
     { code, providerStatus })` (`generate.ts:60`); nothing guards it against a
     future edit that logs `text` or the error object.
  5. Boundary 10 000 (allowed) vs 10 001 (rejected): only 10 001 is tested.
  6. Untested service branches: `ai_timeout` → 504 (`generate.ts:62-64`), malformed
     model content → 502 (`card-generation.ts:112-127`), empty front/back filtered
     (`card-generation.ts:131`), `ai_not_configured` → 503 (`generate.ts:43-46`).
- **Cheapest layer**: one Vitest suite calling the exported `POST` handler directly
  with a fake `APIContext` (`locals.user`, `request`), `astro:env/server` mocked,
  and global `fetch` stubbed at the network boundary. The fetch stub doubles as the
  "AI was not called" proof (zero calls) and as the "no other egress" proof (at
  most one call, to `<baseUrl>/chat/completions`). Plus small unit tests on
  `generateCardProposals` for the normalisation (cap, trim/filter, malformed, timeout).
- **Corrections to the response guidance** (details below): "AI error leaves the
  pasted text in place" and "button inactive during generation" are client-side
  behaviour — not provable by a server test; §2 already routes the field to e2e
  (Phase 2). "Database does not contain the pasted text" is structural on this path
  (the endpoint has no Supabase import); the meaningful, cheap proof is the egress
  assertion, not a DB query.

## Detailed Findings

### Risk #5 — anonymous call reaches paid AI / pasted text leaks

**Failure path (code)**

- Middleware resolves `locals.user` for every request (`src/middleware.ts:12-21`).
  `PROTECTED_ROUTES = ["/dashboard", "/generate"]` with prefix match
  (`middleware.ts:4`, `:28`) redirects (302) — `/api/generate` does not start with
  `/generate`, so the middleware lets it through. The challenge "middleware protects
  everything" is **confirmed false** for this endpoint; protection is the endpoint's
  own check, matching `lessons.md` ("Endpointy API wywołujące AI wymagają sesji").
- Endpoint check: `if (!context.locals.user) return jsonError(401, "unauthorized", "Zaloguj się, aby generować fiszki.")`
  (`generate.ts:15-17`), before `request.json()` (`generate.ts:21`). The comment at
  `generate.ts:14` states the intent: "Session first, before reading the body, so an
  anonymous request never reaches the AI."
- Regression shapes a test must catch: the check moved below the AI call, removed,
  or replaced with reliance on `PROTECTED_ROUTES`; a 401 that still triggers
  `fetch`.

**Logs**

- Inspected path (`generate.ts`, `card-generation.ts`, `api-response.ts`): one
  `console.error` call, `generate.ts:60`, with `{ code, providerStatus }`.
  `CardGenerationError` carries only `code` and `providerStatus`
  (`card-generation.ts:14-25`); its `message` is the code (`:20`).
- `jsonError` builds `{ error: { code, message } }` from constant strings
  (`api-response.ts:10-13`); no branch on this path interpolates `text` into a
  message (`generate.ts:16,23,28,33,36-40,45,63,65`).
- `wrangler.jsonc:13-15` enables Workers observability, so anything sent to
  `console.*` in production is retained (also noted in
  `context/changes/generate-card-proposals/plan.md:14`). Platform-level request
  logging outside the app code was **not verified** (out of scope; no body logging
  is configured in this repo).

**Storage**

- `generate.ts` imports nothing from `@/lib/supabase` (`generate.ts:1-6`), and the
  service only calls `fetch` to the AI base URL (`card-generation.ts:83`). On this
  inspected path there is no write to any store. A test that queries the DB for the
  text would be low signal (nothing to break today). The regression worth catching
  is "someone adds a persistence/egress call with the text": a fetch stub asserting
  that the only outbound request is the AI request covers network-based stores
  (Supabase JS uses `fetch`).

**Response guidance verdict (#5)**: *prove 401 + AI not called* — confirmed, cheapest
as endpoint-level Vitest with a fetch stub (call count 0). *Neither logs nor DB contain
the text* — keep, but ground it as: (a) spy on `console.*` across every error branch
and assert no argument contains a sentinel text, (b) assert outbound requests ⊆ {one
AI call}. A DB-content check is not needed in this phase.

### Risk #4 — bad input / AI error

**Oracle (sources, not code)**

- PRD US-01 AC (`context/foundation/prd.md:54-56`): empty field → AI not called +
  readable message; limit 10 000 characters → message; at most 10 proposals.
- PRD FR-011 (`prd.md:77`) and Guardrail (`prd.md:43`): on generation error the text
  stays in the field and the user sees a readable message.
- CLAUDE.md Conventions: errors `{ error: { code, message } }`, `code` snake_case,
  `message` in Polish.
- Error-code contract table from the S-02 plan
  (`context/changes/generate-card-proposals/plan.md:103-106`) — a design spec that
  predates the code: `unauthorized` 401, `text_empty` 400, `text_too_long` 400; plus
  `ai_failed` 502 / `ai_timeout` 504 in the service contract (`plan.md:91`).

**Failure path (code)**

- Empty: `text.trim().length === 0` → 400 `text_empty` (`generate.ts:32-34`).
  Whitespace-only counts as empty; PRD says "puste pole". Treating "   " as empty is
  an interpretation, consistent with the client (`GenerateForm.tsx:26`) and the S-02
  plan (`plan.md:105`).
- Too long: `text.length > MAX_TEXT_LENGTH` with `MAX_TEXT_LENGTH = 10_000`
  (`src/types.ts:4`, `generate.ts:35`). Boundary: 10 000 accepted, 10 001 rejected.
  `length` counts UTF-16 code units (`types.ts:3` documents it), so astral characters
  (emoji) count as 2 — see Open Questions.
- Non-JSON body / wrong shape → 400 `invalid_request` (`generate.ts:20-29`).
- AI errors: non-2xx → `ai_failed` with provider status (`card-generation.ts:103-105`),
  network/abort → `ai_failed`/`ai_timeout` (`:107-110`), bad envelope, bad JSON in
  content, schema mismatch → `ai_failed` (`:112-127`). Endpoint maps `ai_timeout` →
  504, anything else → 502 (`generate.ts:56-66`). The challenge "no exception =
  correct user error" holds on this path: every thrown error is caught and mapped
  to a JSON error (`generate.ts:56`).
- Cap: proposals trimmed, empty front/back dropped, then `.slice(0, 10)`
  (`card-generation.ts:129-132`; `MAX_PROPOSALS = 10`, `types.ts:7`). Zero proposals
  after filtering → 200 with `[]`; the UI shows "AI nie znalazło…"
  (`GenerateForm.tsx:77-78`).

**Client-side parts of #4 (not reachable by a server test)**

- Text preserved after error: `text` is local state in `GenerateForm`
  (`GenerateForm.tsx:16-17`); the hook never touches it (`useGenerateProposals.ts:20`)
  and only sets `error`/`proposals` (`:44-50`).
- Double click / multiple paid calls: `inFlight` ref guard
  (`useGenerateProposals.ts:25-29`) and `disabled={isLoading}` (`GenerateForm.tsx:66`).
- Client validation duplicates the server's (`GenerateForm.tsx:21-30`), so the AI is
  not called from the UI for empty/too-long text even before the request.
- Testing these needs a DOM environment (jsdom + Testing Library) or a browser.
  §2 "Likely cheapest layer" for #4 already says "zachowanie pola w e2e", and §3
  Phase 2 covers "przy błędzie zachowuje tekst". Recommended: leave both to Phase 2.

**Response guidance verdict (#4)**: empty / > 10 000 → no AI call + Polish error
shape — confirmed, endpoint-level Vitest (fetch call count 0, status, `code`,
non-empty `message` that does not contain the input). ≤ 10 proposals — confirmed as a
real gap; a stub returning 12 valid cards proves the cap (unit on the service).
"AI error leaves text in place" — **corrected**: server side can only prove the error
is a JSON `{ error }` with 502/504 (which the hook needs to show a message,
`useGenerateProposals.ts:46-47`); the field itself is Phase 2 e2e.

### Existing tests and harness

- No test files, no runner, no `test` script (`package.json` scripts: dev, build,
  preview, astro, lint, lint:fix, lint:ui, format, smoke, isolation).
- `scripts/smoke.mjs` generate steps: `:102-107` (anonymous), `:125-137` (signed-in);
  `validProposals` checks 1–10 non-empty cards (`:51-59`).
- `scripts/mock-openrouter.mjs` exports `MOCK_AI_ERROR_MARKER` and `MOCK_PROPOSALS`
  for reuse (`:5-7`, `:14-20`); it never logs bodies (`:8`). Reusable in Phase 2 e2e;
  for Phase 1 an in-process fetch stub is cheaper (no server, controllable count and
  payloads).
- CI: `ci` job (lint, lint:ui, astro check, build) and `smoke` job
  (`.github/workflows/ci.yml:18-23`, `:39-63`), Node 22 (`ci.yml:16,34`).

### Test-runner bootstrap facts

- Installed Vite 8.3.0 (deduped across `@astrojs/cloudflare`, `@cloudflare/vite-plugin`
  1.64.0, `@vitejs/plugin-react`). `vitest@5.0.5` peer: `vite ^6.4 || ^7 || ^8`,
  engines `node ^22.12 || ^24 || >=26` — compatible with local Node 24.21.0 and CI
  Node 22 (latest 22.x).
- `generate.ts` imports `astro:env/server` (`generate.ts:3`), an Astro virtual module.
  Two options: Astro's `getViteConfig` (resolves virtual modules but loads the full
  Astro config, including the Cloudflare adapter / `@cloudflare/vite-plugin`), or a
  plain `vitest.config.ts` with `resolve.alias` for `@/` (`tsconfig.json` paths) and
  `vi.mock("astro:env/server", …)`. The plain config is cheaper and avoids starting
  the Workers runtime; whether `vi.mock` of an unresolvable virtual id needs an alias
  stub file must be confirmed during setup.
- `tsconfig.json` includes `**/*`, so test files are type-checked by `astro check`;
  Vitest globals/types must be importable (explicit `import { describe, it } from "vitest"`
  avoids global type config). ESLint applies to `**/*.{js,jsx,ts,tsx}`
  (`eslint.config.*:43`), so tests are linted in CI.

### Hot-spot evidence

`src/pages/api` (7 changes / 30 days) is accurate likelihood evidence: the endpoint
was written in S-02 and its contract will be reused by S-03/S-04
(`generate-card-proposals/plan.md:43`). Not misleading. Note that the cap and
normalisation live in `src/lib/services/`, outside the cited hot-spot dir.

## Code References

- `src/pages/api/generate.ts:15-17` — 401 before body read
- `src/pages/api/generate.ts:32-41` — empty / too-long validation
- `src/pages/api/generate.ts:43-46` — 503 `ai_not_configured`
- `src/pages/api/generate.ts:56-66` — error mapping + the only log call (`:60`)
- `src/lib/services/card-generation.ts:78-133` — the only OpenRouter call, parsing, cap
- `src/lib/api-response.ts:10-13` — error shape
- `src/middleware.ts:4,28-32` — PROTECTED_ROUTES redirect (does not cover `/api/generate`)
- `src/types.ts:3-7` — `MAX_TEXT_LENGTH`, `MAX_PROPOSALS`
- `src/components/hooks/useGenerateProposals.ts:25-56` — in-flight guard, error handling
- `src/components/generate/GenerateForm.tsx:16-31,66` — text kept, client validation, disabled button
- `scripts/smoke.mjs:102-137` — existing HTTP coverage
- `scripts/mock-openrouter.mjs:14-20,36-63` — mock contract (fixed 3 cards, no counter)

## Architecture Insights

- The network boundary is a single global `fetch` in one service; stubbing it is the
  honest "AI mocked at the boundary" layer from §4 and needs no module mocks of
  project code.
- The endpoint is an exported function of `APIContext`; it reads only
  `context.locals.user` and `context.request` (`generate.ts:15,21`), so a minimal fake
  context is enough — no Astro server needed.
- Client and server duplicate validation with shared constants (`types.ts`), so a test
  that imports `MAX_TEXT_LENGTH` to build its input would mirror the code; the oracle
  value is the PRD literal 10 000.

## Historical Context (from prior changes)

- `context/changes/generate-card-proposals/plan.md:49` — privacy rule (never log
  text/prompt/response; log only code + provider status). **Supported** by current code
  (`generate.ts:60`).
- `plan.md:112` — "Brak sesji sprawdzany jest przed odczytem ciała, więc AI nie zostaje
  wywołane." **Supported** by code order; **not proven by any test**.
- `plan.md:297` — "Normalizację wyniku (puste pola, > 10 propozycji) pokrywa atrapa w
  smoke". **Contradicted**: the mock returns 3 non-empty cards
  (`mock-openrouter.mjs:16-20`), so neither filtering nor the cap is exercised.
- `plan.md:135` — logs checked manually in `astro dev`. Partial: one-off manual check,
  no regression guard.

## Related Research

Not applicable (`generate-card-proposals` has `plan.md`/`plan-brief.md`, no `research.md`).

## Open Questions

1. **Character counting for the 10 000 limit** — PRD says "znaków"; code counts UTF-16
   code units, so 9 999 letters + 1 emoji = 10 001 → rejected. Product decision; for
   Phase 1, test the boundary with BMP characters (ASCII/Polish letters) and record the
   emoji case as a known divergence rather than asserting either behaviour.
2. **How strictly to assert `message`** — exact Polish strings exist in the S-02 spec
   (`plan.md:103-106`), but pinning wording makes tests brittle. Proposal: assert exact
   `status` + `code` (contract) and that `message` is a non-empty string not containing
   the input; decide in /10x-plan.
3. **`astro:env/server` in Vitest** — plain config + `vi.mock`/alias vs `getViteConfig`;
   confirm in the setup sub-phase.
4. **Client-side #4 (text kept, double click)** — recommended for Phase 2 e2e; a
   jsdom + Testing Library suite in Phase 1 is possible but adds two dev dependencies for
   behaviour Phase 2 must prove in a browser anyway.
