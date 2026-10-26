// Proof for the agent Stop hook (.claude/hooks/end-of-turn.mjs), see /10x-configure-hook step 7.
// Real script + real git in a throwaway repo; ESLint, Vitest and tsc are replaced by tiny stubs
// in the repo's node_modules that fail on a marker (LINT_ERROR / TEST_FAIL / TYPE_ERROR).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const HOOK = path.join(REPO_ROOT, ".claude/hooks/end-of-turn.mjs");

// Each stub appends its name to .calls, so a test can prove no check ran at all.
const STUB_PRELUDE = `
const fs = process.getBuiltinModule("node:fs");
const path = process.getBuiltinModule("node:path");
fs.appendFileSync(".calls", NAME + "\\n");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.name === "node_modules" || e.name === ".git" ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
`;
const STUBS: Record<string, string> = {
  "node_modules/eslint/bin/eslint.js": `const NAME = "eslint";${STUB_PRELUDE}
const bad = process.argv.slice(2).filter((a) => !a.startsWith("--") && fs.readFileSync(a, "utf8").includes("LINT_ERROR"));
if (bad.length) { console.log(bad.map((f) => f + ": 1:1 error no-unused-vars").join("\\n")); process.exit(1); }`,
  "node_modules/vitest/vitest.mjs": `const NAME = "vitest";${STUB_PRELUDE}
if (walk(".").some((f) => f.endsWith(".test.ts") && fs.readFileSync(f, "utf8").includes("TEST_FAIL"))) {
  console.log("FAIL tests/a.test.ts > expected 1 to be 2"); process.exit(1); }`,
  "node_modules/typescript/bin/tsc": `const NAME = "tsc";${STUB_PRELUDE}
const bad = walk(".").filter((f) => f.endsWith(".ts") && fs.readFileSync(f, "utf8").includes("TYPE_ERROR"));
if (bad.length) { console.log(bad.map((f) => f + "(1,1): error TS2322: Type 'string' is not assignable to type 'number'.").join("\\n")); process.exit(2); }`,
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", ...args], {
    cwd,
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${String(r.stderr)}`);
}

/** Throwaway repo with a committed clean file, the stubs (gitignored) and a copy of the hook. */
function makeRepo(stubs: Record<string, string> = STUBS) {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-hooks-"));
  dirs.push(dir);
  const write = (rel: string, body: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), body);
  };
  write(".gitignore", "node_modules/\n.calls\n");
  write("src/ok.ts", "export const ok = 1;\n");
  write("tests/a.test.ts", "// passing test\n");
  for (const [rel, body] of Object.entries(stubs)) write(rel, body);
  mkdirSync(path.join(dir, ".claude/hooks"), { recursive: true });
  copyFileSync(HOOK, path.join(dir, ".claude/hooks/end-of-turn.mjs"));
  git(dir, "init", "-q");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return {
    dir,
    write,
    calls: () => (existsSync(path.join(dir, ".calls")) ? readFileSync(path.join(dir, ".calls"), "utf8") : ""),
  };
}

function runHook(cwd: string, stdin: string, env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [path.join(cwd, ".claude/hooks/end-of-turn.mjs")], {
    cwd,
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { code: r.status, stderr: r.stderr, stdout: r.stdout };
}

const stop = (cwd: string, extra: object = {}) =>
  JSON.stringify({ hook_event_name: "Stop", cwd, stop_hook_active: false, ...extra });

describe("end-of-turn.mjs (Stop hook)", { timeout: 30_000 }, () => {
  it("blocks with exit 2 and names the file when a changed file has a lint error", () => {
    const repo = makeRepo();
    repo.write("src/new.ts", "const LINT_ERROR = 1;\n"); // written straight to disk, as a shell command would
    const r = runHook(repo.dir, stop(repo.dir));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("ESLint");
    expect(r.stderr).toContain("src/new.ts");
  });

  it.each([
    ["type error", "src/ok.ts", "export const ok: number = 1; // TYPE_ERROR\n", "Typecheck"],
    ["failing test", "tests/a.test.ts", "// TEST_FAIL\n", "Testy"],
  ])("blocks with exit 2 on a %s in a modified tracked file", (_name, file, body, section) => {
    const repo = makeRepo();
    repo.write(file, body);
    const r = runHook(repo.dir, stop(repo.dir));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(section);
  });

  it("passes silently when the changed files are clean", () => {
    const repo = makeRepo();
    repo.write("src/ok.ts", "export const ok = 2;\n");
    const r = runHook(repo.dir, stop(repo.dir));
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(repo.calls()).toContain("eslint");
  });

  it.each([
    ["no changes", null],
    ["only a markdown file changed", "README.md"],
  ])("exits 0 without running any check when there are %s", (_name, file) => {
    const repo = makeRepo();
    if (file) repo.write(file, "LINT_ERROR TYPE_ERROR\n");
    const r = runHook(repo.dir, stop(repo.dir));
    expect(r.code).toBe(0);
    expect(repo.calls()).toBe("");
  });

  it.each([
    ["stop_hook_active", { stop_hook_active: true }],
    ["Cursor loop_count", { loop_count: 1 }],
  ])("lets the agent finish on the retry (%s) even with the error still there", (_name, extra) => {
    const repo = makeRepo();
    repo.write("src/new.ts", "const LINT_ERROR = 1;\n");
    const r = runHook(repo.dir, stop(repo.dir, extra));
    expect(r.code).toBe(0);
    expect(repo.calls()).toBe("");
  });

  it.each([
    ["empty stdin", ""],
    ["invalid JSON", "not json"],
    ["{}", "{}"],
  ])("falls back to the process cwd on %s and still catches the error", (_name, stdin) => {
    const repo = makeRepo();
    repo.write("src/new.ts", "const LINT_ERROR = 1;\n");
    expect(runHook(repo.dir, stdin).code).toBe(2);
  });

  it.skipIf(process.platform !== "win32")("understands a Git Bash style cwd (/c/Users/...) on Windows", () => {
    const repo = makeRepo();
    repo.write("src/new.ts", "const LINT_ERROR = 1;\n");
    const msys = repo.dir.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_m, d: string) => `/${d.toLowerCase()}`);
    expect(runHook(repo.dir, stop(msys)).code).toBe(2);
  });

  it("names the checks it skipped when the time budget runs out instead of passing silently", () => {
    const repo = makeRepo();
    repo.write("src/ok.ts", "export const ok = 2;\n");
    const r = runHook(repo.dir, stop(repo.dir), { END_OF_TURN_BUDGET_MS: "-1" });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Pominięte");
    expect(r.stdout).toContain("ESLint");
    expect(repo.calls()).toBe("");
  });

  it("checks the session checkout, not a stale CLAUDE_PROJECT_DIR pointing at a broken one", () => {
    const clean = makeRepo();
    const broken = makeRepo();
    broken.write("src/new.ts", "const LINT_ERROR = 1;\n");
    const r = runHook(clean.dir, stop(clean.dir), { CLAUDE_PROJECT_DIR: broken.dir });
    expect(r.code).toBe(0);
    expect(broken.calls()).toBe("");
  });

  it.each(["node_modules/eslint/bin/eslint.js", "node_modules/typescript/bin/tsc"])(
    "fails visibly (exit 2) when %s is missing instead of passing",
    (missing) => {
      const { [missing]: _drop, ...rest } = STUBS;
      const repo = makeRepo(rest);
      repo.write("src/ok.ts", "export const ok = 2;\n");
      const r = runHook(repo.dir, stop(repo.dir));
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("npm install");
    },
  );

  // The settings.json command must reach the script through git, even when CLAUDE_PROJECT_DIR is wrong.
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash";
  it.skipIf(!existsSync(bash))("the settings.json command finds the script from the session checkout", () => {
    const settings = JSON.parse(readFileSync(path.join(REPO_ROOT, ".claude/settings.json"), "utf8")) as {
      hooks: { Stop: { hooks: { command: string; timeout: number }[] }[] };
    };
    const [entry] = settings.hooks.Stop[0].hooks;
    expect(entry.timeout).toBeLessThanOrEqual(600); // seconds, not milliseconds
    const repo = makeRepo();
    repo.write("src/new.ts", "const LINT_ERROR = 1;\n");
    const r = spawnSync(bash, ["-c", entry.command], {
      cwd: repo.dir,
      input: stop(repo.dir),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: path.join(repo.dir, "does-not-exist") },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("src/new.ts");
  });
});
