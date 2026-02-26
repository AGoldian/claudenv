# claudenv

One command to set up [Claude Code](https://docs.anthropic.com/en/docs/claude-code) in any project. Claude AI analyzes your codebase and generates all the documentation it needs to work effectively.

## Quick Start

```bash
npm i -g claudenv && claudenv
```

Done. Open Claude Code in any project and type `/claudenv`.

## How It Works

**One-time setup** — install and activate:

```bash
npm i -g claudenv && claudenv
```

This installs the `/claudenv` command globally into `~/.claude/`, making it available in every project.

**In any project** — open Claude Code and type `/claudenv`.

Claude AI will:
1. Read your manifest files, configs, and source code
2. Detect your tech stack, frameworks, and tooling
3. Ask you about the project (description, deployment, conventions)
4. Generate all documentation files
5. Search the [MCP Registry](https://registry.modelcontextprotocol.io) and configure MCP servers
6. Install slash commands for ongoing maintenance

You now have five commands available in Claude Code:

| Command | What it does |
|---------|-------------|
| `/init-docs` | Regenerate documentation from scratch |
| `/update-docs` | Scan for changes and propose updates |
| `/validate-docs` | Check that documentation is complete and correct |
| `/setup-mcp` | Recommend and configure MCP servers |
| `/improve` | Analyze and make one improvement |

## What Gets Generated

```
your-project/
├── CLAUDE.md                              # Project overview, commands, architecture
├── _state.md                              # Session memory (decisions, focus, issues)
├── .mcp.json                              # MCP server configuration
└── .claude/
    ├── rules/
    │   ├── code-style.md                  # Coding conventions (scoped by file paths)
    │   ├── testing.md                     # Test patterns and commands
    │   └── workflow.md                    # Claude Code best practices
    ├── settings.json                      # Validation hooks
    ├── commands/
    │   ├── init-docs.md                   # /init-docs
    │   ├── update-docs.md                 # /update-docs
    │   ├── validate-docs.md              # /validate-docs
    │   ├── setup-mcp.md                  # /setup-mcp
    │   └── improve.md                    # /improve
    ├── skills/
    │   └── doc-generator/                 # Auto-triggers when docs need updating
    └── agents/
        └── doc-analyzer.md                # Read-only analysis subagent
```

### Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Compact project overview with `@import` references to rule files |
| `_state.md` | Persists context between sessions — current focus, decisions, known issues |
| `.claude/rules/workflow.md` | Best practices: plan mode, `/compact`, subagents, git discipline |
| `.claude/rules/code-style.md` | Language and framework-specific coding conventions |
| `.claude/rules/testing.md` | Test framework patterns and commands |
| `.mcp.json` | MCP server configuration with `${ENV_VAR}` placeholders |

## MCP Server Recommendations

`/claudenv` automatically recommends MCP servers based on your tech stack. You can also run `/setup-mcp` independently at any time.

**How it works:**

1. Claude analyzes your project's dependencies, databases, cloud services, and tools
2. Searches the [official MCP Registry](https://registry.modelcontextprotocol.io) for matching servers
3. Verifies trust via npm download counts (filters out servers with <100 monthly downloads)
4. Presents recommendations grouped as **Essential** / **Recommended** / **Optional**
5. Generates `.mcp.json` with selected servers

**Example output** (`.mcp.json`):

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "env": {}
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres@latest", "${POSTGRES_CONNECTION_STRING}"],
      "env": {}
    }
  }
}
```

Secrets use `${ENV_VAR}` placeholders — configure them with:

```bash
claude config set env.POSTGRES_CONNECTION_STRING "postgresql://..."
```

`.mcp.json` is safe to commit — it never contains actual secrets.

Run `/setup-mcp --force` to auto-select Essential + Recommended servers without prompting.

## Iterative Improvement Loop

`claudenv loop` spawns Claude Code in headless mode to analyze and improve your project iteratively. Each run creates a git safety tag so you can always rollback.

**How it works:**

1. **Planning** (iteration 0) — Claude analyzes the project and generates `.claude/improvement-plan.md` with prioritized hypotheses
2. **Execution** (iterations 1-N) — each iteration picks the top unfinished item from the plan, implements it, runs tests, and commits
3. **Convergence** — the loop stops when the plan is complete, max iterations are reached, or the loop detects it's stuck

**Usage:**

```bash
claudenv loop                              # Interactive, pauses between iterations
claudenv loop --trust                      # Full trust, no pauses, no permission prompts
claudenv loop --trust -n 5                 # 5 iterations in full trust
claudenv loop --goal "add test coverage"   # Focused improvement
claudenv loop --trust --model opus -n 3    # Use Opus, 3 iterations
claudenv loop --budget 1.00 -n 10          # Budget cap per iteration
claudenv loop --rollback                   # Undo all loop changes
```

| Flag | Description |
|------|-------------|
| `-n, --iterations <n>` | Max iterations (default: unlimited) |
| `--trust` | Full trust mode — no pauses, skip permission prompts |
| `--goal <text>` | Focus area for improvements |
| `--no-pause` | Don't pause between iterations |
| `--max-turns <n>` | Max agentic turns per iteration (default: 30) |
| `--model <model>` | Model to use (default: sonnet) |
| `--budget <usd>` | Budget cap per iteration in USD |
| `-d, --dir <path>` | Target project directory |
| `--allow-dirty` | Allow running with uncommitted changes |
| `--rollback` | Undo all changes from the most recent loop |
| `--unsafe` | Remove default tool restrictions |

**Git safety:** Before the first iteration, a `claudenv-loop-<timestamp>` git tag is created. Each iteration commits separately. Use `claudenv loop --rollback` to reset everything, or cherry-pick individual commits.

**Single iteration:** Use `/improve` inside Claude Code for a one-shot improvement without the full loop.

## Tech Stack Detection

Claude AI reads your actual code, but the following are auto-detected for context:

- **Languages**: TypeScript, JavaScript, Python, Go, Rust, Ruby, PHP, Java, Kotlin, C#
- **Frameworks**: Next.js, Vite, Nuxt, SvelteKit, Astro, Angular, Django, FastAPI, Flask, Rails, Laravel, Spring Boot, and more
- **Package managers**: npm, yarn, pnpm, bun, poetry, pipenv, uv, cargo, go modules
- **Test frameworks**: Vitest, Jest, Playwright, Cypress, pytest, RSpec, go test, cargo test
- **CI/CD**: GitHub Actions, GitLab CI, Jenkins, CircleCI
- **Linters/formatters**: ESLint, Biome, Prettier, Ruff, RuboCop, golangci-lint, Clippy

## CLI Reference

```
claudenv                Install /claudenv into ~/.claude/ (default)
claudenv install        Same as above (explicit)
claudenv install -f     Reinstall, overwriting existing files
claudenv uninstall      Remove /claudenv from ~/.claude/
claudenv init [dir]     Legacy: static analysis + terminal prompts (no AI)
claudenv init -y        Legacy: skip prompts, auto-detect everything
claudenv generate       Templates only, no scaffold
claudenv validate       Check documentation completeness
claudenv loop           Iterative improvement loop (spawns Claude)
claudenv loop --trust   Full trust mode, no pauses
claudenv loop --rollback  Undo all loop changes
```

## Alternative: Run Without Installing

```bash
npx claudenv            # npm
pnpm dlx claudenv       # pnpm
bunx claudenv           # bun
```

## Uninstall

```bash
claudenv uninstall      # Remove from ~/.claude/
npm uninstall -g claudenv
```

## Requirements

- Node.js >= 20
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

## License

MIT
