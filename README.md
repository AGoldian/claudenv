# claudenv

[![npm](https://img.shields.io/npm/v/claudenv.svg)](https://www.npmjs.com/package/claudenv)

Set up [Claude Code](https://docs.anthropic.com/en/docs/claude-code) in any project with one command. claudenv analyzes your codebase and generates everything Claude needs to work effectively — documentation, rules, hooks, MCP servers, slash commands, **cross-session memory, and a self-extending harness that equips Claude with new skills on demand (1.3.2).**

> **New in 1.3.2 — self-extending harness.** Claude can now introspect what claudenv gives it (`claudenv capabilities`), find what's missing for the task, and equip it from the [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) registry (`claudenv skills search|add`) — plus first-class **kimi-webbridge** browser automation. New `/harness` command + skill drive it autonomously. See [CHANGELOG.md](./CHANGELOG.md).
>
> **1.3.0** — split memory layout, `vibe-decisions` skill, CLI: `memory`, `decisions`, `canon`, `doctor`. Companion Python package `claudenv-memory` on PyPI (alpha).

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
- **Slash commands** — `/init-docs`, `/update-docs`, `/validate-docs`, `/setup-mcp`, `/improve`, **`/deeper`**, **`/why`**, **`/decisions`**, **`/canon`**, **`/just-code`** (1.3.0)
- **Hooks** — validation on tool use, audit logging, decisions-logger (PostToolUse Write), regen-index (SessionEnd) — `.claude/settings.json`

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

## Memory & vibe-decisions (1.3.0)

Persistent memory across sessions + brief overview before non-trivial technical choices. Auto-log inside `claudenv loop` (no pauses — `autonomy=law`), pause-and-ask in interactive Claude Code chats.

### Layout (split)

```
~/.claudenv/memories/              # global, cross-project
├── INDEX.md                       # briefing — auto-regenerated
├── decisions/                     # universal tech decisions
├── canon/index.yaml               # personal canon of references
└── user/preferences.md            # cross-project preferences

<project>/.claude/memories/        # project-scoped, committed
├── project.md                     # stack, conventions, internal urls
└── decisions/                     # project-only decisions
```

### Commands

```bash
# Memory
claudenv memory init                     # initialise ~/.claudenv/memories/
claudenv memory index                    # regenerate INDEX.md
claudenv memory show <path>              # print a memory file
claudenv memory edit <path>              # open in $EDITOR

# Decisions
claudenv decisions list [--scope all|global|project] [--limit N]
claudenv decisions show <id-or-slug>
claudenv decisions search <query>
claudenv decisions archive <id>

# Canon
claudenv canon add <topic> <url> --why "<reason>" [--title <t>] [--author <a>]
claudenv canon list [<topic>]
claudenv canon search <query>
claudenv canon prune --months 6          # find stale entries

# Health
claudenv doctor                          # OK/WARN/FAIL check
```

### Slash-commands (in Claude Code session)

| Command | Purpose |
|---|---|
| `/deeper` | Develop the most recent decision into a full deep dive (concept → variants → trade-offs → canon) |
| `/why <X>` | Explain technology X without logging a decision |
| `/decisions` | List/search logged decisions via the CLI |
| `/canon` | Browse the personal canon |
| `/just-code` | Suppress vibe-decisions overview for the next response only |

### How auto-log works in `claudenv loop`

`claudenv loop` appends a system-prompt fragment that switches the `vibe-decisions` skill into **auto-log mode** — it picks the approach, writes the decision file (`/memories/decisions/<date>-<slug>.md`), and continues coding without pausing. Outside loop (interactive Claude Code) the skill defaults to **pause-and-ask** mode.

After each iteration, `claudenv loop` regenerates `INDEX.md` so the next iteration's briefing reflects what was just decided.

## Self-extending harness (1.3.2)

claudenv is Claude's *harness* — a CLI plus skills, connectors, memory, and a
browser bridge. The `harness` skill makes Claude **self-aware** of it and lets it
**extend itself**: understand what it already has, find what's missing for the
task, and equip it — autonomously.

```bash
claudenv capabilities          # self-introspection: skills, memory, workspace,
                               # connectors, kimi-webbridge, MCP, registry
claudenv skills search "pdf"   # find a skill (curated + awesome-claude-skills)
claudenv skills add docx       # install it into ~/.claude/skills/
claudenv skills add kimi-webbridge   # bootstrap browser automation
```

In Claude Code, `/harness` (or just describe a task that needs a capability you
lack) runs the whole flow: introspect → gap-analysis → discover → equip →
configure connectors/MCP/memory → bootstrap the browser.

### Skills registry

`claudenv skills` discovers skills from
[awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills). The
registry is a heterogeneous markdown README, so each entry is resolved by **install
class**:

| Class | Example | Behavior |
|---|---|---|
| `repo-path` | `github.com/anthropics/skills/tree/main/skills/docx` | fetch raw `SKILL.md` |
| `in-repo` | a `./folder/` link in the README | fetch from the awesome repo |
| `repo-root` | `github.com/user/skill` | best-effort probe, else guide |
| `bootstrap` | kimi-webbridge | run an install command (e.g. `install.sh`) |
| `guide` | a vendor dashboard / Composio connector | open the link to set up |

A curated **bundled catalog** ships with claudenv, so `search`/`add` work
**offline**; `claudenv skills refresh` parses and caches the live registry.

### Trust & safety

A fetched `SKILL.md` is auto-loaded, model-facing instruction text — a
prompt-injection surface. So:

- **Curated (★)** entries have a vetted source URL + install class (the bytes are
  fetched live, not content-pinned) → the only entries allowed to auto-equip,
  including inside `claudenv loop`.
- **Live** entries (parsed from the README or a raw URL) are gated in code:
  `skills add` writes nothing without `--yes`. `claudenv loop` never passes it.

`skills add` only ever writes under `~/.claude/skills/<slug>/`, never overwrites
without `--force`, validates the body, and **never executes** fetched content.
Bootstrap installers are printed first and run only with `--yes`.

### Browser automation (kimi-webbridge)

`claudenv skills add kimi-webbridge` makes browser automation work even if it
isn't installed yet — it detects an existing daemon and starts it, or surfaces the
official bootstrap. `claudenv capabilities` and `claudenv doctor` report its
health. Once up, Claude drives your real browser (with your login sessions) via
the `kimi-webbridge` skill.

## Dynamic workflows

`/claudenv` installs a `dynamic-workflows` skill that teaches Claude when to reach for the built-in **Workflow** tool — deterministic multi-agent orchestration (fan-out, pipelines, adversarial-verify, multi-file migrations) — and when to stay single-threaded. It triggers on wide, decomposable work (reviewing/migrating across many files, research over many sources, generate-N-then-judge) and stays out of the way for single-file or sequential edits.

`claudenv loop` drives the same capability: alongside the no-pause loop-mode fragment, it injects a guarded **Parallel decomposition** directive into the execution prompt that tells the loop to run a dynamic workflow when the picked plan item splits into 3+ independent sub-tasks (and to stay single-threaded otherwise). Fan-out is hard-capped (multi-agent work costs ~15× the tokens and runs under the per-iteration budget); if the Workflow runtime is unavailable it degrades to parallel `Agent` calls. The directive lives in the user prompt because the Workflow tool's opt-in keys on the user message — a system-prompt hint alone won't trigger it.

### Python companion: `claudenv-memory`

Building your own agent on Claude Agent SDK and want the same memory layout?

```bash
pip install claudenv-memory
```

```python
from claudenv_memory import LocalFileMemoryBackend
from claude_agent_sdk import ClaudeAgentOptions

backend = LocalFileMemoryBackend()  # ~/.claudenv/memories + ./.claude/memories
options = ClaudeAgentOptions(
    model="claude-opus-4-7",
    extra_headers={"anthropic-beta": "context-management-2025-06-27"},
    tools=[backend.as_tool()],
)
```

Status: 0.1.x alpha — first production consumer is claudenv 2.0. See `python/README.md`.

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

claudenv memory init|index|show|edit  Manage ~/.claudenv/memories/ (1.3.0+)
claudenv decisions list|show|search   Logged vibe-decisions (1.3.0+)
claudenv canon add|list|search|prune  Personal canon (1.3.0+)
claudenv doctor                       Health check (1.3.0+)

claudenv workspace add|list|use|show  Isolated per-company memory spaces (1.3.1+)
claudenv source list|show             Data-source connectors of active workspace (1.3.1+)

claudenv capabilities [--json] [-d <dir>]  Self-introspection map (1.3.2+)
claudenv skills search <query>        Find skills (curated + awesome-claude-skills) (1.3.2+)
claudenv skills list                  Skills installed under ~/.claude/skills/ (1.3.2+)
claudenv skills info <name>           Trust level, install class, source (1.3.2+)
claudenv skills add <name> [--force]  Install a skill (--yes to run bootstraps) (1.3.2+)
claudenv skills refresh               Refetch the live registry into cache (1.3.2+)
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
