---
description: Analyze this project and make one high-impact improvement — fix bugs, add tests, improve code quality
allowed-tools: Read, Write, Glob, Grep, Bash
argument-hint: [area-to-improve]
---

# /improve — Single Improvement Iteration

You are an expert software engineer. Your job is to analyze this project and make one high-impact improvement.

## Step 1: Read Context

Read these files if they exist:
- `CLAUDE.md` — project overview and conventions
- `_state.md` — session memory
- `.claude/improvement-plan.md` — existing improvement plan (if any)

## Step 2: Choose What to Improve

**If `.claude/improvement-plan.md` exists:**
- Read the plan and pick the top unfinished item from the "## Pending" section
- If `$ARGUMENTS` is provided, use it as a focus area instead of the plan

**If no plan exists:**
- Analyze the project: read manifest files, scan source code, check test coverage
- If `$ARGUMENTS` is provided, focus on that area
- Identify the single highest-impact improvement you can make

## Step 3: Implement the Change

- Write the code changes
- Add or update tests if applicable
- Follow existing code style and conventions

## Step 4: Verify

- Run tests (if a test command is available)
- Run linter (if configured)
- Fix any issues found

## Step 5: Update Plan

If `.claude/improvement-plan.md` exists:
- Move the completed item from "## Pending" to "## Completed"
- Add the commit hash and notes about what was done
- If you discovered new issues, add them to "## Pending"

## Step 6: Commit and Report

- Commit all changes with a descriptive message
- Report:
  - What you changed and why
  - What tests were added/updated
  - What's next (remaining plan items or suggested improvements)

## Important Rules

- Do NOT delete files unless the deletion IS the improvement
- Make exactly ONE improvement per invocation
- If there's nothing left to improve, output: NO_MORE_IMPROVEMENTS
