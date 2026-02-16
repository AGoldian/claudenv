---
description: Analyze project and generate Claude Code documentation interactively
allowed-tools: Read, Write, Glob, Grep, Bash(find:*), Bash(cat:*), Bash(node:*)
argument-hint: [--force]
disable-model-invocation: true
---

# Project Documentation Generator

You are generating Claude Code documentation for this project. Follow the phases below carefully.

## Phase 1: Project Analysis

Scan the project to detect the tech stack. Read the following detected files:

**Package managers and manifests:**
!`find . -maxdepth 3 \( -name "package.json" -o -name "pyproject.toml" -o -name "go.mod" -o -name "Cargo.toml" -o -name "Gemfile" -o -name "composer.json" -o -name "pom.xml" -o -name "build.gradle*" -o -name "*.csproj" \) -not -path "*/node_modules/*" 2>/dev/null | head -20`

**Framework configs:**
!`find . -maxdepth 2 \( -name "tsconfig.json" -o -name "next.config.*" -o -name "vite.config.*" -o -name "nuxt.config.*" -o -name "svelte.config.*" -o -name "astro.config.*" -o -name "angular.json" -o -name "manage.py" -o -name "docker-compose.*" \) -not -path "*/node_modules/*" 2>/dev/null | head -20`

**CI/CD:**
!`find . -maxdepth 3 \( -path "*/.github/workflows/*" -o -name ".gitlab-ci.yml" -o -name "Jenkinsfile" -o -name ".circleci/config.yml" \) 2>/dev/null | head -10`

**Existing documentation:**
!`find . -maxdepth 2 \( -name "README.md" -o -name "CLAUDE.md" -o -name "CONTRIBUTING.md" \) -not -path "*/node_modules/*" 2>/dev/null | head -10`

Read the manifest files you found above to understand dependencies, scripts, and project structure.

## Phase 2: Clarifying Questions

Based on your analysis, ask the user these questions **ONE AT A TIME**, waiting for each answer before proceeding to the next:

1. **Project description**: "What is the primary purpose of this project?" (e.g., SaaS web app, REST API, CLI tool, shared library)
2. **Deployment**: "What deployment target does this project use?" (e.g., Vercel, AWS, Docker, bare metal, not yet decided)
3. **Conventions**: "Are there any team conventions not captured in config files?" (naming patterns, branching strategy, PR process, coding standards)
4. **Focus areas**: "What areas of the codebase should Claude pay special attention to?" (critical business logic, complex algorithms, areas prone to bugs)

## Phase 3: Generate Documentation

After gathering all answers, generate these files:

### CLAUDE.md
Create a compact `CLAUDE.md` (under 60 lines) in the project root containing:
- **Project overview**: One-sentence description including detected stack
- **Commands**: All detected dev/build/test/lint commands with descriptions
- **Architecture**: Key directories and their purposes (read the actual directory structure)
- **Conventions**: @import references to `.claude/rules/code-style.md` and `.claude/rules/testing.md`
- **Workflow**: @import reference to `.claude/rules/workflow.md`
- **Memory**: Reference to `_state.md` for session persistence
- **Rules**: Project-specific rules, including: "NEVER create documentation files (.md) unless the user explicitly requests it"

### _state.md
Create `_state.md` in the project root for tracking project state across sessions:
- **Current Focus**: What is being worked on
- **Key Decisions**: Architecture and design decisions (pre-fill from detected stack)
- **Known Issues**: Bugs, tech debt, gotchas
- **Session Notes**: Context to preserve between sessions

### .claude/rules/code-style.md
Create coding convention rules based on detected linter, formatter, framework, and user-specified conventions. Include YAML frontmatter with path globs to scope the rules.

### .claude/rules/testing.md
Create testing rules based on detected test framework. Include test commands, file patterns, and best practices. Include YAML frontmatter with path globs.

### .claude/rules/workflow.md
Create Claude Code workflow best practices including: plan mode usage, /compact and /clear, subagents, memory via _state.md, commit discipline, and the rule to NEVER create .md files unless explicitly asked.

**Present each file to the user for confirmation before writing it.** If the argument `$ARGUMENTS` includes `--force`, write all files without confirmation.
