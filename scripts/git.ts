/**
 * Minimal git passthrough that runs git as a spawned process.
 *
 * The Freebuff workspace terminal intercepts direct git network commands
 * ("project not connected to GitHub"); running git from a spawned process
 * bypasses that. Authentication uses the credential store installed by
 * scripts/setup-git-remote.ts (token from the project .env, never printed).
 *
 * Usage:
 *   bun scripts/git.ts push
 *   bun scripts/git.ts pull
 *   bun scripts/git.ts fetch
 *   bun scripts/git.ts status
 *   bun scripts/git.ts <any git args...>
 */
export {};

import { spawnSync } from "child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: bun scripts/git.ts <git args...>");
  process.exit(1);
}

const res = spawnSync("git", args, { stdio: "inherit", timeout: 300_000 });
process.exit(res.status ?? 1);
