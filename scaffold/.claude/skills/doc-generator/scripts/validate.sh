#!/bin/bash
# Documentation validation script for Claude Code hooks.
# Exit 0 = success, Exit 2 = block action (sends stderr to Claude).
# POSIX-compatible for macOS and Linux.
set -euo pipefail

ERRORS=0
WARNINGS=0

error() {
  echo "ERROR: $1" >&2
  ERRORS=$((ERRORS + 1))
}

warn() {
  echo "WARN: $1" >&2
  WARNINGS=$((WARNINGS + 1))
}

ok() {
  echo "OK: $1"
}

# --- Required files ---

if [ -f "CLAUDE.md" ] && [ -s "CLAUDE.md" ]; then
  ok "CLAUDE.md exists and is non-empty"
else
  error "CLAUDE.md is missing or empty"
fi

# --- Required sections in CLAUDE.md ---

if [ -f "CLAUDE.md" ]; then
  for section in "## Commands" "## Architecture"; do
    if grep -q "^${section}" CLAUDE.md 2>/dev/null; then
      ok "CLAUDE.md has ${section}"
    else
      error "CLAUDE.md is missing required section: ${section}"
    fi
  done

  # Check that ## Commands has at least one backtick-quoted command
  # Use awk instead of head -n -1 for macOS compatibility
  COMMANDS_SECTION=$(sed -n '/^## Commands/,/^## /p' CLAUDE.md | awk 'NR>1{print prev} {prev=$0}')
  if echo "$COMMANDS_SECTION" | grep -q '`'; then
    ok "## Commands section contains command examples"
  else
    warn "## Commands section has no inline code examples"
  fi

  # Check @import references
  while IFS= read -r line; do
    # Skip lines inside code blocks
    case "$line" in
      '```'*) continue ;;
    esac
    # Match bare @path lines (not emails, not inline)
    if echo "$line" | grep -qE '^@[^@[:space:]]+$'; then
      IMPORT_PATH=$(echo "$line" | sed 's/^@//')
      # Resolve ~ to HOME
      case "$IMPORT_PATH" in
        '~/'*) IMPORT_PATH="${HOME}/${IMPORT_PATH#\~/}" ;;
      esac
      if [ -f "$IMPORT_PATH" ]; then
        ok "@import ${IMPORT_PATH} resolves"
      else
        error "@import reference '${IMPORT_PATH}' does not resolve to a file"
      fi
    fi
  done < CLAUDE.md
fi

# --- Optional structure checks ---

if [ -d ".claude" ]; then
  ok ".claude/ directory exists"
else
  warn ".claude/ directory not found"
fi

if [ -f ".claude/settings.json" ]; then
  # Validate JSON syntax (requires python or node)
  if command -v node >/dev/null 2>&1; then
    if node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf-8'))" 2>/dev/null; then
      ok ".claude/settings.json is valid JSON"
    else
      error ".claude/settings.json is not valid JSON"
    fi
  elif command -v python3 >/dev/null 2>&1; then
    if python3 -c "import json; json.load(open('.claude/settings.json'))" 2>/dev/null; then
      ok ".claude/settings.json is valid JSON"
    else
      error ".claude/settings.json is not valid JSON"
    fi
  fi
fi

# --- Summary ---

echo ""
echo "Validation complete: ${ERRORS} error(s), ${WARNINGS} warning(s)"

if [ "$ERRORS" -gt 0 ]; then
  exit 2
fi

exit 0
