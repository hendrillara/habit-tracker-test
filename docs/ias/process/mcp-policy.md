# MCP policy (keep it light)

MCP servers are optional external tools (Perplexity, docs retrievers, issue trackers, etc.). IAS treats them as **situational** helpers, not default context.

> **Note:** Firecrawl is now a CLI skill (not MCP). Install it with `npx skills add firecrawl/cli`, then use the `firecrawl` CLI for web search/scraping.

## When to use MCP

Use MCP primarily for the **Researcher** role, and only when the task depends on current/version-specific facts (see `docs/ias/process/rule-engine.md`).

## How to use MCP (budget + distillation)

- Prefer **small, targeted** queries over broad retrieval.
- Default budget: **max 1–3 MCP calls per research task**.
- Do not paste large raw dumps into the main thread; distill into `docs/ias/templates/research-notes.md`.
- Treat repo/code as sensitive: do not send proprietary code or secrets to external tools.

## Fallback

If MCP is not configured, fall back to built-in web tools (`WebSearch` / `WebFetch`) and proceed with explicit assumptions.

## Canonical setup examples

### Perplexity (official MCP server)

Claude Code:

```bash
claude mcp add perplexity --env PERPLEXITY_API_KEY="your_key_here" -- npx -y @perplexity-ai/mcp-server
```

Codex CLI:

```bash
codex mcp add perplexity --env PERPLEXITY_API_KEY="your_key_here" -- npx -y @perplexity-ai/mcp-server
```

### Context7 (Upstash)

Claude Code (remote server):

```bash
claude mcp add --transport http context7 https://mcp.context7.com/mcp --header "CONTEXT7_API_KEY: YOUR_API_KEY"
```

Claude Code (local stdio):

```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp --api-key YOUR_API_KEY
```
