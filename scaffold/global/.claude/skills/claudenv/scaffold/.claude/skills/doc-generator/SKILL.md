---
name: doc-generator
description: Generates and updates project documentation including CLAUDE.md, rules, and hooks. Use when the user asks about documentation, project setup, CLAUDE.md, or when detecting that documentation is missing or outdated.
allowed-tools: Read, Write, Glob, Grep, Bash(find:*), Bash(cat:*), Bash(node:*)
---

# Documentation Generator Skill

## When to use
- User mentions documentation, CLAUDE.md, or project setup
- User asks to configure Claude Code for their project
- New files detected that change the tech stack (new framework, test runner, etc.)
- After major refactoring that changes directory structure
- When CLAUDE.md references files or directories that no longer exist

## Process

### 1. Detect Tech Stack
Scan the project root for manifest files, framework configs, and tooling:

@.claude/skills/doc-generator/templates/detection-patterns.md

### 2. Cross-Reference Existing Documentation
If CLAUDE.md already exists, read it and identify:
- Outdated commands or directory references
- Missing entries for new tools/dependencies
- Stale @imports pointing to removed files

### 3. Generate or Update
- For new documentation: generate CLAUDE.md, _state.md, .claude/rules/code-style.md, .claude/rules/testing.md, .claude/rules/workflow.md
- For updates: propose specific changes and wait for user approval
- Always present generated content for review before writing
- NEVER create .md files beyond the ones listed above unless the user explicitly asks

### 4. Validate
After writing, run the validation script:
```
bash .claude/skills/doc-generator/scripts/validate.sh
```

Fix any errors before completing.

## Output Format
Generated CLAUDE.md should follow this structure:
- `# CLAUDE.md` heading
- `## Project overview` — one-sentence description with stack
- `## Commands` — all dev/build/test/lint commands
- `## Architecture` — key directories with descriptions
- `## Conventions` — @imports to code-style.md and testing.md
- `## Workflow` — @import to workflow.md (Claude Code best practices)
- `## Memory` — reference to _state.md for session persistence
- `## Rules` — project-specific rules as bullet points

Additionally generate:
- `_state.md` — project state tracking (decisions, focus, known issues)
- `.claude/rules/workflow.md` — Claude Code workflow best practices
