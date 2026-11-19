// Comment CLI used by the CI workflow: exit code, stdout and stderr asserted separately.
// Runs `npm run comment` the way CI does (tsx entry from package.json scripts.comment).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMENT_MARKER, NO_VERDICT_REASONS } from "../src/index.ts";
import { VALID_REVIEW } from "./helpers/fake-openrouter.ts";
import { PACKAGE_DIR, type CliResult } from "./helpers/run-cli.ts";

const TSX_CLI = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));

function commentEntry(): string {
  const pkg = JSON.parse(readFileSync(`${PACKAGE_DIR}package.json`, "utf8")) as { scripts: { comment: string } };
  const [bin, entry] = pkg.scripts.comment.split(/\s+/);
  if (bin !== "tsx" || !entry) throw new Error(`scripts.comment must be "tsx <entry>", got: ${pkg.scripts.comment}`);
  return entry;
}

function runComment(args: string[]): Promise<CliResult> {
  const child = spawn(process.execPath, [TSX_CLI, commentEntry(), ...args], { cwd: PACKAGE_DIR });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function writeTemp(name: string, content: string): string {
  const file = join(mkdtempSync(join(tmpdir(), "comment-")), name);
  writeFileSync(file, content);
  return file;
}

describe("comment CLI", () => {
  it("renders the criteria table from a review file", async () => {
    const result = await runComment(["--review", writeTemp("review.json", JSON.stringify(VALID_REVIEW))]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("## AI Code Review: ❌ fail");
    expect(result.stdout).toContain("| Izolacja kont i dostęp do danych (twarda reguła) | 2/10 |");
    expect(result.stdout.trimEnd().endsWith(COMMENT_MARKER)).toBe(true);
  });

  it.each(NO_VERDICT_REASONS)("renders a no-verdict comment for %s", async (reason) => {
    const result = await runComment(["--no-verdict", reason]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(reason === "empty_diff" ? "✅ pass" : "⚠️ brak werdyktu");
    expect(result.stdout).toContain(COMMENT_MARKER);
  });

  it("exits 1 with empty stdout for a file that does not match the schema", async () => {
    const result = await runComment(["--review", writeTemp("bad.json", JSON.stringify({ verdict: "pass" }))]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("REVIEW_SCHEMA");
  });

  it("exits 1 with empty stdout for invalid JSON", async () => {
    const result = await runComment(["--review", writeTemp("bad.json", "{not json")]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
  });

  it("exits 1 for an unknown reason or flag", async () => {
    const unknownReason = await runComment(["--no-verdict", "nope"]);
    const unknownFlag = await runComment(["--verdict", "pass"]);

    expect(unknownReason.code).toBe(1);
    expect(unknownReason.stdout).toBe("");
    expect(unknownFlag.code).toBe(1);
    expect(unknownFlag.stderr).toContain("Użycie");
  });
});
