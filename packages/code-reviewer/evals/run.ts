// `npm run eval`: runs promptfoo on evals/promptfooconfig.yaml with the settings the suite needs,
// on Windows and Linux alike (npm scripts cannot set env vars portably).
//   npm run eval --prefix packages/code-reviewer -- [promptfoo eval flags, e.g. --repeat 3]
// Exit code is promptfoo's: 0 all passed, 100 a test failed, 1 any other error.
/* eslint-disable no-console -- CLI wrapper */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
// The llm-rubric grader (openrouter:) reads OPENROUTER_API_KEY from this process's env.
loadEnv({ path: join(PACKAGE_DIR, ".env"), quiet: true });
if (!process.env.OPENROUTER_API_KEY) {
  console.error("Brak OPENROUTER_API_KEY w packages/code-reviewer/.env — eval wymaga płatnego klucza OpenRouter.");
  process.exit(1);
}

// promptfoo exports no ./package.json, so resolve its bin from this package (devDependency).
const promptfooBin = join(PACKAGE_DIR, "node_modules/promptfoo/dist/src/entrypoint.js");

const result = spawnSync(
  process.execPath,
  [promptfooBin, "eval", "-c", join(PACKAGE_DIR, "evals/promptfooconfig.yaml"), "--no-cache", ...process.argv.slice(2)],
  {
    cwd: PACKAGE_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      // Diffs with JSX contain {{ }}; keep them away from promptfoo's Nunjucks templating.
      PROMPTFOO_DISABLE_TEMPLATING: "true",
      // No usage telemetry or update checks from an eval of private diffs.
      PROMPTFOO_DISABLE_TELEMETRY: "1",
      PROMPTFOO_DISABLE_UPDATE: "1",
    },
  },
);
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
