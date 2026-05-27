/**
 * decisions-logger — PostToolUse hook handler for Write events.
 *
 * Validates files written to a memories/decisions/ directory (global or project).
 * Path check FIRST — short-circuit non-decision writes without parsing content.
 *
 * Skill writes the file to the correct scope directly (see SKILL.md). This hook
 * does NOT rewrite paths post-hoc — that creates ping-pong with future Claude
 * turns. Hook only validates frontmatter, logs mismatches for `claudenv decisions
 * fix --rescope`, and marks INDEX.md dirty for regeneration.
 */

import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

const DECISIONS_PATH_RE = /(?:^|\/)(?:memories|memories\/project)\/decisions\/[^/]+\.md$/;
const VIBE_MARKER = '__VIBE_DECISION__';
const REQUIRED_FIELDS = ['date', 'topic', 'chose', 'reason'];

// CLAUDENV_HOME is resolved lazily so tests can override via process.env.CLAUDENV_HOME.
function claudenvHome() {
  return process.env.CLAUDENV_HOME || join(homedir(), '.claudenv');
}

/**
 * Extract the fields we care about from a Claude Code PostToolUse event.
 * Tolerant to schema variants — Claude Code has shipped a few.
 *
 * @param {object|null} event - Parsed JSON event from stdin (or null)
 * @returns {{ filePath: string|null, content: string|null }}
 */
export function readDecisionsLoggerInput(event) {
  if (!event || typeof event !== 'object') return { filePath: null, content: null };

  const toolInput = event.tool_input || event.toolInput || event.input || {};
  const filePath = toolInput.file_path ?? toolInput.filePath ?? toolInput.path ?? null;
  const content = toolInput.content ?? toolInput.text ?? null;

  return { filePath, content };
}

/**
 * Decide whether this Write event concerns a decision file.
 * Path match OR vibe marker in content. Path is the cheaper check, do it first.
 */
function isDecisionWrite({ filePath, content }) {
  if (filePath && DECISIONS_PATH_RE.test(filePath)) return true;
  if (content && content.includes(VIBE_MARKER)) return true;
  return false;
}

/**
 * Extract YAML frontmatter as a flat object. Minimal parser — handles
 * `key: value` and `key: [a, b, c]` on a single line. Heavy structures fall
 * through as raw strings; we only need to validate REQUIRED_FIELDS exist.
 */
function parseFrontmatter(content) {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) return null;

  const result = {};
  for (const line of match[1].split('\n')) {
    const m = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
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
    result[key] = value;
  }
  return result;
}

/**
 * Detect scope from path alone (project subdirectory marker).
 * Recognises both the conventional `~/.claudenv/memories/decisions/` and any
 * path that lives directly under the current CLAUDENV_HOME (for tests).
 */
function pathScope(filePath) {
  if (!filePath) return null;
  if (/\.claude\/memories\/decisions\//.test(filePath)) return 'project';
  if (/\.claudenv\/memories\/decisions\//.test(filePath)) return 'global';
  if (filePath.startsWith(join(claudenvHome(), 'memories', 'decisions'))) return 'global';
  return null;
}

/**
 * Append a line to ~/.claudenv/.log/decisions-logger.log.
 * Best-effort — never throws.
 */
async function logWarning(message) {
  try {
    const home = claudenvHome();
    await mkdir(join(home, '.log'), { recursive: true });
    await appendFile(
      join(home, '.log', 'decisions-logger.log'),
      `${new Date().toISOString()} ${message}\n`,
      'utf-8'
    );
  } catch {
    /* swallow — logging must not break hook chain */
  }
}

/**
 * Touch the index-dirty flag so regen-index (SessionEnd) or post-iteration
 * fallback knows to regenerate INDEX.md.
 */
async function markIndexDirty() {
  try {
    const home = claudenvHome();
    await mkdir(home, { recursive: true });
    await writeFile(join(home, '.index-dirty'), new Date().toISOString(), 'utf-8');
  } catch {
    /* swallow */
  }
}

/**
 * Main handler.
 * @param {{filePath: string|null, content: string|null}} input
 * @returns {Promise<{exitCode: number, message?: string}>}
 */
export async function handleDecisionsLogger(input) {
  // 1. Hot-path short-circuit: not a decision write → done.
  if (!isDecisionWrite(input)) {
    return { exitCode: 0 };
  }

  // 2. We need the actual file content. Hooks fire AFTER Write succeeds, so
  // reading the file from disk is authoritative even if `content` was truncated.
  let fileText = input.content;
  if (input.filePath) {
    try {
      fileText = await readFile(input.filePath, 'utf-8');
    } catch {
      // file unreadable — fall back to event content (may be null)
    }
  }

  if (!fileText) {
    await logWarning(`No content for ${input.filePath ?? '<unknown>'}`);
    return { exitCode: 0 };
  }

  // 3. Validate frontmatter.
  const fm = parseFrontmatter(fileText);
  if (!fm) {
    await logWarning(
      `${input.filePath ?? '<unknown>'} matched decisions/ path but has no YAML frontmatter`
    );
    return { exitCode: 0 };
  }

  const missing = REQUIRED_FIELDS.filter((f) => !(f in fm));
  if (missing.length) {
    await logWarning(
      `${basename(input.filePath ?? '?')} missing required fields: ${missing.join(', ')}`
    );
  }

  // 4. Scope vs path consistency check (warn-only; do not rewrite).
  const declared = fm.scope || 'global';
  const fromPath = pathScope(input.filePath);
  if (fromPath && fromPath !== declared) {
    await logWarning(
      `${basename(input.filePath ?? '?')} declares scope=${declared} but lives in ${fromPath} path — fix with: claudenv decisions fix --rescope`
    );
  }

  // 5. Index is now stale.
  await markIndexDirty();

  return { exitCode: 0 };
}
