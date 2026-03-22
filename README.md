# claudenv

Set up [Claude Code](https://docs.anthropic.com/en/docs/claude-code) in any project with one command. claudenv analyzes your codebase and generates everything Claude needs to work effectively — documentation, rules, hooks, MCP servers, and slash commands.

## Quick Start

```bash
npm i -g claudenv && claudenv
```

Open Claude Code in any project and type `/claudenv`. That's it.

## What happens when you run `/claudenv`

Claude reads your code, asks a few questions, and generates:

- **CLAUDE.md** — project overview, architecture, key commands
- **Rules** — coding style, testing patterns, workflow guidelines (`.claude/rules/`)
- **MCP servers** — auto-detected from your stack, configured in `.mcp.json`
- **Slash commands** — `/init-docs`, `/update-docs`, `/validate-docs`, `/setup-mcp`, `/improve`
- **Hooks** — validation on tool use, audit logging (`.claude/settings.json`)

Everything is committed to your repo. Team members get the same Claude experience.

## Autonomous Loop

The killer feature. `claudenv loop` runs Claude in headless mode, iterating over your project — planning improvements, implementing them one by one, committing each step.

```bash
claudenv loop --goal "add test coverage" --trust -n 5
```

**What it does:**

1. Creates a git safety tag (rollback anytime with `--rollback`)
2. Claude generates an improvement plan (`.claude/improvement-plan.md`)
3. Each iteration picks the next item, implements it, runs tests, commits
4. Stops when the plan is done, iterations run out, or it detects it's stuck

### Common recipes

```bash
# Interactive mode — pauses between iterations so you can review
claudenv loop

# Fully autonomous — no pauses, no permission prompts
claudenv loop --trust

# Goal-driven with Opus for max capability
claudenv loop --goal "refactor auth to JWT" --trust --model opus -n 3

# Budget-conscious CI run
claudenv loop --profile ci --goal "fix lint errors" -n 10

# Undo everything from the last loop
claudenv loop --rollback
```

### Rate limit recovery

If Claude hits API rate limits mid-loop, claudenv saves your progress automatically:

```bash
# Rate limited? Just resume where you left off
claudenv loop --resume

# Override model on resume (e.g., switch to cheaper model)
claudenv loop --resume --model sonnet
```

### Live progress tracking

Monitor what Claude is doing in real time:

```bash
# In another terminal — tail -f style
claudenv report --follow

# Summary of the last loop run
claudenv report

# Last 5 events only
claudenv report --last 5
```

Events are stored in `.claude/work-report.jsonl` — machine-readable JSONL format.

### All loop flags

| Flag | Description |
|------|-------------|
| `--goal <text>` | What to work on (any goal — Claude interprets it) |
| `--trust` | Full trust mode — no pauses, skip permission prompts |
| `-n, --iterations <n>` | Max iterations (default: unlimited) |
| `--model <model>` | Model: `opus`, `sonnet`, `haiku` |
| `--profile <name>` | Autonomy profile (sets model, trust, budget) |
| `--budget <usd>` | Budget cap per iteration in USD |
| `--max-turns <n>` | Max agentic turns per iteration (default: 30) |
| `--resume` | Continue from last rate-limited loop |
| `--rollback` | Undo all changes from the most recent loop |
| `--worktree` | Run each iteration in an isolated git worktree |
| `--allow-dirty` | Allow running with uncommitted changes |
| `--no-pause` | Don't pause between iterations |
| `--unsafe` | Remove default tool restrictions (allows rm -rf) |
| `-d, --dir <path>` | Target project directory |

## Autonomy Profiles

Control how much freedom Claude gets. Profiles configure permissions, hooks, model defaults, and safety guardrails.

```bash
claudenv autonomy                          # Interactive selection
claudenv autonomy --profile moderate       # Apply directly
claudenv autonomy --profile ci --dry-run   # Preview without writing
```

### Profile comparison

| Profile | Model | Permissions | Credentials | Use case |
|---------|-------|-------------|-------------|----------|
| **safe** | sonnet | Allow-list only (read + limited bash) | Blocked | Exploring unfamiliar codebases |
| **moderate** | sonnet | Allow + deny lists (full dev tools) | Blocked | Day-to-day development |
| **full** | opus | Unrestricted (`--dangerously-skip-permissions`) | Warn-only | Maximum capability runs |
| **ci** | haiku | Unrestricted + 50 turn / $5 budget limits | Warn-only | CI/CD pipelines |

All profiles hard-block `rm -rf`, force push to main/master, and `sudo` — regardless of permission settings.

### What gets generated

```
.claude/
├── settings.json          # Permissions, hooks config
├── hooks/
│   ├── pre-tool-use.sh    # Blocks dangerous operations (reads stdin JSON from Claude Code)
│   └── audit-log.sh       # Logs every tool call to audit-log.jsonl
└── aliases.sh             # Shell aliases: claude-safe, claude-yolo, claude-ci, claude-local
```

CI profile also generates `.github/workflows/claude-ci.yml`.

### Using profiles with the loop

Profiles set sensible defaults for model, trust, and budget:

```bash
claudenv loop --profile ci --goal "fix lint errors"    # haiku, $5 budget, 50 turns
claudenv loop --profile full --goal "major refactor"   # opus, unrestricted
claudenv loop --profile moderate --goal "add types"    # sonnet, deny-list guarded

# CLI flags always override profile defaults
claudenv loop --profile ci --model sonnet              # ci profile but with sonnet
```

## MCP Server Setup

`/claudenv` auto-detects your tech stack and recommends MCP servers from the [official registry](https://registry.modelcontextprotocol.io). You can also run `/setup-mcp` independently.

Servers are configured in `.mcp.json` with `${ENV_VAR}` placeholders — safe to commit:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres@latest", "${POSTGRES_CONNECTION_STRING}"]
    }
  }
}
```

Set secrets with `claude config set env.POSTGRES_CONNECTION_STRING "postgresql://..."`.

## File Structure

After full setup (`/claudenv` + `claudenv autonomy`):

```
your-project/
├── CLAUDE.md                     # Project overview for Claude
├── _state.md                     # Session memory (persists between conversations)
├── .mcp.json                     # MCP server configuration
└── .claude/
    ├── settings.json             # Permissions + hooks
    ├── rules/
    │   ├── code-style.md         # Coding conventions
    │   ├── testing.md            # Test patterns
    │   └── workflow.md           # Claude workflow best practices
    ├── hooks/
    │   ├── pre-tool-use.sh       # Safety guardrails
    │   └── audit-log.sh          # Audit logging
    ├── commands/                  # Slash commands
    │   ├── init-docs.md
    │   ├── update-docs.md
    │   ├── validate-docs.md
    │   ├── setup-mcp.md
    │   └── improve.md
    ├── aliases.sh                # Shell aliases
    ├── work-report.jsonl         # Loop progress events
    ├── loop-log.json             # Loop state (for resume/rollback)
    ├── improvement-plan.md       # Current loop plan
    └── audit-log.jsonl           # Tool call audit trail
