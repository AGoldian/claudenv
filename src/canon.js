/**
 * CLI: `claudenv canon add/list/search/prune`
 *
 * Owns ~/.claudenv/memories/canon/index.yaml — a topic-keyed list of links.
 * Format intentionally simple (flat YAML) so it's human-editable.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { canonIndexPath } from './memory-paths.js';

/**
 * Read the canon yaml as a JS object. Tolerant to missing or empty files.
 *
 * Parser is intentionally minimal — full YAML would be overkill for a flat
 * topic → [entries] mapping and would add a dependency.
 */
async function readCanon() {
  let text;
  try {
    text = await readFile(canonIndexPath(), 'utf-8');
  } catch {
    return {};
  }

  const result = {};
  let currentTopic = null;
  let currentEntry = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) continue;

    // Topic key: `topic_name:` at column 0
    const topicMatch = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*$/.exec(line);
    if (topicMatch) {
      currentTopic = topicMatch[1];
      result[currentTopic] = [];
      currentEntry = null;
      continue;
    }

    // List entry start: `  - key: value` or `  - key:` (multiline value)
    const entryStartMatch = /^\s+-\s+([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line);
    if (entryStartMatch && currentTopic) {
      currentEntry = {};
      currentEntry[entryStartMatch[1]] = unquote(entryStartMatch[2]);
      result[currentTopic].push(currentEntry);
      continue;
    }

    // Subsequent key in same entry: `    key: value`
    const subKeyMatch = /^\s+([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line);
    if (subKeyMatch && currentEntry) {
      currentEntry[subKeyMatch[1]] = unquote(subKeyMatch[2]);
      continue;
    }
  }

  return result;
}

function unquote(s) {
  const trimmed = s.trim();
  if (!trimmed) return '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  // Inline arrays — pass through as raw string for now (rare in canon).
  return trimmed;
}

/**
 * Append an entry to the canon. Creates the topic group if absent.
 *
 * @param {object} opts
 * @param {string} opts.topic - Topic slug
 * @param {string} opts.url - Required
 * @param {string} opts.why - Required
 * @param {string} [opts.title]
 * @param {string} [opts.author]
 */
export async function canonAdd({ topic, url, why, title, author }) {
  if (!topic || !url || !why) {
    throw new Error('claudenv canon add <topic> <url> --why "<reason>" required');
  }

  const canon = await readCanon();
  if (!canon[topic]) canon[topic] = [];

  const entry = {
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
    url,
    why,
    added: new Date().toISOString().slice(0, 10),
  };

  // Skip duplicates by URL within the same topic.
  const dup = canon[topic].find((e) => e.url === url);
  if (dup) return { added: false, reason: 'duplicate url in same topic', entry: dup };

  canon[topic].push(entry);
  await writeCanon(canon);
  return { added: true, topic, entry };
}

/**
 * List all topics with their entries, or filter by one topic.
 */
export async function canonList(topic) {
  const canon = await readCanon();
  if (topic) {
    return { [topic]: canon[topic] || [] };
  }
  return canon;
}

/**
 * Substring search across title/why/url, returning matching entries grouped by topic.
 */
export async function canonSearch(query) {
  if (!query) throw new Error('claudenv canon search <query> required');
  const q = query.toLowerCase();
  const canon = await readCanon();
  const result = {};
  for (const [topic, entries] of Object.entries(canon)) {
    const hits = entries.filter((e) =>
      [e.title, e.why, e.url, e.author].some((v) => v && v.toLowerCase().includes(q))
    );
    if (hits.length) result[topic] = hits;
  }
  return result;
}

/**
 * Find entries whose `added` date is older than `months` months — candidates
 * for review. Returns an array of `{topic, entry}` items.
 */
export async function canonPrune(months = 6) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const canon = await readCanon();
  const stale = [];
  for (const [topic, entries] of Object.entries(canon)) {
    for (const entry of entries) {
      if (!entry.added) {
        stale.push({ topic, entry, reason: 'no `added` date' });
        continue;
      }
      const added = new Date(entry.added);
      if (!Number.isNaN(added.getTime()) && added < cutoff) {
        stale.push({ topic, entry });
      }
    }
  }
  return stale;
}

/**
 * Serialize canon back to YAML form. Comment-light, human-editable.
 */
async function writeCanon(canon) {
  const lines = [];
  lines.push('# Личный канон. Добавляйте через: claudenv canon add <topic> <url> --why "<reason>"');
  lines.push('');
  for (const [topic, entries] of Object.entries(canon)) {
    lines.push(`${topic}:`);
    for (const e of entries) {
      const keys = Object.keys(e);
      if (keys.length === 0) continue;
      const [firstKey, ...rest] = keys;
      lines.push(`  - ${firstKey}: ${quote(e[firstKey])}`);
      for (const k of rest) {
        lines.push(`    ${k}: ${quote(e[k])}`);
      }
    }
    lines.push('');
  }
  await mkdir(dirname(canonIndexPath()), { recursive: true });
  await writeFile(canonIndexPath(), lines.join('\n'), 'utf-8');
}

function quote(v) {
  if (typeof v !== 'string') return String(v);
  if (/[:#"\n]/.test(v)) return JSON.stringify(v);
  return v;
}

/**
 * Format canon for terminal output.
 */
export function formatCanon(canon) {
  const topics = Object.keys(canon);
  if (topics.length === 0) {
    return 'Канон пуст. Добавь первые записи через `claudenv canon add <topic> <url> --why "..."`.';
  }
  const lines = [];
  for (const t of topics) {
    lines.push(`## ${t}`);
    for (const e of canon[t] || []) {
      const title = e.title || '(no title)';
      const author = e.author ? ` — ${e.author}` : '';
      lines.push(`  - ${title}${author}`);
      lines.push(`    ${e.url}`);
      if (e.why) lines.push(`    why: ${e.why}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
