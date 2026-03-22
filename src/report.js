// =============================================
// Work report reader/formatter/watcher
// =============================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createReadStream, watch, statSync } from 'node:fs';
import { join } from 'node:path';

const REPORT_FILE = '.claude/work-report.jsonl';

/**
 * Read all report events from the JSONL file.
 * @param {string} cwd - Working directory
 * @returns {Promise<Array<object>>}
 */
export async function readReport(cwd) {
  try {
    const content = await readFile(join(cwd, REPORT_FILE), 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Format report events as a human-readable timeline.
 * @param {Array<object>} events
 * @returns {string}
 */
export function formatReport(events) {
  if (events.length === 0) return '  No report events found.\n';

  const lines = [];
  lines.push('  Work Report');
  lines.push(`  ${'─'.repeat(50)}`);

  for (const ev of events) {
    const time = ev.ts ? new Date(ev.ts).toLocaleTimeString() : '??:??:??';
    switch (ev.event) {
      case 'loop_start':
        lines.push(`  ${time}  LOOP START`);
        lines.push(`           Goal: ${ev.goal || 'General improvement'}`);
        if (ev.model) lines.push(`           Model: ${ev.model}`);
        if (ev.gitTag) lines.push(`           Tag: ${ev.gitTag}`);
        break;

      case 'iteration_start':
        lines.push(`  ${time}  ITERATION ${ev.iteration} start${ev.type ? ` (${ev.type})` : ''}`);
        break;

      case 'iteration_end':
        lines.push(`  ${time}  ITERATION ${ev.iteration} done`);
        if (ev.summary) lines.push(`           ${ev.summary.slice(0, 120)}`);
        if (ev.commitHash) lines.push(`           Commit: ${ev.commitHash}`);
        if (ev.tokens) lines.push(`           Tokens: ${ev.tokens.in || 0} in / ${ev.tokens.out || 0} out`);
        break;

      case 'rate_limit':
        lines.push(`  ${time}  RATE LIMITED at iteration ${ev.iteration}`);
        if (ev.message) lines.push(`           ${ev.message}`);
        break;

      case 'loop_end':
        lines.push(`  ${time}  LOOP END — ${ev.reason || 'unknown'} (${ev.totalIterations || '?'} iterations)`);
        break;

      default:
        lines.push(`  ${time}  ${ev.event || 'unknown'}`);
    }
    lines.push('');
  }

  lines.push(`  ${'─'.repeat(50)}`);
  return lines.join('\n') + '\n';
}

/**
 * Format a single event as a compact one-line string (for follow/watch mode).
 * @param {object} ev
 * @returns {string}
 */
export function formatEventLine(ev) {
  const time = ev.ts ? new Date(ev.ts).toLocaleTimeString() : '??:??:??';
  switch (ev.event) {
    case 'loop_start':
      return `  ${time}  LOOP START — ${ev.goal || 'General improvement'}${ev.model ? ` [${ev.model}]` : ''}\n`;
    case 'iteration_start':
      return `  ${time}  ITERATION ${ev.iteration} start${ev.type ? ` (${ev.type})` : ''}\n`;
    case 'iteration_end': {
      let line = `  ${time}  ITERATION ${ev.iteration} done`;
      if (ev.commitHash) line += ` [${ev.commitHash}]`;
      if (ev.tokens) line += ` (${ev.tokens.in || 0}/${ev.tokens.out || 0} tokens)`;
      line += '\n';
      if (ev.summary) line += `           ${ev.summary.slice(0, 120)}\n`;
      return line;
    }
    case 'rate_limit':
      return `  ${time}  RATE LIMITED at iteration ${ev.iteration}${ev.message ? ` — ${ev.message}` : ''}\n`;
    case 'loop_end':
      return `  ${time}  LOOP END — ${ev.reason || 'unknown'} (${ev.totalIterations || '?'} iterations)\n`;
    default:
      return `  ${time}  ${ev.event || 'unknown'}\n`;
  }
}

/**
 * Watch the report file for new events and call cb for each.
 * @param {string} cwd - Working directory
 * @param {function} cb - Callback receiving each new event object
 * @returns {{ close: function }} Watcher handle
 */
export async function watchReport(cwd, cb) {
  const filePath = join(cwd, REPORT_FILE);
  let position = 0;

  // Ensure the file exists (watch throws on non-existent files)
  try {
    const { size } = statSync(filePath);
    position = size;
  } catch {
    await mkdir(join(cwd, '.claude'), { recursive: true });
    await writeFile(filePath, '');
  }

  const watcher = watch(filePath, () => {
    // On change, read new lines from last position
    const stream = createReadStream(filePath, { start: position, encoding: 'utf-8' });
    let buffer = '';

    stream.on('data', (chunk) => {
      buffer += chunk;
      position += Buffer.byteLength(chunk, 'utf-8');
    });

    stream.on('end', () => {
      const lines = buffer.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        try {
          cb(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }
    });
  });

  return {
    close: () => watcher.close(),
  };
}
