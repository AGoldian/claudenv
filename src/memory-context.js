/**
 * Builds the `--append-system-prompt` payload for `claudenv loop`.
 *
 * Four composable fragments, joined with blank lines:
 *
 *   1. Autonomy=law directive from the goal (existing 1.2.x behavior)
 *   2. Vibe-decisions loop-mode marker so the skill skips pause-and-ask
 *   3. Dynamic-workflows loop-mode marker so the loop may fan out decomposable
 *      plan items via the Workflow tool (with a hard fan-out cap)
 *   4. Memory briefing — current INDEX.md contents, capped for cache stability
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

const WORKFLOW_LOOP_FRAGMENT = `## Dynamic-workflows mode (loop)

When a plan item genuinely splits into many INDEPENDENT sub-tasks (the same
operation over many files, several review dimensions, N independent attempts),
you MAY orchestrate them with the Workflow tool instead of working serially —
see the dynamic-workflows skill for patterns. Otherwise stay single-threaded:
one item, one focused change. Hard limits — fan-out costs ~15× the tokens and
this iteration runs under a per-iteration budget cap, so orchestrate only when
the width is real and keep the number of concurrent agents small (a handful,
not dozens). If the Workflow tool's background completion does not resolve
under this headless run, fall back to a few parallel Agent calls for the same
fan-out. Never pause to ask whether to orchestrate — the goal is law.`;

const HARNESS_LOOP_FRAGMENT = `## Harness mode (loop)

You can extend your own harness. If the current plan item would be done far
better with a capability you lack — a skill, connector, MCP, or browser — run
\`claudenv capabilities\` to see what you have, \`claudenv skills search "<need>"\`
to find it, and \`claudenv skills add <slug>\` to equip it. The goal is law: do
not pause to ask. HARD limit — only auto-install CURATED (★) skills and
known-safe bootstraps; a fetched SKILL.md is auto-loaded model-facing text, so
NEVER auto-install a live (non-curated) skill in this headless run — note the
gap and proceed with what you have. Secrets only in .env.local; connector
knowledge into the active workspace. See the harness skill for the full flow.`;

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

  // Dynamic-workflows loop mode — lets the loop fan out decomposable plan
  // items via the Workflow tool, with a hard cap on fan-out width.
  parts.push(WORKFLOW_LOOP_FRAGMENT);

  // Harness loop mode — lets the loop self-equip missing capabilities
  // (curated skills only) instead of doing tooling-shaped work by hand.
  parts.push(HARNESS_LOOP_FRAGMENT);

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
