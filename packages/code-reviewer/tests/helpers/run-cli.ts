// Runs the reviewer CLI exactly as `npm run review` would, in a child process.
// The command comes from package.json scripts.review, so these tests do not know
// which file is the entry point and survive moving it.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PACKAGE_DIR = fileURLToPath(new URL("../..", import.meta.url));
const TSX_CLI = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  args?: string[];
  stdin?: string;
  // Always set explicitly: the CLI loads the package .env (real key) for anything missing.
  env: { OPENROUTER_API_KEY: string; OPENROUTER_BASE_URL: string } & Record<string, string>;
}

function reviewCommand(): string[] {
  const pkg = JSON.parse(readFileSync(`${PACKAGE_DIR}package.json`, "utf8")) as { scripts: { review: string } };
  const [bin, ...args] = pkg.scripts.review.split(/\s+/);
  if (bin !== "tsx") throw new Error(`scripts.review must start with tsx, got: ${pkg.scripts.review}`);
  return args;
}

export function runCli({ args = [], stdin = "", env }: RunOptions): Promise<CliResult> {
  // Drop inherited reviewer settings so the developer's shell cannot change test outcomes.
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("OPENROUTER_") && !key.startsWith("REVIEW_")),
  );
  const child = spawn(process.execPath, [TSX_CLI, ...reviewCommand(), ...args], {
    cwd: PACKAGE_DIR,
    env: { ...baseEnv, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
  child.stdin.end(stdin);

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
