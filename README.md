# create-project-docs

One command to set up [Claude Code](https://docs.anthropic.com/en/docs/claude-code) documentation for any project.

## Quick start

```bash
cd your-project
npx create-project-docs
```

Scans your project, detects the tech stack, asks a few questions, and generates everything Claude Code needs to understand your codebase.

Skip the questions with `-y`:

```bash
npx create-project-docs -y
```

## What gets generated

```
your-project/
├── CLAUDE.md                          # Project overview, commands, architecture
├── _state.md                          # Track decisions and context across sessions
├── .claude/
│   ├── rules/
│   │   ├── code-style.md              # Coding conventions (scoped by file paths)
│   │   ├── testing.md                 # Testing patterns and commands
│   │   └── workflow.md                # Claude Code best practices
│   ├── settings.json                  # Validation hooks
│   ├── commands/
│   │   ├── init-docs.md               # /init-docs — regenerate docs interactively
│   │   ├── update-docs.md             # /update-docs — refresh from current state
│   │   └── validate-docs.md           # /validate-docs — check docs are correct
│   ├── skills/
│   │   └── doc-generator/             # Auto-invoked when docs need updating
│   │       ├── SKILL.md
│   │       ├── scripts/validate.sh
│   │       └── templates/detection-patterns.md
│   └── agents/
│       └── doc-analyzer.md            # Read-only analysis subagent
```

### Key files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Compact project overview (< 60 lines) with `@import` references to rule files |
| `_state.md` | Tracks current focus, key decisions, known issues — persists context between sessions |
| `.claude/rules/workflow.md` | Best practices: plan mode, `/compact`, `/clear`, subagents, git discipline |
| `.claude/rules/code-style.md` | Language and framework-specific coding conventions |
| `.claude/rules/testing.md` | Test framework patterns and commands |

## After setup

Inside Claude Code, you get three slash commands:

| Command | What it does |
|---------|-------------|
| `/init-docs` | Re-run interactive documentation setup |
| `/update-docs` | Scan for changes and propose doc updates |
| `/validate-docs` | Check that documentation is complete and correct |

The `doc-generator` skill auto-triggers when Claude detects your docs are outdated.

## What it detects

**10+ languages** and **25+ frameworks** out of the box:

- **Languages**: TypeScript, JavaScript, Python, Go, Rust, Ruby, PHP, Java, Kotlin, C#
- **Frameworks**: Next.js, Vite, Nuxt, SvelteKit, Astro, Angular, Django, FastAPI, Flask, Rails, Laravel, Spring Boot, and more
- **Package managers**: npm, yarn, pnpm, bun, poetry, pipenv, uv, cargo, go modules
- **Test frameworks**: Vitest, Jest, Playwright, Cypress, pytest, RSpec, go test, cargo test
- **CI/CD**: GitHub Actions, GitLab CI, Jenkins, CircleCI
- **Linters/formatters**: ESLint, Biome, Prettier, Ruff, RuboCop, golangci-lint, Clippy

## CLI reference

```
Usage: create-project-docs [dir] [options]

Options:
  -y, --yes        Skip prompts, use auto-detected defaults
  --overwrite      Overwrite existing files
  -V, --version    Show version
  -h, --help       Show help

Commands:
  init [dir]       Interactive setup (default when no command given)
  generate         Non-interactive generation (templates only)
  validate         Check documentation completeness
```

## Install from source

```bash
git clone https://github.com/AGoldian/claudenv.git
cd claudenv
npm install
npm link

# Then in any project:
create-project-docs
```

## Programmatic API

```javascript
import { detectTechStack, generateDocs, writeDocs, installScaffold } from 'create-project-docs';

const detected = await detectTechStack('/path/to/project');
const { files } = await generateDocs('/path/to/project', {
  ...detected,
  projectDescription: 'My awesome project',
  generateRules: true,
  generateHooks: true,
});
await writeDocs('/path/to/project', files);
await installScaffold('/path/to/project');
```

## License

MIT
