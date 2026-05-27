/**
 * CLI: `claudenv decisions list/show/search/archive`
 *
 * Reads decision files from both global (~/.claudenv/memories/decisions/) and
 * the current project (.claude/memories/decisions/). Files outside these two
 * roots are not considered decisions.
 */

import { readFile, writeFile, readdir, mkdir, rename, stat } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import {
  globalDecisionsDir,
  projectDecisionsDir,
  parseFrontmatter,
} from './memory-paths.js';

async function readDir(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function loadDecision(file, scopeHint) {
  let text;
  try {
    text = await readFile(file, 'utf-8');
  } catch {
    return null;
  }
  const fm = parseFrontmatter(text) || {};
  return {
    file,
    slug: basename(file, '.md'),
    date: fm.date || null,
    topic: fm.topic || basename(file, '.md'),
    chose: fm.chose || '',
    reason: fm.reason || '',
    alternatives: fm.alternatives_considered || [],
    scope: fm.scope || scopeHint,
    deepDive: fm.deep_dive_done === 'yes' || fm.deep_dive_done === true,
    text,
  };
}

/**
 * Collect decisions from global + project roots. Newest first by `date:`.
 *
 * @param {object} opts
 * @param {string} [opts.cwd] - Project root (default: process.cwd())
 * @param {'global'|'project'|'all'} [opts.scope] - Filter
 */
export async function listDecisions({ cwd = process.cwd(), scope = 'all' } = {}) {
  const out = [];

  if (scope === 'global' || scope === 'all') {
    for (const name of await readDir(globalDecisionsDir())) {
      if (!name.endsWith('.md')) continue;
      const d = await loadDecision(join(globalDecisionsDir(), name), 'global');
      if (d) out.push(d);
    }
  }

  if (scope === 'project' || scope === 'all') {
    const pdir = projectDecisionsDir(cwd);
    for (const name of await readDir(pdir)) {
      if (!name.endsWith('.md')) continue;
      const d = await loadDecision(join(pdir, name), 'project');
      if (d) out.push(d);
    }
  }

  out.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
  return out;
}

/**
 * Show one decision by slug or substring. Returns the full file text.
 */
export async function showDecision(idOrSlug, { cwd = process.cwd() } = {}) {
  if (!idOrSlug) throw new Error('Usage: claudenv decisions show <id-or-slug>');
  const all = await listDecisions({ cwd });
  // Exact slug match first, then substring on slug, then substring on topic.
  let match = all.find((d) => d.slug === idOrSlug);
  if (!match) match = all.find((d) => d.slug.includes(idOrSlug));
  if (!match) match = all.find((d) => d.topic.toLowerCase().includes(idOrSlug.toLowerCase()));
  if (!match) {
    const err = new Error(`No decision matching: ${idOrSlug}`);
    err.notFound = true;
    throw err;
  }
  return match;
}

/**
 * Substring search across topic and reason fields.
 */
export async function searchDecisions(query, { cwd = process.cwd() } = {}) {
  if (!query) throw new Error('Usage: claudenv decisions search <query>');
  const q = query.toLowerCase();
  const all = await listDecisions({ cwd });
  return all.filter(
    (d) =>
      d.topic.toLowerCase().includes(q) ||
      d.reason.toLowerCase().includes(q) ||
      d.chose.toLowerCase().includes(q)
  );
}

/**
 * Move a decision file to `<scope-dir>/archive/`. Preserves frontmatter.
 */
export async function archiveDecision(idOrSlug, { cwd = process.cwd() } = {}) {
  const target = await showDecision(idOrSlug, { cwd });
  const archiveDir = join(dirname(target.file), 'archive');
  await mkdir(archiveDir, { recursive: true });
  const dest = join(archiveDir, basename(target.file));
  await rename(target.file, dest);
  return { from: target.file, to: dest };
}

/**
 * Format a list for terminal output.
 */
export function formatDecisionList(decisions) {
  if (decisions.length === 0) return 'No decisions yet.';
  const lines = [];
  for (const d of decisions) {
    const date = d.date ? d.date.slice(0, 10) : '         ';
    const scope = d.scope === 'project' ? '[project]' : '[global] ';
    const deep = d.deepDive ? ' ⛏' : '';
    lines.push(`${date} ${scope} ${d.topic} → ${d.chose} (${d.slug})${deep}`);
  }
  return lines.join('\n');
}

/**
 * Format one decision for terminal output (full).
 */
export function formatDecisionDetail(d) {
  const lines = [];
  lines.push(`# ${d.topic}`);
  lines.push('');
  lines.push(`- **slug:** ${d.slug}`);
  lines.push(`- **date:** ${d.date || '(none)'}`);
  lines.push(`- **scope:** ${d.scope}`);
  lines.push(`- **chose:** ${d.chose}`);
  lines.push(`- **reason:** ${d.reason}`);
  if (Array.isArray(d.alternatives) && d.alternatives.length) {
    lines.push(`- **alternatives:** ${d.alternatives.join(', ')}`);
  }
  lines.push(`- **deep dive done:** ${d.deepDive ? 'yes' : 'no'}`);
  lines.push(`- **file:** ${d.file}`);
  return lines.join('\n');
}
