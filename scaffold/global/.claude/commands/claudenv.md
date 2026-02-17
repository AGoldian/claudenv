---
description: Set up Claude Code documentation for this project — analyze tech stack, generate CLAUDE.md, rules, hooks, commands, and skills
allowed-tools: Read, Write, Glob, Grep, Bash(find:*), Bash(cat:*), Bash(mkdir:*), Bash(cp:*), Bash(chmod:*), Bash(curl:*)
disable-model-invocation: true
argument-hint: [--force]
---

# claudenv — Project Documentation Setup

You are setting up Claude Code documentation for this project. Use your full capabilities to analyze the codebase — read files, understand architecture, and generate high-quality documentation.

## Phase 1: Deep Project Analysis

Scan the project thoroughly. Start with these discovery commands:

**Manifest files:**
!`find . -maxdepth 3 \( -name "package.json" -o -name "pyproject.toml" -o -name "go.mod" -o -name "Cargo.toml" -o -name "Gemfile" -o -name "composer.json" -o -name "pom.xml" -o -name "build.gradle*" -o -name "*.csproj" -o -name "requirements.txt" -o -name "setup.py" \) -not -path "*/node_modules/*" -not -path "*/.venv/*" -not -path "*/vendor/*" 2>/dev/null | head -20`

**Framework and tooling configs:**
!`find . -maxdepth 2 \( -name "tsconfig*.json" -o -name "next.config.*" -o -name "vite.config.*" -o -name "nuxt.config.*" -o -name "svelte.config.*" -o -name "astro.config.*" -o -name "angular.json" -o -name "manage.py" -o -name "docker-compose.*" -o -name "Dockerfile" -o -name ".eslintrc*" -o -name "biome.json" -o -name ".prettierrc*" -o -name "vitest.config.*" -o -name "jest.config.*" -o -name "pytest.ini" -o -name "conftest.py" -o -name "turbo.json" -o -name "nx.json" \) -not -path "*/node_modules/*" 2>/dev/null | head -30`

**CI/CD:**
!`find . -maxdepth 3 \( -path "*/.github/workflows/*" -o -name ".gitlab-ci.yml" -o -name "Jenkinsfile" -o -name ".circleci/config.yml" \) 2>/dev/null | head -10`

**Existing docs:**
!`find . -maxdepth 2 \( -name "README.md" -o -name "CLAUDE.md" -o -name "CONTRIBUTING.md" -o -name "_state.md" \) -not -path "*/node_modules/*" 2>/dev/null | head -10`

**Directory structure:**
!`ls -la`

Now **read the manifest files** you found (package.json, pyproject.toml, etc.) to understand:
- Project name and description
- Dependencies and their purposes
- Available scripts/commands
- Dev vs production dependencies

Also **read the README.md** if it exists — it often contains the best project description.

**Read 3-5 key source files** to understand the actual code architecture, patterns, and conventions used.

## Phase 2: Ask the User

Based on your analysis, ask the user these questions **one at a time**, providing your best guess as context:

1. **Project description**: "Based on my analysis, this appears to be [your analysis]. Is this correct, or would you describe it differently?"
2. **Deployment**: "Where is this deployed?" (Vercel, AWS, Docker, bare metal, etc.)
3. **Conventions**: "I noticed [patterns you found]. Are there other team conventions I should know about?"
4. **Focus areas**: "Are there areas of the codebase that need special attention?" (complex logic, frequent bugs, etc.)

If `$ARGUMENTS` includes `--force`, skip questions and use your best judgment from the analysis.

## Phase 3: Generate Documentation

Create the following files based on your REAL analysis of the code (not generic templates):

### 3.1 CLAUDE.md (project root)
Compact (under 60 lines) with these sections:
- `## Project overview` — one sentence with detected stack, based on what you actually found
- `## Commands` — all dev/build/test/lint/format commands from manifest files
- `## Architecture` — key directories with descriptions based on ACTUAL content you read
- `## Conventions` — @import references to rules files
- `## Workflow` — @import to workflow.md
- `## Memory` — reference to _state.md
- `## Rules` — project-specific rules including: "NEVER create documentation files (.md) unless the user explicitly requests it"

### 3.2 _state.md (project root)
Session memory file:
- `## Current Focus` — empty (user fills in)
- `## Key Decisions` — pre-fill with architectural decisions you detected
- `## Known Issues` — empty
- `## Session Notes` — empty

### 3.3 .claude/rules/code-style.md
YAML frontmatter with path globs. Include language-specific and framework-specific conventions based on what you actually found in the code.

### 3.4 .claude/rules/testing.md
YAML frontmatter with test path globs. Include detected test framework, commands, patterns.

