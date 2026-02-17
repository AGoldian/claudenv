---
description: Recommend and configure MCP servers based on project analysis
allowed-tools: Read, Write, Glob, Grep, Bash(curl:*), Bash(find:*), Bash(cat:*)
disable-model-invocation: true
argument-hint: [--force]
---

# MCP Server Setup

You are configuring MCP servers for this project. Analyze the tech stack, search the official MCP Registry, verify trust signals, and generate `.mcp.json`.

## Step 1: Analyze the Project

Understand what this project uses:

**Read existing documentation:**
- Read CLAUDE.md if it exists — it contains the tech stack summary
- Read _state.md if it exists

**Check for existing MCP config:**
- Read `.mcp.json` if it exists — you will merge new entries, not overwrite

**Scan manifest files:**
!`find . -maxdepth 3 \( -name "package.json" -o -name "pyproject.toml" -o -name "go.mod" -o -name "Cargo.toml" -o -name "Gemfile" -o -name "composer.json" -o -name "requirements.txt" \) -not -path "*/node_modules/*" -not -path "*/.venv/*" -not -path "*/vendor/*" 2>/dev/null | head -20`

**Scan framework and tooling configs:**
!`find . -maxdepth 2 \( -name "tsconfig*.json" -o -name "next.config.*" -o -name "vite.config.*" -o -name "docker-compose.*" -o -name "Dockerfile" -o -name ".env*" -o -name "prisma" -o -name "drizzle.config.*" \) -not -path "*/node_modules/*" 2>/dev/null | head -20`

Read the manifest files you found. Identify:
- Programming languages and frameworks
- Databases (PostgreSQL, MongoDB, Redis, etc.)
- Cloud services (AWS, GCP, Azure)
- External APIs (Stripe, Sentry, etc.)
- Dev tools (Docker, GitHub Actions, etc.)

## Step 2: Search the MCP Registry

Read the MCP server reference for search and evaluation guidance:
@~/.claude/skills/claudenv/templates/mcp-servers.md

For each major technology in the project, search the official MCP Registry API:
```bash
curl -s 'https://registry.modelcontextprotocol.io/v0.1/servers?search=<tech>&version=latest&limit=10'
```

For each candidate server with an npm package, verify trust by checking monthly downloads:
```bash
curl -s 'https://api.npmjs.org/downloads/point/last-month/<npm-package>'
```

Optionally check GitHub stars for additional trust signal:
```bash
curl -s 'https://api.github.com/repos/<owner>/<repo>'
```

**Filtering rules:**
- Remove servers with <100 monthly npm downloads
- Rank by: npm downloads (primary) + GitHub stars (secondary) + description relevance
- When multiple servers exist for the same technology, pick the one with the highest downloads

## Step 3: Present Recommendations

Group your recommendations into three tiers:

**Essential** — servers that directly support the project's core technologies (e.g., PostgreSQL server for a project using PostgreSQL)

**Recommended** — servers that enhance the development workflow (e.g., Context7 for library docs, GitHub for repo management)

**Optional** — servers that could be useful but aren't critical (e.g., Fetch for web content, Docker if Docker is used occasionally)

For each recommendation, explain:
- **What it does** and why it's relevant to THIS project
- **Monthly npm downloads** (trust signal)
- **Environment variables required** and whether they need secrets

Ask the user which servers to configure.

If `$ARGUMENTS` includes `--force`, auto-select all Essential and Recommended servers.

## Step 4: Generate .mcp.json

Build the `.mcp.json` file with the selected servers following the format in the MCP server reference.

**If `.mcp.json` already exists:**
- Read it and parse the existing `mcpServers` entries
- Merge new servers into the existing config — do NOT remove or overwrite existing entries
- If a server key already exists, skip it (preserve the user's existing config)

**Key rules:**
- Use `${ENV_VAR}` placeholders for ALL secret environment variables — NEVER literal values
- Non-secret env vars can use literal values when appropriate
- Use `npx -y <package>@latest` for stdio/npm servers
- Use the `type` and `url` from remotes for HTTP/SSE servers

Write the `.mcp.json` file.

## Step 5: Update CLAUDE.md

If CLAUDE.md exists, add or update an `## MCP Servers` section listing the configured servers and what they do. Keep it concise — one line per server.

If CLAUDE.md doesn't exist, skip this step and suggest running `/claudenv` first.

## Step 6: Environment Variables

List all required environment variables and how to configure them:

```
To configure secrets, run:
  claude config set env.VAR_NAME "your-value"

Required environment variables:
  VAR_NAME — Description of what this is and where to get it
```

Remind the user that `.mcp.json` is safe to commit — it only contains placeholders, not actual secrets.
