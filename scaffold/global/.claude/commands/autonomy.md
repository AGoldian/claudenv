---
description: Manage autonomy profiles — switch between safe/moderate/full/ci or view current status
allowed-tools: Bash, Read, Glob, Grep
argument-hint: <status|safe|moderate|full|ci> [--dry-run]
---

# Autonomy Profile Manager

Manage Claude Code autonomy profiles directly from within a session.

## Instructions

Parse `$ARGUMENTS` and execute the matching action below.

### 1. Determine the action

- If `$ARGUMENTS` is empty or `status` → go to **Status**
- If `$ARGUMENTS` starts with `safe`, `moderate`, `full`, or `ci` → go to **Switch Profile**
- Otherwise → go to **Usage Help**

### 2. Status

Show the current autonomy configuration:

1. Check if `.claude/hooks/pre-tool-use.sh` exists in the current project directory.
   - If it exists, read the first 5 lines to find the `# Profile:` comment header and report the active profile name.
   - If it doesn't exist, report "No autonomy profile configured for this project."
2. Check if `.claude/settings.json` exists. If so, read it and summarize the permissions (allowedTools, disallowedTools counts).
3. List available profiles: `safe`, `moderate`, `full`, `ci`.

### 3. Switch Profile

The target profile is the first word of `$ARGUMENTS`. Check for `--dry-run` flag in the remaining arguments.

**If the profile is `full`:**
Before proceeding, display this warning:

```
⚠️  FULL AUTONOMY MODE — UNRESTRICTED ACCESS

This profile grants Claude Code complete access including:
• All file system operations (read, write, delete)
• Credential files (~/.ssh, ~/.aws, ~/.gnupg, ~/.kube, etc.)
• All git operations including force push
• No permission prompts (--dangerously-skip-permissions)

Safety net: audit logging + hard blocks on rm -rf / and force push to main
```

Ask the user to confirm before proceeding. If they decline, abort.

**Apply the profile:**

Build the command:
```
claudenv autonomy --profile <name> --yes --overwrite
```

If `--dry-run` is present in `$ARGUMENTS`, append `--dry-run` to the command.

Run the command via Bash. If the command fails with "command not found", tell the user:

```
claudenv is not on PATH. Install it with:
  npm install -g claudenv
```

After successful execution, show the output and confirm the profile was applied.

### 4. Usage Help

Display:
```
Usage: /autonomy <action> [options]

Actions:
  status              Show current autonomy profile and permissions
  safe                Switch to safe profile (read-only + limited bash)
  moderate            Switch to moderate profile (read/write + controlled bash)
  full                Switch to full profile (unrestricted — requires confirmation)
  ci                  Switch to CI profile (optimized for CI/CD pipelines)

Options:
  --dry-run           Preview generated files without writing them

Examples:
  /autonomy status
  /autonomy moderate
  /autonomy full --dry-run
```
