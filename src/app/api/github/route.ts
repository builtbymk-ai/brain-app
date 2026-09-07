/**
 * GitHub integration API routes.
 *
 * GET  /api/github          — connection status
 * GET  /api/github/repos    — list repositories
 * POST /api/github/repos    — create a repository
 * GET  /api/github/repos/:owner/:repo — repository detail
 * GET  /api/github/repos/:owner/:repo/branches — list branches
 * GET  /api/github/repos/:owner/:repo/commits  — recent commits
 * GET  /api/github/repos/:owner/:repo/workflows — recent workflow runs
 */

import { NextResponse } from 'next/server';
import {
  checkGitHubConnection,
  listRepositories,
  createRepository,
  getRepository,
  listBranches,
  listCommits,
  listWorkflowRuns,
} from '@/lib/github';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ---------------------------------------------------------------------------

/** GET /api/github — connection status and authenticated user info. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  // Default: connection check
  if (!action || action === 'status') {
    const status = await checkGitHubConnection();
    return NextResponse.json({
      connected: status.connected,
      tokenPresent: status.tokenPresent,
      user: status.user
        ? {
            login: status.user.login,
            name: status.user.name,
            email: status.user.email,
            avatar_url: status.user.avatar_url,
            bio: status.user.bio,
            public_repos: status.user.public_repos,
          }
        : null,
    });
  }

  if (action === 'repos') {
    const page = Number(searchParams.get('page') ?? '1');
    const perPage = Number(searchParams.get('per_page') ?? '30');
    const repos = await listRepositories(page, perPage);
    if (!repos) {
      return NextResponse.json(
        { error: 'Failed to list repositories. Check your GitHub token.' },
        { status: 502 },
      );
    }
    return NextResponse.json({
      repositories: repos.map((r) => ({
        name: r.name,
        full_name: r.full_name,
        description: r.description,
        private: r.private,
        html_url: r.html_url,
        language: r.language,
        stargazers_count: r.stargazers_count,
        forks_count: r.forks_count,
        updated_at: r.updated_at,
        pushed_at: r.pushed_at,
      })),
    });
  }

  if (action === 'repo') {
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing owner or repo parameter' },
        { status: 400 },
      );
    }
    const details = await getRepository(owner, repo);
    if (!details) {
      return NextResponse.json(
        { error: `Repository ${owner}/${repo} not found or access denied` },
        { status: 404 },
      );
    }
    return NextResponse.json({
      repository: {
        name: details.name,
        full_name: details.full_name,
        description: details.description,
        private: details.private,
        html_url: details.html_url,
        language: details.language,
        default_branch: details.default_branch,
        created_at: details.created_at,
        updated_at: details.updated_at,
        pushed_at: details.pushed_at,
        stargazers_count: details.stargazers_count,
        forks_count: details.forks_count,
      },
    });
  }

  if (action === 'branches') {
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing owner or repo parameter' },
        { status: 400 },
      );
    }
    const branches = await listBranches(owner, repo);
    if (!branches) {
      return NextResponse.json(
        { error: 'Failed to list branches' },
        { status: 502 },
      );
    }
    return NextResponse.json({
      branches: branches.map((b) => ({
        name: b.name,
        sha: b.commit.sha,
        protected: b.protected,
      })),
    });
  }

  if (action === 'commits') {
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const branch = searchParams.get('branch') ?? 'main';
    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing owner or repo parameter' },
        { status: 400 },
      );
    }
    const commits = await listCommits(owner, repo, branch);
    if (!commits) {
      return NextResponse.json(
        { error: 'Failed to list commits' },
        { status: 502 },
      );
    }
    return NextResponse.json({
      commits: commits.map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author?.name ?? 'Unknown',
        date: c.commit.author?.date ?? null,
        url: c.html_url,
      })),
    });
  }

  if (action === 'workflows') {
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing owner or repo parameter' },
        { status: 400 },
      );
    }
    const runs = await listWorkflowRuns(owner, repo);
    if (!runs) {
      return NextResponse.json(
        { error: 'Failed to list workflow runs' },
        { status: 502 },
      );
    }
    return NextResponse.json({
      workflow_runs: runs.workflow_runs.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        branch: r.head_branch,
        sha: r.head_sha,
        created_at: r.created_at,
        updated_at: r.updated_at,
        url: r.html_url,
      })),
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// ---------------------------------------------------------------------------

/** POST /api/github — create a repository. */
export async function POST(request: Request) {
  let body: {
    name?: string;
    description?: string;
    private?: boolean;
    auto_init?: boolean;
    gitignore_template?: string;
    license_template?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json(
      { error: 'Repository name is required' },
      { status: 400 },
    );
  }

  // Validate name: alphanumeric, hyphens, underscores only (GitHub rule)
  if (!/^[a-zA-Z0-9._-]+$/.test(body.name)) {
    return NextResponse.json(
      {
        error:
          'Repository name may only contain alphanumeric characters, hyphens, underscores, and periods',
      },
      { status: 400 },
    );
  }

  const repo = await createRepository({
    name: body.name,
    description: body.description,
    private: body.private ?? false,
    auto_init: body.auto_init ?? true,
    gitignore_template: body.gitignore_template,
    license_template: body.license_template,
  });

  if (!repo) {
    return NextResponse.json(
      {
        error:
          'Failed to create repository. Check your GitHub token has repo scope.',
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    repository: {
      name: repo.name,
      full_name: repo.full_name,
      html_url: repo.html_url,
      private: repo.private,
      default_branch: repo.default_branch,
      created_at: repo.created_at,
    },
  });
}
