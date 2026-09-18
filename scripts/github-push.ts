/**
 * GitHub push: stage, commit, and push the BRAIN codebase.
 * Run from /home/daytona/codebase.
 */

import { execSync } from "child_process";

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("ERROR: GITHUB_TOKEN not in environment");
  process.exit(1);
}

const username = "builtbymk-ai";
const repoUrl = `https://${username}:${TOKEN}@github.com/${username}/brain-app.git`;

console.log("=== Setting remote ===");
try { execSync("git remote remove origin", { cwd: "/home/daytona/codebase", stdio: "ignore" }); } catch {}
execSync(`git remote add origin "${repoUrl}"`, { cwd: "/home/daytona/codebase", stdio: "inherit" });
console.log("Remote set.");

console.log("\n=== Staging files ===");
execSync("git add -A", { cwd: "/home/daytona/codebase", stdio: "inherit" });
console.log("Staged.");

console.log("\n=== Committing ===");
const commitMsg = `feat: BRAIN v1.0 — Business Revenue Assessment & Intelligence Node

Full-stack research intelligence platform:
- Next.js 14 + Postgres (Drizzle ORM)
- Multi-source research engine (Firecrawl, Apify, Apollo, SerpAPI)
- Deterministic ACR Revenue Opportunity Calculator
- AI analysis layer (Gemini 3.5/3.6 Flash + OpenRouter fallback + deterministic)
- Owner and Prospect research modes
- Server-side premium paywall (free = 2 rows, paid = all)
- $1.50 structured export (CSV/JSON)
- Bachs payment integration with webhook signature verification
- GitHub API integration
- Editorial teal/ivory design theme`;
execSync(`git commit -m "${commitMsg}"`, { cwd: "/home/daytona/codebase", stdio: "inherit" });
console.log("Committed.");

console.log("\n=== Pushing to GitHub ===");
try {
  execSync("git push -u origin main", { cwd: "/home/daytona/codebase", stdio: "inherit", timeout: 120000 });
  console.log("\n✅ Push complete!");
  console.log(`\nRepository: https://github.com/${username}/brain-app`);
} catch (e: any) {
  console.error("Push failed:", e.message?.slice(0, 500));
  process.exit(1);
}
