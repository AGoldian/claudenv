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
5. Install slash commands for ongoing maintenance

**Step 3.** You now have three commands available in Claude Code:

| Command | What it does |
|---------|-------------|
| `/init-docs` | Regenerate documentation from scratch |
| `/update-docs` | Scan for changes and propose updates |
| `/validate-docs` | Check that documentation is complete and correct |

## What Gets Generated

```
your-project/
├── CLAUDE.md                              # Project overview, commands, architecture
├── _state.md                              # Session memory (decisions, focus, issues)
└── .claude/
    ├── rules/
    │   ├── code-style.md                  # Coding conventions (scoped by file paths)
    │   ├── testing.md                     # Test patterns and commands
    │   └── workflow.md                    # Claude Code best practices
    ├── settings.json                      # Validation hooks
    ├── commands/
    │   ├── init-docs.md                   # /init-docs
    │   ├── update-docs.md                 # /update-docs
    │   └── validate-docs.md              # /validate-docs
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
