---
description: Validate project documentation for completeness and correctness
allowed-tools: Read, Glob, Grep, Bash(bash:*)
disable-model-invocation: true
---

# Validate Project Documentation

Run validation checks on the project's Claude Code documentation.

## Step 1: Run Bash Validation

Execute the validation script:
!`bash .claude/skills/doc-generator/scripts/validate.sh 2>&1 || true`

## Step 2: Deep Validation

Perform additional checks that require reading file contents:

1. **Read CLAUDE.md** and verify:
   - All `@import` references resolve to existing files
   - Commands in the ## Commands section match actual scripts in package.json / pyproject.toml / Makefile
   - Directories in ## Architecture section actually exist

2. **Read .claude/rules/*.md** files and verify:
   - YAML frontmatter `paths` globs match files that exist in the project
   - Referenced tools (linters, formatters, test frameworks) are actually installed

3. **Read .claude/settings.json** and verify:
   - Valid JSON structure
   - Referenced hook scripts exist at the specified paths

## Step 3: Report

Present a clear summary:
- List all **errors** (things that must be fixed)
- List all **warnings** (things that should be reviewed)
- Provide a **pass/fail** verdict

If there are errors, suggest specific fixes for each one.
