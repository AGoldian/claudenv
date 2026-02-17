# MCP Server Reference — Registry Search & Configuration

## 1. How to Search the Registry

The official MCP Registry API provides a searchable catalog of MCP servers. No authentication required.

**Endpoint**: `GET https://registry.modelcontextprotocol.io/v0.1/servers`

**Parameters**:
- `search=<term>` — case-insensitive substring match on server names and descriptions
- `version=latest` — return only the latest version of each server
- `limit=<n>` — max results per page (default ~100)

**Search strategy**:
1. Analyze the project's tech stack from manifest files, configs, and source code
2. Extract key technology names (languages, frameworks, databases, cloud services, tools)
3. Search each technology individually — specific terms yield better results

**Example searches**:
```bash
# Database
curl -s 'https://registry.modelcontextprotocol.io/v0.1/servers?search=postgres&version=latest&limit=10'

# Cloud provider
curl -s 'https://registry.modelcontextprotocol.io/v0.1/servers?search=aws&version=latest&limit=10'

# Monitoring
curl -s 'https://registry.modelcontextprotocol.io/v0.1/servers?search=sentry&version=latest&limit=10'

# Version control
curl -s 'https://registry.modelcontextprotocol.io/v0.1/servers?search=github&version=latest&limit=10'
```

## 2. How to Evaluate and Trust Results

### Primary trust signal: npm download counts

For each candidate server that has an npm package, check monthly downloads:
```bash
curl -s 'https://api.npmjs.org/downloads/point/last-month/<npm-package-name>'
# Returns: { "downloads": N, "package": "...", ... }
```

- **Filter out** servers with <100 monthly downloads — likely unmaintained or experimental
- **Prefer** servers with 10,000+ monthly downloads — well-established and community-trusted
- **Strong signal** at 100,000+ downloads — widely adopted

### Secondary trust signal: GitHub stars

If the server has a repository URL, check GitHub stars:
```bash
curl -s 'https://api.github.com/repos/<owner>/<repo>'
# Check the "stargazers_count" field
```

- Prefer repos with 100+ stars
- Stars indicate community interest but downloads are a stronger usage signal

### Additional evaluation criteria

- **Prefer `packages` (npm/stdio) over `remotes` (hosted)** — stdio runs locally with no external dependency
- **Prefer well-known namespaces**: `io.modelcontextprotocol/*`, `io.github.modelcontextprotocol/*` are official
- **Read descriptions carefully** — pick servers that match the project's actual use case
- **Skip** servers that appear to be forks, test entries, or clearly unmaintained
- **When multiple servers exist for the same tech**, pick the one with highest npm downloads
- **Check `environmentVariables`** — servers requiring many complex env vars may be harder to set up

## 3. How to Build .mcp.json

The `.mcp.json` file configures MCP servers for a project. It lives in the project root.

**Root structure**:
```json
{
  "mcpServers": {
    "server-name": { ... }
  }
}
```

### stdio servers (npm packages)

For servers with a `packages` entry of `registryType: "npm"`:
```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "<package-identifier>@latest"],
      "env": {
        "VAR_NAME": "${VAR_NAME}"
      }
    }
  }
}
```

- Add any `packageArguments` with `type: "positional"` to the `args` array after the package name
- Map `environmentVariables` to the `env` object
- Use `${ENV_VAR}` placeholders for all variables with `isSecret: true`
- Non-secret env vars can use literal values when the value is project-specific and non-sensitive

### HTTP/SSE servers (remote)

For servers with a `remotes` entry:
```json
{
  "mcpServers": {
    "server-name": {
      "type": "streamable-http",
      "url": "https://example.com/mcp"
    }
  }
}
```

Use the `type` and `url` from the remote entry directly. Add `headers` if authentication is needed:
```json
{
  "type": "streamable-http",
  "url": "https://example.com/mcp",
  "headers": {
    "Authorization": "Bearer ${API_KEY}"
  }
}
```

## 4. Well-Known Servers

These are hints to help find the best option when search results are noisy. Always verify via the registry API — these names and packages may change.

| Technology | Search term | Known namespace | Notes |
|---|---|---|---|
| Library docs | `context7` | `io.github.upstash/context7` | Up-to-date docs for any library; useful for most projects |
| GitHub | `github` | `io.github.modelcontextprotocol/github` | Repo management, PRs, issues |
| PostgreSQL | `postgres` | `io.github.modelcontextprotocol/postgres` | Database queries; prefer read-only config |
| Filesystem | `filesystem` | `io.github.modelcontextprotocol/filesystem` | Scoped file access |
| Fetch | `fetch` | `io.github.modelcontextprotocol/fetch` | Web content retrieval |
| Sentry | `sentry` | — | Error tracking integration |
| Stripe | `stripe` | — | Payment API |
| Docker | `docker` | — | Container management |
| AWS | `aws` | — | Cloud services |
| Redis | `redis` | — | Cache and data store |
| MongoDB | `mongodb` | — | Document database |
| Slack | `slack` | — | Team communication |
| Linear | `linear` | — | Issue tracking |

## 5. Security Rules

### Secrets management
- **NEVER** put actual secret values in `.mcp.json` — use `${ENV_VAR}` placeholders
- Secret values go in `~/.claude.json` (user-level config, not committed to version control)
- Tell the user how to configure each secret:
  ```
  claude config set env.VAR_NAME "actual-value"
  ```

### Safe to commit
- `.mcp.json` is safe to commit to version control — it contains only placeholders, never real secrets
- Add `.mcp.json` to the git commit alongside other Claude Code config files

### Database safety
- Prefer read-only database connection strings
- If read-write access is needed, document this clearly in the recommendation

### Principle of least privilege
- Only recommend servers that the project actually needs
- Prefer servers with narrow, well-defined capabilities over general-purpose ones
