/**
 * GitHub API client for BRAIN.
 *
 * Server-side only — the token is never exposed to the browser.
 * Used for repository management, code deployment and version control.
 */

import { env } from './env';

const GITHUB_API_BASE = 'https://api.github.com';

// ---------------------------------------------------------------------------

/** Authenticated GitHub user profile (safe subset). */
export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
  avatar_url: string;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
}

/** Repository summary (safe subset). */
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
}

/** Branch summary. */
export interface GitHubBranch {
  name: string;
  commit: { sha: string; url: string };
  protected: boolean;
}

/** Commit detail. */
export interface GitHubCommit {
  sha: string;
  commit: {
    author: { name: string; date: string } | null;
    message: string;
  };
  html_url: string;
}

/** Create repository request. */
export interface CreateRepoRequest {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
  gitignore_template?: string;
  license_template?: string;
}

/** Create file request. */
export interface CreateFileRequest {
  message: string;
  content: string; // Base64-encoded
  branch?: string;
}

/** Create file response. */
export interface CreateFileResponse {
  content: {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
  };
  commit: {
    sha: string;
    message: string;
  };
}

/** Workflow run summary. */
export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  head_branch: string;
  head_sha: string;
  html_url: string;
}

// ---------------------------------------------------------------------------

/**
 * Make an authenticated request to the GitHub API.
 * Returns the parsed JSON response, or null on failure.
 */
async function githubFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T | null> {
  const token = env.githubToken;
  if (!token) return null;

  const url = `${GITHUB_API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string> | undefined),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg =
        (errorBody as { message?: string }).message?.slice(0, 200) ??
        'unknown error';
      console.warn(
        `GitHub API: ${options.method ?? 'GET'} ${endpoint} HTTP ${response.status} — ${errorMsg}`,
      );
      return null;
    }

    // 204 No Content (e.g. for delete operations)
    if (response.status === 204) return null;

    return (await response.json()) as T;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    console.warn(`GitHub API: ${endpoint} failed — ${message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------

/** Get the authenticated user's profile. */
export async function getAuthenticatedUser(): Promise<GitHubUser | null> {
  return githubFetch<GitHubUser>('/user');
}

/** List the authenticated user's repositories. */
export async function listRepositories(
  page = 1,
  perPage = 30,
  sort: 'created' | 'updated' | 'pushed' | 'full_name' = 'updated',
): Promise<GitHubRepo[] | null> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    sort,
  });
  return githubFetch<GitHubRepo[]>(`/user/repos?${params}`);
}

/** Get a specific repository. */
export async function getRepository(
  owner: string,
  repo: string,
): Promise<GitHubRepo | null> {
  return githubFetch<GitHubRepo>(`/repos/${owner}/${repo}`);
}

/** Create a new repository for the authenticated user. */
export async function createRepository(
  request: CreateRepoRequest,
): Promise<GitHubRepo | null> {
  return githubFetch<GitHubRepo>('/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: request.name,
      description: request.description ?? '',
      private: request.private ?? false,
      auto_init: request.auto_init ?? true,
      ...(request.gitignore_template
        ? { gitignore_template: request.gitignore_template }
        : {}),
      ...(request.license_template
        ? { license_template: request.license_template }
        : {}),
    }),
  });
}

/** List branches for a repository. */
export async function listBranches(
  owner: string,
  repo: string,
): Promise<GitHubBranch[] | null> {
  return githubFetch<GitHubBranch[]>(`/repos/${owner}/${repo}/branches`);
}

/** Create or update a file in a repository. */
export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  request: CreateFileRequest,
): Promise<CreateFileResponse | null> {
  return githubFetch<CreateFileResponse>(
    `/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: request.message,
        content: request.content,
        ...(request.branch ? { branch: request.branch } : {}),
      }),
    },
  );
}

/** List recent commits for a repository. */
export async function listCommits(
  owner: string,
  repo: string,
  branch = 'main',
  perPage = 10,
): Promise<GitHubCommit[] | null> {
  const params = new URLSearchParams({
    sha: branch,
    per_page: String(perPage),
  });
  return githubFetch<GitHubCommit[]>(`/repos/${owner}/${repo}/commits?${params}`);
}

/** List workflow runs for a repository. */
export async function listWorkflowRuns(
  owner: string,
  repo: string,
  perPage = 5,
): Promise<{ workflow_runs: GitHubWorkflowRun[] } | null> {
  const params = new URLSearchParams({ per_page: String(perPage) });
  return githubFetch<{ workflow_runs: GitHubWorkflowRun[] }>(
    `/repos/${owner}/${repo}/actions/runs?${params}`,
  );
}

/** Check if the GitHub token is configured and valid. */
export async function checkGitHubConnection(): Promise<{
  connected: boolean;
  user: GitHubUser | null;
  tokenPresent: boolean;
}> {
  const tokenPresent = Boolean(env.githubToken);
  if (!tokenPresent) {
    return { connected: false, user: null, tokenPresent: false };
  }

  const user = await getAuthenticatedUser();
  return { connected: Boolean(user), user, tokenPresent: true };
}
