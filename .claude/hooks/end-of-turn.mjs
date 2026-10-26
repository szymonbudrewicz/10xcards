#!/usr/bin/env node
// Stop hook (Claude Code): before the agent finishes, check every file changed in this turn.
// ESLint on changed files + the whole Vitest suite + `tsc --noEmit`, run in parallel.
// Exit 2 + stderr is the only combination the agent sees; one retry (stop_hook_active).
// Node instead of bash + jq: jq is not installed on the dev machine (Windows).
// Per-edit linting was dropped on purpose: one ESLint run costs ~60 s on this machine.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const LINTED = /\.(ts|tsx|js|jsx|mjs|cjs|astro)$/;
const MAX_LINES = 150;

function readPayload() {
  try {
    const raw = readFileSync(0, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {}; // empty or invalid stdin: still sweep the current checkout
  }
}

function git(cwd, args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

function run(root, label, script, args) {
  const bin = path.join(root, script);
  if (!existsSync(bin)) {
    return Promise.resolve(`${label}: brak ${script} — uruchom \`npm install\`. Sprawdzenie się NIE wykonało.`);
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (e) => resolve(`${label}: nie udało się uruchomić (${e.message}).`));
    child.on("close", (code) => {
      if (code === 0) return resolve(null);
      const lines = out.trim().split(/\r?\n/);
      const body =
        lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `… (+${lines.length - MAX_LINES} linii)`] : lines;
      resolve(`${label} (exit ${code}):\n${body.join("\n") || "(brak wyjścia — narzędzie się nie uruchomiło?)"}`);
    });
  });
}

const payload = readPayload();

// Already sent back once by this hook: let the agent finish. Commit gate / CI catch the rest.
// loop_count: Cursor imports .claude/settings.json hooks and uses this field instead.
if (payload.stop_hook_active === true || Number(payload.loop_count ?? 0) > 0) process.exit(0);

// Git Bash paths (/c/Users/...) mean nothing to native git.exe: convert them on Windows.
const toNative = (p) => (process.platform === "win32" ? p.replace(/^\/([a-zA-Z])(\/|$)/, "$1:/") : p);
const cwd = typeof payload.cwd === "string" && payload.cwd ? toNative(payload.cwd) : process.cwd();
const root = (
  git(cwd, ["rev-parse", "--show-toplevel"]) ?? git(process.cwd(), ["rev-parse", "--show-toplevel"])
)?.trim();
if (!root) {
  process.stdout.write(
    JSON.stringify({ systemMessage: `end-of-turn.mjs: brak repozytorium git w ${cwd}, nic nie sprawdzono.` }),
  );
  process.exit(0);
}

// Changed + untracked files. Also catches files rewritten by a shell command (no Write/Edit event).
const changed = new Set(
  [git(root, ["diff", "--name-only", "HEAD"]), git(root, ["ls-files", "-o", "--exclude-standard"])]
    .join("\n")
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter(Boolean),
);
const files = [...changed].filter((f) => LINTED.test(f) && existsSync(path.join(root, f)));
if (files.length === 0) process.exit(0); // Q&A turn or docs only: nothing to check

// tsc fails on astro:* modules until `astro sync` generates .astro/ (gitignored).
if (existsSync(path.join(root, "astro.config.mjs")) && !existsSync(path.join(root, ".astro", "types.d.ts"))) {
  await run(root, "astro sync", "node_modules/astro/astro.js", ["sync"]);
}

// Sequential on purpose: measured on the dev machine, parallel runs were slower (~226 s vs ~170 s).
// Related tests only: the whole suite belongs to the commit gate and CI.
const CHECKS = [
  ["ESLint (zmienione pliki)", "node_modules/eslint/bin/eslint.js", ["--quiet", "--no-warn-ignored", ...files]],
  ["Typecheck (tsc --noEmit)", "node_modules/typescript/bin/tsc", ["--noEmit", "--pretty", "false"]],
  ["Testy powiązane (vitest related)", "node_modules/vitest/vitest.mjs", ["related", ...files, "--run"]],
];
// Stay under the settings.json timeout (300 s): a killed hook reaches nobody. Skips are named.
const BUDGET_MS = Number(process.env.END_OF_TURN_BUDGET_MS ?? 240_000);
const started = Date.now();
const failures = [];
const skipped = [];
for (const [label, script, args] of CHECKS) {
  if (Date.now() - started > BUDGET_MS) {
    skipped.push(label);
    continue;
  }
  const result = await run(root, label, script, args);
  if (result) failures.push(result);
}

const skipNote = skipped.length ? `Pominięte (limit czasu hooka): ${skipped.join(", ")} — sprawdzi je CI.` : "";
if (failures.length > 0) {
  process.stderr.write(
    `Popraw te błędy, zanim skończysz (zmienione pliki: ${files.join(", ")}):\n\n${failures.join("\n\n")}\n${skipNote ? `\n${skipNote}\n` : ""}`,
  );
  process.exit(2);
}
if (skipNote) process.stdout.write(JSON.stringify({ systemMessage: `end-of-turn.mjs: ${skipNote}` }));
process.exit(0);
