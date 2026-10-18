# ascope-mcp

MCP server for [Ascope](https://ascope.app), a native macOS app that tracks App Store keyword rankings. It lets Cursor, Claude Code, Claude Desktop and any other MCP client read your rankings, research keywords and manage what you track.

This package is a small bridge: it speaks stdio to your assistant and forwards every call to the MCP server that Ascope runs on your own Mac. No data leaves your machine, and there is no API key.

## Requirements

- macOS 14 Sonoma or later with [Ascope](https://ascope.app) installed and a Pro license
- Ascope open, with the server enabled in **Settings → MCP**
- Node.js 18 or later

## Install

### Cursor

Add this to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ascope": {
      "command": "npx",
      "args": ["-y", "ascope-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add ascope -- npx -y ascope-mcp
```

### Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ascope": {
      "command": "npx",
      "args": ["-y", "ascope-mcp"]
    }
  }
}
```

Clients that support MCP over Streamable HTTP can also point straight at `http://127.0.0.1:47321/mcp` without this package.

## Tools

| Tool | What it does |
| --- | --- |
| `list_apps` | List the apps you track, with keyword counts. |
| `list_keywords` | Tracked keywords for an app with rank, change, popularity and difficulty. |
| `keyword_history` | Daily rank history of one tracked keyword. |
| `add_keywords` | Start tracking keywords and fetch their rank, popularity and difficulty. |
| `remove_keywords` | Stop tracking keywords. |
| `refresh_rankings` | Fetch fresh rankings for all or some of an app's keywords. |
| `research_keyword` | Look up any keyword without tracking it: popularity, difficulty, top apps and your rank. |
| `suggest_keywords` | Keyword ideas from App Store search suggestions, with popularity for the strongest. |
| `search_apps` | Search the App Store to find an app ID. |
| `similar_apps` | Apps the App Store recommends next to any iPhone app: its closest competitors. |
| `add_app` | Start tracking an app by its App Store ID. |

## Things to ask

- "Which of my keywords dropped more than 5 places this week?"
- "Find 10 keywords with popularity above 30 and difficulty below 50 for my app in Germany, then start tracking them."
- "Compare where I rank for *habit tracker* in the US, UK and Canada."
- "Research *budget planner*: who are the top apps and how hard is it to rank?"

## Configuration

The bridge finds Ascope on `http://127.0.0.1:47321/mcp`. If you changed the port in Settings → MCP it is picked up automatically; you can also set it explicitly:

```bash
ASCOPE_MCP_URL=http://127.0.0.1:50000/mcp npx -y ascope-mcp
```

## License

MIT
