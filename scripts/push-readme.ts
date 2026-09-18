import { execSync } from "child_process";

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error("GITHUB_TOKEN missing"); process.exit(1); }

const dir = "/home/daytona/codebase";
const url = `https://builtbymk-ai:${TOKEN}@github.com/builtbymk-ai/brain-app.git`;

execSync("git remote remove origin", { cwd: dir, stdio: "ignore" });
execSync(`git remote add origin "${url}"`, { cwd: dir, stdio: "inherit" });

execSync("git add README.md", { cwd: dir, stdio: "inherit" });
execSync('git commit -m "docs: add comprehensive README.md"', { cwd: dir, stdio: "inherit" });
execSync("git push origin main", { cwd: dir, stdio: "inherit", timeout: 60000 });

// Clean up remote
execSync("git remote remove origin", { cwd: dir, stdio: "ignore" });
execSync("git remote add origin https://github.com/builtbymk-ai/brain-app.git", { cwd: dir, stdio: "inherit" });

console.log("\n✅ README pushed: https://github.com/builtbymk-ai/brain-app");
