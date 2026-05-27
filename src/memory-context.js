/**
 * Builds the `--append-system-prompt` payload for `claudenv loop`.
 *
 * Three composable fragments, joined with blank lines:
 *
 *   1. Autonomy=law directive from the goal (existing 1.2.x behavior)
 *   2. Vibe-decisions loop-mode marker so the skill skips pause-and-ask
 *   3. Memory briefing — current INDEX.md contents, capped for cache stability
 *
 * Cache discipline: the function is pure on its inputs (goal + file state at
 * call time). Loop.js calls it once per iteration but with stable inputs
 * within a session, so the appended prompt remains stable.
 */

import { readFile } from 'node:fs/promises';
import { indexMdPath } from './memory-paths.js';

const VIBE_LOOP_FRAGMENT = `## Vibe-decisions mode (loop)

You are running inside \`claudenv loop\` in autonomous mode. When the
vibe-decisions skill triggers: pick the approach, write the decision log
immediately (Write tool to /memories/decisions/<date>-<slug>.md with the
__VIBE_DECISION__ marker), continue with code. Do NOT pause for user
confirmation. Do NOT ask "делать так?". The goal is law.`;

const MAX_BRIEFING_CHARS = 4000;

/**
 * Build the system prompt suffix.
 *
 * @param {string|null} goal - The loop's --goal value (may be null)
 * @param {object} [opts]
 * @param {(goal: string) => string} [opts.autonomyBuilder] - Caller's autonomy prompt builder
 * @param {boolean} [opts.includeMemoryBriefing] - Default true; false skips INDEX.md read (for tests)
 * @returns {Promise<string|undefined>} The appended prompt, or undefined if nothing to add
 */
export async function buildSystemPromptWithMemory(goal, opts = {}) {
  const parts = [];

  if (goal && opts.autonomyBuilder) {
    parts.push(opts.autonomyBuilder(goal));
  }

  // Vibe-decisions loop mode is always on inside `claudenv loop`.
  parts.push(VIBE_LOOP_FRAGMENT);

  // Memory briefing — INDEX.md if present.
  if (opts.includeMemoryBriefing !== false) {
    try {
      const briefing = await readFile(indexMdPath(), 'utf-8');
      const capped =
        briefing.length > MAX_BRIEFING_CHARS
          ? briefing.slice(0, MAX_BRIEFING_CHARS) + '\n…(truncated)'
          : briefing;
      parts.push('## Memory briefing\n\n' + capped);
    } catch {
      /* INDEX.md absent — first session, fine */
    }
  }

  if (parts.length === 0) return undefined;
  return parts.join('\n\n');
}
