/**
 * Push the current committed main to GitHub using GITHUB_TOKEN from the env.
 * The token is never echoed — all output is masked before printing.
 * Run: bun scripts/push-main.ts
 */

import { execSync } from "child_process";

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("ERROR: GITHUB_TOKEN not in environment");
  process.exit(1);
}

const remote = `https://builtbymk-ai:${TOKEN}@github.com/builtbymk-ai/brain-app.git`;
const mask = (s: string) => (TOKEN ? s.split(TOKEN).join("***") : s);

try {
  const out = execSync(`git push ${remote} main 2>&1`, {
    encoding: "utf-8",
    timeout: 120000,
  });
  console.log(mask(out));
  console.log("Push complete -> https://github.com/builtbymk-ai/brain-app");
} catch (e: any) {
  console.error(mask(String(e.stdout ?? "")));
  console.error(mask(String(e.message ?? "")).slice(0, 800));
  process.exit(1);
}
