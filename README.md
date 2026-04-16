# Radar

MCP Server that scans GitHub for repositories matching your keywords, scores them, and returns ranked results. Optionally sends Telegram alerts.

Built for tracking the [x402](https://x402.org) and agent payment ecosystem, but works for any topic — swap the keywords and you're set.

## Setup

Add to your MCP client config (Cursor, Claude Code, Claude Desktop, Copilot, Windsurf — anything that speaks MCP):

```json
{
  "mcpServers": {
    "radar": {
      "command": "npx",
      "args": ["-y", "@AsterPay/radar"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

Or clone and run locally:

```bash
git clone https://github.com/petteri74dev/radar.git
cd radar && npm install && npm run build
```

```json
{
  "mcpServers": {
    "radar": {
      "command": "node",
      "args": ["/path/to/radar/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

## Tools

**scan_repos** — Search GitHub, score results by keyword relevance, return the top hits.

**get_trending** — Trending repos by language and time period.

**compare_repos** — Side-by-side comparison of two repos: stars, activity, relevance score.

**configure_keywords** — Change scoring keywords, search queries, and thresholds during your session.

## Telegram alerts (optional)

If you set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in env, scan results above the threshold are forwarded to your Telegram chat automatically.

## Environment variables

| Variable | Required | What it does |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Recommended | GitHub PAT — raises API rate limits from 10 to 30 requests/min |
| `TELEGRAM_BOT_TOKEN` | No | Enables Telegram alerts |
| `TELEGRAM_CHAT_ID` | No | Target chat for alerts |

## Default keywords

The built-in scoring rules are tuned for agent commerce and x402 ecosystem tracking. You can replace them entirely per session via `configure_keywords`.

| Keyword group | Points |
|---------------|--------|
| x402 | +3 |
| ERC-8004 | +3 |
| facilitator | +2 |
| EURC / EUR settlement / SEPA | +2 |
| MiCA | +2 |
| telecom / CAMARA | +1 |
| payment + agent (combo) | +2 |

## Related

- [AsterPay](https://asterpay.io) — Fiat settlement infrastructure for agent commerce
- [Probe](https://getprobe.xyz) — Agent trust scoring and API security audits

## License

MIT
