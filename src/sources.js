/**
 * CLI: `claudenv source list|show`
 *
 * Connectors are knowledge records (params + provenance) stored in the ACTIVE
 * workspace: ~/.claudenv/workspaces/<id>/memories/connectors/<name>.md.
 *
 * Records hold connection metadata and secret_refs (env-var NAMES) only.
 * Actual secret values live in <project>/.env.local and must never appear here.
 * The skill `source-connector` is the primary author; CLI is for listing and
 * for the doctor leak-lint.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceConnectorsDir, activeWorkspaceId, parseFrontmatter } from './memory-paths.js';

export async function listConnectors() {
  const id = activeWorkspaceId();
  if (!id) return { workspace: null, connectors: [] };
  let files;
  try {
    files = (await readdir(workspaceConnectorsDir(id))).filter((f) => f.endsWith('.md'));
  } catch {
    return { workspace: id, connectors: [] };
  }
  const connectors = [];
  for (const f of files) {
    let fm = null;
    try {
      fm = parseFrontmatter(await readFile(join(workspaceConnectorsDir(id), f), 'utf-8'));
    } catch { /* skip unreadable */ }
    connectors.push({
      name: (fm && fm.name) || f.replace(/\.md$/, ''),
      type: (fm && fm.type) || '?',
      status: (fm && fm.status) || '?',
      host: (fm && fm.host) || '',
    });
  }
  return { workspace: id, connectors };
}

export async function showConnector(name) {
  const id = activeWorkspaceId();
  if (!id) return null;
  try {
    return await readFile(join(workspaceConnectorsDir(id), `${name}.md`), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Heuristic leak scan for the doctor. Flags lines that look like a secret VALUE
 * rather than a reference. Connector records should only carry env-var names.
 *
 * Returns an array of { line, reason } findings (empty = clean).
 */
export function scanForSecretLeaks(text) {
  const findings = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // secret_refs хранит ИМЕНА env-переменных по определению - не сканируем
    if (/secret_refs/i.test(line)) continue;
    // `password: <value>` / `token: <value>` with a non-placeholder, non-env value
    const m = /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\b\s*[:=]\s*(\S+)/i.exec(line);
    if (m) {
      // снять кавычки и хвостовую пунктуацию inline-структур ({ } , ; )
      const val = m[2].replace(/['"]/g, '').replace(/[},;)]+$/, '');
      const placeholder = /^(<.*>|\.\.\.|x+|\*+|null|none|env:|\$\{|secret_refs)/i.test(val);
      const looksEnvName = /^[A-Z][A-Z0-9_]*$/.test(val) || /_(env|token|login|password)$/i.test(val);
      if (!placeholder && !looksEnvName && val.length >= 6) {
        findings.push({ line: i + 1, reason: `похоже на значение секрета: ${m[1]}` });
      }
    }
  }
  return findings;
}
