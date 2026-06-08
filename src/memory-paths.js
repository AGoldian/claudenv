/**
 * Shared resolvers for the claudenv memory layout + a minimal YAML frontmatter
 * parser used by hooks, CLI commands, and the loop integration.
 *
 * All path getters read process.env.CLAUDENV_HOME so tests can isolate without
 * touching the real ~/.claudenv/.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';

export function claudenvHome() {
  return process.env.CLAUDENV_HOME || join(homedir(), '.claudenv');
}

export function memoriesDir() {
  return join(claudenvHome(), 'memories');
}

export function globalDecisionsDir() {
  return join(memoriesDir(), 'decisions');
}

export function canonIndexPath() {
  return join(memoriesDir(), 'canon', 'index.yaml');
}

export function userPrefsPath() {
  return join(memoriesDir(), 'user', 'preferences.md');
}

export function indexMdPath() {
  return join(memoriesDir(), 'INDEX.md');
}

export function dirtyFlagPath() {
  return join(claudenvHome(), '.index-dirty');
}

// --- Skills layer (~/.claude/skills/ — where Claude Code loads skills from) ---

/**
 * Path to ~/.claude/ — where Claude Code reads global commands and skills.
 * Distinct from claudenvHome() (~/.claudenv/), which holds memory/canon/workspaces.
 */
export function claudeDir() {
  return process.env.CLAUDE_HOME || join(homedir(), '.claude');
}

export function claudeSkillsDir() {
  return join(claudeDir(), 'skills');
}

/** Cache of the parsed awesome-claude-skills registry. */
export function skillsRegistryCachePath() {
  return join(claudenvHome(), 'skills-registry.json');
}

export function projectDecisionsDir(cwd) {
  return join(cwd, '.claude', 'memories', 'decisions');
}

// --- Workspace layer (isolated per-company/context memory) ---

export function workspacesDir() {
  return join(claudenvHome(), 'workspaces');
}

export function activeWorkspaceFile() {
  return join(claudenvHome(), 'active-workspace');
}

export function workspaceDir(id) {
  return join(workspacesDir(), id);
}

export function workspaceManifestPath(id) {
  return join(workspaceDir(id), 'workspace.yaml');
}

export function workspaceConnectorsDir(id) {
  return join(workspaceDir(id), 'memories', 'connectors');
}

export function workspaceContextDir(id) {
  return join(workspaceDir(id), 'memories', 'context');
}

/**
 * Resolve the active workspace id. Priority: env CLAUDENV_WORKSPACE, then the
 * pointer file ~/.claudenv/active-workspace. Returns null if none set.
 * Intentionally does NOT scan all workspaces - isolation barrier.
 */
export function activeWorkspaceId() {
  if (process.env.CLAUDENV_WORKSPACE) return process.env.CLAUDENV_WORKSPACE.trim();
  try {
    const id = readFileSync(activeWorkspaceFile(), 'utf-8').trim();
    return id || null;
  } catch {
    return null;
  }
}

/**
 * Minimal YAML frontmatter parser. Returns null when no frontmatter is present.
 * Handles `key: value` and inline arrays `[a, b, c]`. Heavier structures fall
 * through as raw strings — frontmatter here is intentionally flat.
 */
export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) return null;
  const result = {};
  for (const line of match[1].split('\n')) {
    const m = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      value = value.replace(/^['"]|['"]$/g, '');
    }
    result[m[1]] = value;
  }
  return result;
}

/**
 * Render a flat object back into a YAML frontmatter block.
 * Preserves array fields as inline `[a, b]`.
 */
export function renderFrontmatter(obj) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}
