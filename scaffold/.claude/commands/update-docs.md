---
description: Refresh project documentation from current state
allowed-tools: Read, Write, Glob, Grep, Bash(find:*), Bash(cat:*), Bash(diff:*)
disable-model-invocation: true
---

# Update Project Documentation

You are updating the existing Claude Code documentation for this project.

## Step 1: Read Current Documentation

Read the existing documentation files:
- @CLAUDE.md
- Read any files referenced by @imports in CLAUDE.md

## Step 2: Scan Current State

Detect the current tech stack:

**Package managers:**
!`find . -maxdepth 3 \( -name "package.json" -o -name "pyproject.toml" -o -name "go.mod" -o -name "Cargo.toml" -o -name "Gemfile" \) -not -path "*/node_modules/*" 2>/dev/null | head -20`

**Framework configs:**
!`find . -maxdepth 2 \( -name "tsconfig.json" -o -name "next.config.*" -o -name "vite.config.*" -o -name "manage.py" -o -name "docker-compose.*" \) -not -path "*/node_modules/*" 2>/dev/null | head -20`

Read the manifest files to check for new dependencies, scripts, or configuration changes since the documentation was last generated.

## Step 3: Identify Changes

Compare the current state against the existing documentation:
- **New dependencies or tools** not mentioned in CLAUDE.md
- **Changed scripts** (renamed, added, or removed)
- **New directories** not covered in Architecture section
- **Stale references** to files or directories that no longer exist
- **Missing conventions** based on new config files (e.g., new linter added)
- **Missing or outdated `.mcp.json`** — if `.mcp.json` doesn't exist, or if new technologies have been added that could benefit from MCP servers, suggest running `/setup-mcp`

## Step 4: Propose Updates

Present a **diff-style summary** of proposed changes to each documentation file. For each change:
- Show what currently exists
- Show what should be updated
- Explain why the change is needed

Wait for user approval before writing any changes.

## Step 5: Apply Updates

After user approval, update the documentation files. Preserve any user-written content that was manually added — only update sections that correspond to detected/generated content.
