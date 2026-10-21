// Zero dependencies on purpose. Fails when a cleaned view uses a hard-coded color or arbitrary value
// instead of a design token (pattern from .claude/skills/10x-ui). Tokens live in src/styles/global.css.
//   node scripts/ui-literal-scan.mjs              -> scan every cleaned file
//   node scripts/ui-literal-scan.mjs <files...>   -> scan only the given files that are on the list (lint-staged)
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

// Views moved onto tokens and ui/* components. Add a file here once its view is cleaned.
const CLEANED = [
  "src/pages/auth/signin.astro",
  "src/pages/auth/signup.astro",
  "src/pages/dev/kitchen-sink.astro",
  "src/components/auth/SignInForm.tsx",
  "src/components/auth/SignUpForm.tsx",
  "src/components/auth/FormField.tsx",
  "src/components/auth/PasswordToggle.tsx",
  "src/components/auth/ServerError.tsx",
  "src/components/auth/SubmitButton.tsx",
  "src/components/dev/SignInStates.tsx",
];

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black";
const LITERAL = new RegExp(
  String.raw`#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|-\[[0-9.]+(px|rem|em|%|vh|vw)\]|\b(bg|text|border(-[xytrbl])?|ring(-offset)?|outline|placeholder|caret|accent|decoration|from|via|to|fill|stroke|shadow|divide)-(${PALETTE})\b`,
);

const toRepoPath = (file) => relative(process.cwd(), resolve(file)).replaceAll("\\", "/");
const args = process.argv.slice(2).map(toRepoPath);
const files = args.length ? args.filter((file) => CLEANED.includes(file)) : CLEANED;

let hits = 0;
for (const file of files) {
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (LITERAL.test(line)) {
        hits++;
        console.log(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
}

if (hits) {
  console.log(
    `\n${hits} hard-coded value(s). Use a token role (bg-primary, text-muted-foreground, ...) from src/styles/global.css.`,
  );
  process.exit(1);
}
console.log(`ui-literal-scan: ${files.length} file(s) clean`);
