/** Post-push verification: remote commit log + tree sanity checks. */
export {};

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("ERROR: GITHUB_TOKEN not found in environment.");
  process.exit(1);
}
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
};
const REPO = "builtbymk-ai/brain-app";

const commits = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=4`, { headers }).then((r) =>
  r.json()
);
for (const c of commits) console.log(c.sha.slice(0, 7), c.commit.message.split("\n")[0]);

const tree = await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, { headers }).then((r) =>
  r.json()
);
const paths: string[] = tree.tree.map((t: any) => t.path);

console.log("--- remote tree checks ---");
console.log("total files:", paths.length);
console.log("checkout-redirect present:", paths.includes("src/lib/checkout-redirect.ts"));
console.log("bachs webhook present:", paths.includes("src/app/api/bachs/webhook/route.ts"));
console.log("paystack fully removed:", !paths.some((p) => p.toLowerCase().includes("paystack")));
console.log("solution-classifier present:", paths.includes("src/lib/analysis/solution-classifier.ts"));
console.log("research/return present:", paths.includes("src/app/research/return/page.tsx"));
console.log("docs page present:", paths.includes("src/app/docs/page.tsx"));
console.log(".qa leaked:", paths.some((p) => p.startsWith(".qa/")));
console.log("env file leaked:", paths.some((p) => p.includes(".env")));
console.log("tsbuildinfo leaked:", paths.some((p) => p.includes("tsbuildinfo")));
console.log("scripts leaked:", paths.filter((p) => p.startsWith("scripts/")).length);

// Is there a repo literally named brain-brain-app under any owner?
const search = await fetch("https://api.github.com/search/repositories?q=brain-brain-app+in:name", { headers }).then(
  (r) => r.json()
);
const hits: string[] = (search.items ?? []).map((r: any) => r.full_name);
console.log("--- 'brain-brain-app' search ---");
console.log(hits.length ? hits.join("\n") : "no repo named brain-brain-app exists anywhere accessible");
