---
name: claudenv
description: Detects missing or outdated project documentation and offers to generate or update it. Triggers when CLAUDE.md is missing, when the user mentions documentation setup, or when significant project changes are detected.
allowed-tools: Read, Write, Glob, Grep, Bash(find:*), Bash(cat:*), Bash(mkdir:*), Bash(cp:*), Bash(chmod:*)
---

# claudenv — Documentation Management Skill

## When to auto-trigger
- CLAUDE.md does not exist in the project root
- User mentions "documentation", "CLAUDE.md", "project setup", or "claudenv"
- User asks to configure Claude Code for their project
- After major refactoring that changes directory structure

## Capabilities

### Initial Setup
If no CLAUDE.md exists, suggest running `/claudenv` to set up full documentation.

### Update Detection
When working in a project with existing documentation, watch for:
- New dependencies added to manifest files
- New directories created that aren't in CLAUDE.md Architecture section
- Changed scripts in package.json / pyproject.toml
- New config files (linter, formatter, test framework)

When changes are detected, suggest running `/update-docs`.

### Validation
After documentation changes, run the validation script:
```bash
bash .claude/skills/doc-generator/scripts/validate.sh 2>&1 || true
```

## Reference

For tech stack detection patterns, see:
@~/.claude/skills/claudenv/templates/detection-patterns.md

## Project-level scaffold

The following files are available for installation into projects at `~/.claude/skills/claudenv/scaffold/`:
- `.claude/commands/init-docs.md` — Interactive documentation regeneration
- `.claude/commands/update-docs.md` — Refresh docs from current state
- `.claude/commands/validate-docs.md` — Run validation checks
- `.claude/skills/doc-generator/SKILL.md` — Per-project doc generation skill
- `.claude/skills/doc-generator/scripts/validate.sh` — Bash validation script
- `.claude/skills/doc-generator/templates/detection-patterns.md` — Detection reference
- `.claude/agents/doc-analyzer.md` — Read-only analysis subagent
