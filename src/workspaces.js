/**
 * CLI: `claudenv workspace add|list|use|show`
 *
 * Workspaces are isolated per-company/context memory spaces under
 * ~/.claudenv/workspaces/<id>/. Only the ACTIVE workspace is ever loaded -
 * this is the isolation barrier that prevents access/context from one company
 * leaking into another project on the same device.
 *
 * Secrets NEVER live here - they belong in <project>/.env.local (gitignored).
 * Workspace memory holds connector metadata + provenance only.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import {
  workspacesDir,
  workspaceDir,
  workspaceManifestPath,
  workspaceConnectorsDir,
  workspaceContextDir,
  activeWorkspaceFile,
  activeWorkspaceId,
} from './memory-paths.js';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function validateId(id) {
  if (!id || !SLUG_RE.test(id)) {
    throw new Error(`Invalid workspace id "${id}" - use lowercase letters, digits, - or _`);
  }
  return id;
}

/**
 * Render a flat workspace.yaml. Minimal by design (human-editable), like canon.
 */
function renderManifest({ name, description, paths }) {
  const lines = [];
  lines.push(`name: ${name || ''}`);
  lines.push(`description: ${description || ''}`);
  lines.push('paths:');
  for (const p of paths || []) lines.push(`  - ${p}`);
  return lines.join('\n') + '\n';
}

/** Tolerant parser for the flat workspace.yaml above. */
function parseManifest(text) {
  const out = { name: '', description: '', paths: [] };
  let inPaths = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    const kv = /^([a-zA-Z_]+):\s*(.*)$/.exec(line);
    if (kv && kv[1] === 'paths') { inPaths = true; continue; }
    if (kv) {
      inPaths = false;
      if (kv[1] === 'name') out.name = kv[2];
      else if (kv[1] === 'description') out.description = kv[2];
      continue;
    }
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && inPaths) out.paths.push(item[1].trim());
  }
  return out;
}

export async function createWorkspace(id, { name, description, paths } = {}) {
  validateId(id);
  const dir = workspaceDir(id);
  try {
    await stat(dir);
    throw new Error(`Workspace "${id}" already exists`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await mkdir(workspaceConnectorsDir(id), { recursive: true });
  await mkdir(workspaceContextDir(id), { recursive: true });
  await writeFile(
    workspaceManifestPath(id),
    renderManifest({ name: name || id, description, paths }),
    'utf-8'
  );
  // секреты сюда не кладём - явный gitignore на случай, если папку положат в git
  await writeFile(workspaceDir(id) + '/.gitignore', '.env\n.env.local\n*.secret\n', 'utf-8');
  return dir;
}

export async function listWorkspaces() {
  let entries;
  try {
    entries = await readdir(workspacesDir(), { withFileTypes: true });
  } catch {
    return [];
  }
  const active = activeWorkspaceId();
  const result = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    let manifest = { name: ent.name, description: '', paths: [] };
    try {
      manifest = parseManifest(await readFile(workspaceManifestPath(ent.name), 'utf-8'));
    } catch { /* нет манифеста - покажем по id */ }
    result.push({ id: ent.name, active: ent.name === active, ...manifest });
  }
  return result;
}

export async function useWorkspace(id) {
  validateId(id);
  try {
    await stat(workspaceDir(id));
  } catch {
    throw new Error(`Workspace "${id}" does not exist - create it with 'claudenv workspace add ${id}'`);
  }
  await writeFile(activeWorkspaceFile(), id + '\n', 'utf-8');
  return id;
}

export async function showActive() {
  const id = activeWorkspaceId();
  if (!id) return null;
  let manifest = { name: id, description: '', paths: [] };
  try {
    manifest = parseManifest(await readFile(workspaceManifestPath(id), 'utf-8'));
  } catch { /* активный указан, но манифеста нет */ }
  const source = process.env.CLAUDENV_WORKSPACE ? 'env CLAUDENV_WORKSPACE' : 'active-workspace file';
  return { id, source, ...manifest };
}

export { parseManifest };
