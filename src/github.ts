const GITHUB_API = "https://api.github.com";
const UA = "asterpay-radar/1.0 (MCP)";

function getToken(): string {
  return process.env.GITHUB_TOKEN || "";
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": UA,
  };
  const token = getToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  fork: boolean;
  owner: { login: string; avatar_url: string };
  license: { spdx_id: string } | null;
}

export interface SearchResult {
  total_count: number;
  items: GitHubRepo[];
}

export async function searchRepos(
  query: string,
  createdAfter?: string,
  sort: "updated" | "stars" | "forks" = "updated",
  perPage = 30
): Promise<SearchResult> {
  const fullQuery = createdAfter
    ? `${query} created:>${createdAfter}`
    : query;
  const params = new URLSearchParams({
    q: fullQuery,
    sort,
    order: "desc",
    per_page: String(perPage),
  });

  const res = await fetch(`${GITHUB_API}/search/repositories?${params}`, {
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 403) {
    throw new Error(
      "GitHub API rate limit reached. Set GITHUB_TOKEN for higher limits."
    );
  }
  if (res.status === 422) {
    throw new Error(`GitHub rejected the search query: ${query}`);
  }
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as SearchResult;
}

export async function getReadme(
  owner: string,
  repo: string
): Promise<string> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`, {
      headers: headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status !== 200) return "";
    const data = (await res.json()) as { content?: string };
    if (!data.content) return "";
    return Buffer.from(data.content, "base64")
      .toString("utf-8")
      .slice(0, 5000);
  } catch {
    return "";
  }
}

export async function getRepo(
  owner: string,
  repo: string
): Promise<GitHubRepo> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: headers(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(
      `GitHub API error fetching ${owner}/${repo}: ${res.status}`
    );
  }
  return (await res.json()) as GitHubRepo;
}

export async function getTrendingRepos(
  language?: string,
  period: "daily" | "weekly" | "monthly" = "weekly",
  perPage = 20
): Promise<GitHubRepo[]> {
  const now = new Date();
  const daysBack =
    period === "daily" ? 1 : period === "weekly" ? 7 : 30;
  const since = new Date(now.getTime() - daysBack * 86_400_000);
  const sinceStr = since.toISOString().slice(0, 10);

  const langFilter = language ? ` language:${language}` : "";
  const query = `created:>${sinceStr}${langFilter} stars:>5`;

  const result = await searchRepos(query, undefined, "stars", perPage);
  return result.items;
}

export function intervalToDays(
  interval: "daily" | "weekly" | "monthly"
): number {
  switch (interval) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "monthly":
      return 30;
  }
}