```

## CLI Reference

```
claudenv                              Install /claudenv into ~/.claude/
claudenv install [-f]                 Same as above (-f to overwrite)
claudenv uninstall                    Remove from ~/.claude/

claudenv loop [options]               Autonomous improvement loop
claudenv loop --resume                Resume rate-limited loop
claudenv loop --rollback              Undo all loop changes
claudenv report [--follow] [--last n] View loop progress

claudenv autonomy [-p <profile>]      Configure autonomy profiles
claudenv init [dir] [-y]              Legacy: static analysis (no AI)
claudenv generate [-d <dir>]          Templates only, no scaffold
claudenv validate [-d <dir>]          Check documentation completeness
```

## Run Without Installing

```bash
npx claudenv            # npm
pnpm dlx claudenv       # pnpm
bunx claudenv           # bun
```

## Tech Stack Detection

Auto-detected for context: TypeScript, JavaScript, Python, Go, Rust, Ruby, PHP, Java, Kotlin, C# / Next.js, Vite, Nuxt, SvelteKit, Astro, Django, FastAPI, Flask, Rails, Laravel, Spring Boot / npm, yarn, pnpm, bun, poetry, uv, cargo / Vitest, Jest, Playwright, pytest, RSpec / GitHub Actions, GitLab CI / ESLint, Biome, Prettier, Ruff, Clippy.

## Requirements

- Node.js >= 20
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

## License

MIT
