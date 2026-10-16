---
bootstrapped_at: 2026-10-16T00:00:00Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10xcards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xcards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

Solo, after-hours builder shipping a small web app in 3 weeks for up to about five users, with email/password auth and an LLM step that turns pasted text into flashcard proposals. Standard path: 10x Astro Starter is the recommended default for (web-app, js) and clears all four agent-friendly gates. It brings auth, a PostgreSQL database with per-user data isolation (Supabase row-level security, which must be configured early) and edge deployment out of the box, which fits the strict "each user sees only their own flashcards" requirement and the short timeline. The AI call runs in a server-side API route, so pasted text need not be stored. No payments, realtime or background jobs are in scope. Bootstrapper confidence is first-class, so expect mostly smooth scaffolding with occasional manual steps. CI runs on GitHub Actions with auto-deploy on merge to Cloudflare Pages.

## Pre-scaffold verification

| Signal      | Value                                                        | Severity | Notes                                                         |
| ----------- | ------------------------------------------------------------ | -------- | ------------------------------------------------------------- |
| npm package | not run                                                      | n/a      | cmd_template is a `git clone`; no npm package to resolve      |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12    | fresh    | from card.docs_url; `gh` not installed, queried via GitHub REST API with curl |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 21 top-level entries (including `node_modules`)
**Conflicts (.scaffold siblings)**: CLAUDE.md -> CLAUDE.md.scaffold
**.gitignore handling**: moved silently (none existed in cwd)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` removed before move-up)

Notes: `npm install` warned that 3 packages have install scripts not covered by `allowScripts` (esbuild@0.28.1, esbuild@0.28.2, workerd@1.20260911.1). `context/` untouched. Existing `idea-notes.md`, `skills-lock.json`, `.10x-cli.json`, `.claude/`, `.agents/` preserved.

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 9 HIGH, 2 MODERATE, 0 LOW
**Direct vs transitive**: 0/1/0/0 direct of total 0/9/2/0 (direct: wrangler). All 11 report a fix available via `npm audit fix`.

#### CRITICAL findings

None.

#### HIGH findings

- wrangler (direct)
- @cloudflare/vite-plugin (transitive)
- brace-expansion (transitive)
- devalue (transitive)
- http-cache-semantics (transitive)
- miniflare (transitive)
- sharp (transitive)
- source-map-js (transitive)
- undici (transitive)

#### MODERATE findings

- fast-uri (transitive)
- smol-toml (transitive)

#### LOW / INFO findings

None.

Raw output: run `npm audit --json` for advisory ids and ranges.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | true                 |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep (`CLAUDE.md.scaffold`).
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
