/** Final verification of the permanent git connection. */
export {};

import { spawnSync } from "child_process";

function run(args: string[], label: string) {
  const res = spawnSync("git", args, { encoding: "utf-8", timeout: 90_000 });
  console.log(`--- ${label} (exit ${res.status}) ---`);
  if (res.stdout?.trim()) console.log(res.stdout.trim().split("\n").slice(0, 6).join("\n"));
  if (res.status !== 0 && res.stderr?.trim()) console.log("stderr:", res.stderr.trim().slice(0, 200));
  return res.status;
}

run(["fetch", "origin", "--dry-run"], "fetch dry-run (auth via credential store)");
run(["push", "origin", "main", "--dry-run"], "push dry-run");
run(["config", "pull.rebase", "true"], "set pull.rebase=true");
run(["config", "user.name"], "git user.name");
run(["config", "user.email"], "git user.email");
run(["remote", "-v"], "remote");
run(["status", "-sb"], "status");
console.log("--- branch backup kept ---");
run(["branch", "--list", "backup/*"], "backup branches");