### 3.5 .claude/rules/workflow.md
Claude Code workflow best practices:
- Plan mode usage
- /compact and /clear for context management
- Subagents for parallel tasks
- Memory via _state.md (read at start, update at end)
- Commit discipline
- NEVER create .md files unless explicitly asked

### 3.6 .claude/settings.json
Validation hooks configuration (PostToolUse hooks for Write operations on doc files).

**Present each file to the user for review before writing.** If `$ARGUMENTS` includes `--force`, write without confirmation.

## Phase 4: Install Project Commands & Skills

Copy the following scaffold files from the global skill directory into this project:

```bash
# Create directories
mkdir -p .claude/commands .claude/skills/doc-generator/scripts .claude/skills/doc-generator/templates .claude/agents

# Copy project-level scaffold from global skill
cp ~/.claude/skills/claudenv/scaffold/.claude/commands/init-docs.md .claude/commands/init-docs.md
cp ~/.claude/skills/claudenv/scaffold/.claude/commands/update-docs.md .claude/commands/update-docs.md
cp ~/.claude/skills/claudenv/scaffold/.claude/commands/validate-docs.md .claude/commands/validate-docs.md
cp ~/.claude/skills/claudenv/scaffold/.claude/skills/doc-generator/SKILL.md .claude/skills/doc-generator/SKILL.md
cp ~/.claude/skills/claudenv/scaffold/.claude/skills/doc-generator/scripts/validate.sh .claude/skills/doc-generator/scripts/validate.sh
cp ~/.claude/skills/claudenv/scaffold/.claude/skills/doc-generator/templates/detection-patterns.md .claude/skills/doc-generator/templates/detection-patterns.md
cp ~/.claude/skills/claudenv/scaffold/.claude/skills/doc-generator/templates/mcp-servers.md .claude/skills/doc-generator/templates/mcp-servers.md
cp ~/.claude/skills/claudenv/scaffold/.claude/commands/setup-mcp.md .claude/commands/setup-mcp.md
cp ~/.claude/skills/claudenv/scaffold/.claude/agents/doc-analyzer.md .claude/agents/doc-analyzer.md
chmod +x .claude/skills/doc-generator/scripts/validate.sh
```

If any file already exists, **skip it** unless `$ARGUMENTS` includes `--force`.

## Phase 5: MCP Server Configuration

Configure MCP servers for this project by searching the official MCP Registry.

Read the MCP server reference:
@~/.claude/skills/claudenv/templates/mcp-servers.md

**5.1 Identify technologies to search for:**
Based on your Phase 1 analysis, list the key technologies that might have MCP servers (databases, cloud services, APIs, dev tools).

**5.2 Search the registry:**
For each technology, query the MCP Registry API:
```bash
curl -s 'https://registry.modelcontextprotocol.io/v0.1/servers?search=<tech>&version=latest&limit=10'
```

**5.3 Verify trust:**
For each candidate with an npm package, check monthly downloads:
```bash
curl -s 'https://api.npmjs.org/downloads/point/last-month/<npm-package>'
```
Filter out servers with <100 monthly downloads.

**5.4 Present recommendations:**
Group as Essential / Recommended / Optional. For each, explain why it's relevant and show download counts.

Ask the user which to configure. If `$ARGUMENTS` includes `--force`, auto-select Essential + Recommended.

**5.5 Generate `.mcp.json`:**
Write `.mcp.json` with selected servers using `${ENV_VAR}` placeholders for secrets. Follow the format in the MCP server reference.

**5.6 List environment variables:**
Tell the user how to configure required secrets:
```
claude config set env.VAR_NAME "your-value"
```

## Phase 6: Validate

Run the validation script:
```bash
bash .claude/skills/doc-generator/scripts/validate.sh 2>&1 || true
```

Fix any errors found.

## Phase 7: Summary

Print a summary of everything created:
```
claudenv setup complete!

Created:
  + CLAUDE.md
  + _state.md
  + .claude/rules/code-style.md
  + .claude/rules/testing.md
  + .claude/rules/workflow.md
  + .claude/settings.json
  + .claude/commands/init-docs.md
  + .claude/commands/update-docs.md
  + .claude/commands/validate-docs.md
  + .claude/commands/setup-mcp.md
  + .claude/skills/doc-generator/
  + .claude/agents/doc-analyzer.md
  + .mcp.json (if MCP servers were configured)

Available commands:
  /init-docs      — Regenerate documentation from scratch
  /update-docs    — Update docs when project changes
  /validate-docs  — Check documentation completeness
  /setup-mcp      — Add or update MCP server configuration

Next steps:
  1. Review and edit CLAUDE.md
  2. Configure any required MCP secrets: claude config set env.VAR_NAME "value"
  3. git add .claude/ CLAUDE.md _state.md .mcp.json && git commit -m "Add Claude Code docs"
```
