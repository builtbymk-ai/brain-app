/** Compare local HEAD tree vs remote main tree to confirm content parity. */
export {};

import { execSync } from "child_process";

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("ERROR: GITHUB_TOKEN not found in environment.");
  process.exit(1);
}
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
};

// 1. Local tracked files + blob SHAs
const localRaw = execSync("git ls-tree -r HEAD", { encoding: "utf-8" });
const local = new Map<string, string>();
for (const line of localRaw.split("\n")) {
  const m = line.match(/^[0-9]+ blob ([0-9a-f]+)\t(.+)$/);
  if (m) local.set(m[2], m[1]);
}

// 2. Remote tree (recursive)
const tree = await fetch("https://api.github.com/repos/builtbymk-ai/brain-app/git/trees/main?recursive=1", {
  headers,
}).then((r) => r.json());
const remote = new Map<string, string>();
for (const t of tree.tree) if (t.type === "blob") remote.set(t.path, t.sha);

// 3. Diff
const onlyLocal: string[] = [];
const onlyRemote: string[] = [];
const contentDiff: string[] = [];
for (const [p, sha] of local) {
  if (!remote.has(p)) onlyLocal.push(p);
  else if (remote.get(p) !== sha) contentDiff.push(p);
}
for (const p of remote.keys()) if (!local.has(p)) onlyRemote.push(p);

console.log("local tracked files:", local.size);
console.log("remote files:", remote.size);
console.log("only in local (would be lost on remote-style reset):", onlyLocal.length ? onlyLocal : "none");
console.log("only in remote (untracked/new):", onlyRemote.length ? onlyRemote : "none");
console.log("content differs:", contentDiff.length ? contentDiff : "none");
