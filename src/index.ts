#!/usr/bin/env node
/**
 * @asterpay/radar — GitHub Ecosystem Intelligence MCP Server
 *
 * 4 tools for AI agents:
 *   scan_repos        — Scan GitHub for repos matching keywords, score & rank them
 *   get_trending      — Discover trending repos by language and time period
 *   compare_repos     — Side-by-side comparison of two GitHub repositories
 *   configure_keywords — Set custom scoring keywords and search queries
 *
 * Requires: GITHUB_TOKEN env var (for reasonable rate limits)
 * Install:  npx -y @asterpay/radar
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  searchRepos,
  getReadme,
  getRepo,
  getTrendingRepos,
  intervalToDays,
} from "./github.js";
import { scoreRepo } from "./scoring.js";
import {
  getConfig,
  mergeConfig,
  resetConfig,
  type RadarConfig,
  type ScoringRule,
  type ComboRule,
} from "./config.js";
import {
  isTelegramConfigured,
  sendAlert,
  sendBatchSummary,
  type RepoAlert,
} from "./telegram.js";

const server = new McpServer({
  name: "asterpay-radar",
  version: "1.0.0",
});

// ──────────────────────────────────────────
// Tool 1: scan_repos
// ──────────────────────────────────────────

server.tool(
  "scan_repos",
  "Scan GitHub for repositories matching keywords, score them by relevance (x402, ERC-8004, agent payments, stablecoins, etc.), and return the top results ranked by score. Uses built-in or custom scoring rules. Set GITHUB_TOKEN env var for higher rate limits.",
  {
    query: z
      .string()
      .optional()
      .describe(
        "Custom search query. If omitted, runs all configured searches from the keyword list."
      ),
    period: z
      .enum(["daily", "weekly", "monthly"])
      .optional()
      .describe("Only find repos created within this period (default: weekly)"),
    top_n: z
      .number()
      .optional()
      .describe("Number of top-scored results to return (default: 10)"),
    min_score: z
      .number()
      .optional()
      .describe(
        "Minimum score threshold to include a repo (default: from config, typically 4)"
      ),
    include_readme: z
      .boolean()
      .optional()
      .describe(
        "Fetch and include README content for scoring (slower but more accurate, default: true)"
      ),
  },
  async ({ query, period, top_n, min_score, include_readme }) => {
    const config = getConfig();
    const topN = top_n ?? 10;
    const threshold = min_score ?? config.scoreThreshold;
    const fetchReadme = include_readme ?? true;
    const interval = period ?? "weekly";

    const now = new Date();
    const daysBack = intervalToDays(interval);
    const since = new Date(now.getTime() - daysBack * 86_400_000);
    const sinceStr = since.toISOString().slice(0, 10);

    const queries = query ? [query] : config.searches.map((s) => s.query);
    const seenIds = new Set<number>();

    interface ScoredRepo {
      full_name: string;
      html_url: string;
      description: string;
      language: string;
      stars: number;
      forks: number;
      created_at: string;
      score: number;
      reasons: string[];
    }

    const allResults: ScoredRepo[] = [];

    for (const q of queries) {
      try {
        const result = await searchRepos(q, sinceStr);
        for (const repo of result.items) {
          if (seenIds.has(repo.id) || repo.fork) continue;
          seenIds.add(repo.id);

          let readme = "";
          if (fetchReadme) {
            const [owner, name] = repo.full_name.split("/");
            readme = await getReadme(owner, name);
          }

          const { score, reasons } = scoreRepo(
            repo.description || "",
            repo.topics || [],
            readme,
            config.scoringRules,
            config.comboRules
          );

          if (score >= threshold) {
            allResults.push({
              full_name: repo.full_name,
              html_url: repo.html_url,
              description: repo.description || "",
              language: repo.language || "unknown",
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              created_at: repo.created_at,
              score,
              reasons,
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        allResults.push({
          full_name: `_error/${q}`,
          html_url: "",
          description: `Search error: ${msg}`,
          language: "",
          stars: 0,
          forks: 0,
          created_at: "",
          score: -1,
          reasons: ["error"],
        });
      }
    }

    allResults.sort((a, b) => b.score - a.score);
    const top = allResults.filter((r) => r.score >= 0).slice(0, topN);

    let telegramSent = 0;
    if (isTelegramConfigured() && top.length > 0) {
      for (const repo of top) {
        const ok = await sendAlert(repo as RepoAlert);
        if (ok) telegramSent++;
      }
      await sendBatchSummary(top.length, top as RepoAlert[]);
    }

    const summary = {
      total_scanned: seenIds.size,
      results_above_threshold: top.length,
      threshold,
      period: interval,
      since: sinceStr,
      queries_run: queries.length,
      telegram_alerts_sent: telegramSent,
      results: top,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }
);

// ──────────────────────────────────────────
// Tool 2: get_trending
// ──────────────────────────────────────────

server.tool(
  "get_trending",
  "Get currently trending GitHub repositories, optionally filtered by programming language. Returns repos sorted by stars, created within the specified time period.",
  {
    language: z
      .string()
      .optional()
      .describe(
        "Programming language filter (e.g. 'typescript', 'python', 'rust')"
      ),
    period: z
      .enum(["daily", "weekly", "monthly"])
      .optional()
      .describe("Time period for trending (default: weekly)"),
    count: z
      .number()
      .optional()
      .describe("Number of repos to return (default: 15, max: 30)"),
  },
  async ({ language, period, count }) => {
    const n = Math.min(count ?? 15, 30);
    const repos = await getTrendingRepos(language, period ?? "weekly", n);

    const results = repos.map((r) => ({
      full_name: r.full_name,
      html_url: r.html_url,
      description: r.description || "",
      language: r.language || "unknown",
      stars: r.stargazers_count,
      forks: r.forks_count,
      created_at: r.created_at,
      topics: r.topics?.slice(0, 5) || [],
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              trending_count: results.length,
              period: period ?? "weekly",
              language: language ?? "all",
              repos: results,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ──────────────────────────────────────────
// Tool 3: compare_repos
// ──────────────────────────────────────────

server.tool(
  "compare_repos",
  "Compare two GitHub repositories side by side. Analyzes stars, forks, activity, language, topics, license, and generates a relevance score for each using the radar scoring engine.",
  {
    repo_a: z
      .string()
      .describe("First repo in owner/name format (e.g. 'coinbase/x402')"),
    repo_b: z
      .string()
      .describe("Second repo in owner/name format (e.g. 'AsterPayDev/asterpay-mcp-server')"),
    include_readme: z
      .boolean()
      .optional()
      .describe("Include README-based scoring (default: true)"),
  },
  async ({ repo_a, repo_b, include_readme }) => {
    const fetchReadme = include_readme ?? true;
    const config = getConfig();

    async function analyzeRepo(fullName: string) {
      const [owner, name] = fullName.split("/");
      if (!owner || !name) throw new Error(`Invalid repo format: ${fullName}`);

      const repo = await getRepo(owner, name);
      let readme = "";
      if (fetchReadme) {
        readme = await getReadme(owner, name);
      }

      const { score, reasons } = scoreRepo(
        repo.description || "",
        repo.topics || [],
        readme,
        config.scoringRules,
        config.comboRules
      );

      const now = new Date();
      const lastPush = new Date(repo.pushed_at);
      const daysSinceLastPush = Math.floor(
        (now.getTime() - lastPush.getTime()) / 86_400_000
      );

      return {
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description || "",
        language: repo.language || "unknown",
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        open_issues: repo.open_issues_count,
        topics: repo.topics || [],
        license: repo.license?.spdx_id || "none",
        created_at: repo.created_at,
        last_push: repo.pushed_at,
        days_since_push: daysSinceLastPush,
        radar_score: score,
        radar_reasons: reasons,
      };
    }

    const [a, b] = await Promise.all([
      analyzeRepo(repo_a),
      analyzeRepo(repo_b),
    ]);

    const verdict: string[] = [];
    if (a.stars > b.stars * 2) verdict.push(`${a.full_name} has significantly more stars`);
    else if (b.stars > a.stars * 2) verdict.push(`${b.full_name} has significantly more stars`);

    if (a.days_since_push < b.days_since_push)
      verdict.push(`${a.full_name} was updated more recently`);
    else if (b.days_since_push < a.days_since_push)
      verdict.push(`${b.full_name} was updated more recently`);

    if (a.radar_score > b.radar_score)
      verdict.push(`${a.full_name} scores higher on radar relevance`);
    else if (b.radar_score > a.radar_score)
      verdict.push(`${b.full_name} scores higher on radar relevance`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { repo_a: a, repo_b: b, verdict },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ──────────────────────────────────────────
// Tool 4: configure_keywords
// ──────────────────────────────────────────

const scoringRuleSchema = z.object({
  points: z.number().describe("Points awarded when any keyword matches"),
  keywords: z
    .array(z.string())
    .describe("List of keywords (any match triggers the rule)"),
});

const comboRuleSchema = z.object({
  points: z.number().describe("Points when both groups match"),
  groupA: z.array(z.string()).describe("First keyword group"),
  groupB: z.array(z.string()).describe("Second keyword group"),
});

const searchSchema = z.object({
  query: z.string().describe("GitHub search query string"),
  interval: z
    .enum(["daily", "weekly", "monthly"])
    .describe("How far back to look"),
});

server.tool(
  "configure_keywords",
  "Set custom scoring keywords, search queries, and score threshold for the radar. Changes persist for the session. Use action 'get' to see current config, 'set' to update, 'reset' to restore defaults, or 'add' to append rules without replacing existing ones.",
  {
    action: z
      .enum(["get", "set", "reset", "add"])
      .describe(
        "'get' returns current config, 'set' replaces config fields, 'reset' restores defaults, 'add' appends to existing rules"
      ),
    scoring_rules: z
      .array(scoringRuleSchema)
      .optional()
      .describe("Keyword scoring rules (for set/add)"),
    combo_rules: z
      .array(comboRuleSchema)
      .optional()
      .describe("Combo scoring rules requiring matches from both groups (for set/add)"),
    searches: z
      .array(searchSchema)
      .optional()
      .describe("Search queries to run (for set/add)"),
    score_threshold: z
      .number()
      .optional()
      .describe("Minimum score to include in results (for set)"),
  },
  async ({ action, scoring_rules, combo_rules, searches, score_threshold }) => {
    let config: RadarConfig;

    switch (action) {
      case "get":
        config = getConfig();
        break;

      case "reset":
        config = resetConfig();
        break;

      case "set":
        config = mergeConfig({
          scoringRules: scoring_rules as ScoringRule[] | undefined,
          comboRules: combo_rules as ComboRule[] | undefined,
          searches: searches as RadarConfig["searches"] | undefined,
          scoreThreshold: score_threshold,
        });
        break;

      case "add": {
        const current = getConfig();
        const newScoringRules = scoring_rules
          ? [...current.scoringRules, ...(scoring_rules as ScoringRule[])]
          : undefined;
        const newComboRules = combo_rules
          ? [...current.comboRules, ...(combo_rules as ComboRule[])]
          : undefined;
        const newSearches = searches
          ? [...current.searches, ...(searches as RadarConfig["searches"])]
          : undefined;
        config = mergeConfig({
          scoringRules: newScoringRules,
          comboRules: newComboRules,
          searches: newSearches,
          scoreThreshold: score_threshold,
        });
        break;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              action,
              config: {
                searches_count: config.searches.length,
                scoring_rules_count: config.scoringRules.length,
                combo_rules_count: config.comboRules.length,
                score_threshold: config.scoreThreshold,
                searches: config.searches,
                scoring_rules: config.scoringRules,
                combo_rules: config.comboRules,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ──────────────────────────────────────────
// Start server
// ──────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("@asterpay/radar MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
