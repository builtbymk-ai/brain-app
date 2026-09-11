/**
 * GitHub setup script: verify token, create repo, push codebase.
 */
export {};

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("ERROR: GITHUB_TOKEN not found in environment.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

async function api(path: string, method = "GET", body?: Record<string, unknown>) {
  const resp = await fetch(`https://api.github.com${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: resp.status, data };
}

// 1. Verify token / get user info
console.log("=== 1. Verifying GitHub token ===");
const user = await api("/user");
if (user.status !== 200) {
  console.error(`Token verification failed (${user.status}):`, JSON.stringify(user.data).slice(0, 300));
  process.exit(1);
}
console.log(`Authenticated as: ${user.data.login} (${user.data.name || "no name"})`);

const username: string = user.data.login;

// 2. Check if BRAIN repo already exists
console.log("\n=== 2. Checking for existing repo ===");
const existing = await api(`/repos/${username}/brain-app`);
if (existing.status === 200) {
  console.log(`Repo already exists: ${existing.data.html_url}`);
  console.log("Setting remote and pushing...");
  const { execSync } = await import("child_process");
  try {
    execSync(`git -C / remote remove origin 2>/dev/null || true`);
    execSync(`git -C / remote add origin https://${username}:$(echo $GITHUB_TOKEN | head -c 4)xxx@github.com/${username}/brain-app.git`, { stdio: "inherit" });
  } catch {}
  process.exit(0);
}

// 3. Create the repo
console.log("\n=== 3. Creating repository ===");
const create = await api("/user/repos", "POST", {
  name: "brain-app",
  description: "BRAIN — Business Revenue Assessment & Intelligence Node. Full-stack research intelligence platform.",
  private: false,
  auto_init: false,
});

if (create.status !== 201) {
  // Maybe name taken with different casing, check
  const check = await api(`/repos/${username}/brain-app`);
  if (check.status === 200) {
    console.log(`Repo exists at: ${check.data.html_url}`);
  } else {
    console.error(`Failed to create repo (${create.status}):`, JSON.stringify(create.data).slice(0, 500));
    process.exit(1);
  }
} else {
  console.log(`Repo created: ${create.data.html_url}`);
}

// 4. Configure git remote
console.log("\n=== 4. Configuring git remote ===");
const { execSync } = await import("child_process");
try { execSync("git -C / remote remove origin 2>/dev/null", { stdio: "ignore" }); } catch {}
execSync(`git -C / remote add origin https://${username}:$(echo $GITHUB_TOKEN)@github.com/${username}/brain-app.git`, { stdio: "inherit" });
console.log("Remote added.");

// 5. Stage, commit, and push
console.log("\n=== 5. Staging and committing ===");
execSync("git -C / add -A", { stdio: "inherit" });
const commitMsg = `feat: BRAIN v1.0 — Business Revenue Assessment & Intelligence Node

Full-stack research intelligence platform:
- Next.js 14 + Postgres (Drizzle ORM)
- Multi-source research engine (Firecrawl, Apify, Apollo, SerpAPI)
- Deterministic ACR Revenue Opportunity Calculator
- AI analysis layer (Gemini 3.5/3.6 Flash primary, OpenRouter fallback, deterministic)
- Owner and Prospect research modes
- Server-side premium paywall
- $1.50 structured export (CSV/JSON)
- Bachs payment integration
- Webhook signature verification
- GitHub API integration
- Editorial teal/ivory design theme`;
execSync(`git -C / commit -m "${commitMsg}"`, { stdio: "inherit" });
console.log("Committed.");

console.log("\n=== 6. Pushing to GitHub ===");
try {
  execSync("git -C / push -u origin main --force", { stdio: "inherit", timeout: 120000 });
  console.log("\n✅ Push complete!");
} catch (e: any) {
  console.error("Push failed:", e.message?.slice(0, 500));
  process.exit(1);
}

console.log(`\n=== DONE ===`);
console.log(`Repository: https://github.com/${username}/brain-app`);
