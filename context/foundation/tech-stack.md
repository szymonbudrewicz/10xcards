---
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
---

## Why this stack

Solo, after-hours builder shipping a small web app in 3 weeks for up to about five users, with email/password auth and an LLM step that turns pasted text into flashcard proposals. Standard path: 10x Astro Starter is the recommended default for (web-app, js) and clears all four agent-friendly gates. It brings auth, a PostgreSQL database with per-user data isolation (Supabase row-level security, which must be configured early) and edge deployment out of the box, which fits the strict "each user sees only their own flashcards" requirement and the short timeline. The AI call runs in a server-side API route, so pasted text need not be stored. No payments, realtime or background jobs are in scope. Bootstrapper confidence is first-class, so expect mostly smooth scaffolding with occasional manual steps. CI runs on GitHub Actions with auto-deploy on merge to Cloudflare Pages.
