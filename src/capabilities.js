/**
 * capabilities.js — `claudenv capabilities` (alias `caps`).
 *
 * Builds a structured map of everything the current claudenv install offers so
 * that Claude can "connect to claudenv, understand it, and extend itself":
 * installed skills, CLI surface, memory state, the active workspace + its
 * connectors, the kimi-webbridge browser daemon, project MCP servers, and the
 * skills registry. The harness skill runs this first as its self-introspection
 * step.
 *
 * Everything degrades gracefully — a missing piece is reported, never thrown.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  claudenvHome,
  memoriesDir,
  globalDecisionsDir,
  indexMdPath,
  activeWorkspaceId,
  workspaceConnectorsDir,
  skillsRegistryCachePath,
} from './memory-paths.js';
import { listInstalledSkills } from './skills-registry.js';
import { BUNDLED_CATALOG } from './bundled-catalog.js';
import { kimiStatus } from './kimi.js';

const CLI_SURFACE = [
  { cmd: 'claudenv loop', what: 'autonomous improvement loop (goal = law)' },
  { cmd: 'claudenv autonomy', what: 'autonomy profiles (safe/moderate/full/ci)' },
  { cmd: 'claudenv memory', what: 'global memory: init / index / show / edit' },
  { cmd: 'claudenv decisions', what: 'vibe-decisions: list / show / search / archive' },
  { cmd: 'claudenv canon', what: 'personal canon of references' },
  { cmd: 'claudenv workspace', what: 'isolated per-company/context memory spaces' },
  { cmd: 'claudenv source', what: 'data-source connectors of the active workspace' },
  { cmd: 'claudenv skills', what: 'discover & install skills (search / list / add / info / refresh)' },
  { cmd: 'claudenv capabilities', what: 'this self-introspection map' },
  { cmd: 'claudenv doctor', what: 'health-check the setup' },
];

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function countDecisions() {
  try {
    const names = await readdir(globalDecisionsDir());
    return names.filter((n) => n.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

async function readActiveConnectors() {
  const id = activeWorkspaceId();
  if (!id) return { active: null, connectors: [] };
  let files = [];
  try {
    files = (await readdir(workspaceConnectorsDir(id))).filter((f) => f.endsWith('.md'));
  } catch {
    return { active: id, connectors: [] };
  }
  return { active: id, connectors: files.map((f) => f.replace(/\.md$/, '')) };
}

async function readProjectMcp(cwd) {
  try {
    const parsed = JSON.parse(await readFile(join(cwd, '.mcp.json'), 'utf-8'));
    return Object.keys(parsed.mcpServers || {});
  } catch {
    return [];
  }
}

async function countCache() {
  try {
    const arr = JSON.parse(await readFile(skillsRegistryCachePath(), 'utf-8'));
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Build the capability map.
 * @param {object} [opts]
 * @param {string} [opts.cwd] - project dir (defaults to process.cwd())
 * @param {string} [opts.claudeHome] - override ~/.claude (for tests)
 * @param {string} [opts.version] - claudenv version string
 */
export async function buildCapabilityMap(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const installed = await listInstalledSkills(opts.claudeHome);
  const ws = await readActiveConnectors();

  return {
    version: opts.version || null,
    node: process.version,
    cli: CLI_SURFACE,
    skills: {
      installed,
      count: installed.length,
    },
    memory: {
      home: claudenvHome(),
      indexExists: await pathExists(indexMdPath()),
      memoriesExists: await pathExists(memoriesDir()),
      decisions: await countDecisions(),
    },
    workspace: ws,
    kimi: kimiStatus(),
    mcp: { project: await readProjectMcp(cwd) },
    registry: { bundled: BUNDLED_CATALOG.length, cached: await countCache() },
  };
}

/** Render the capability map as a compact human-readable report. */
export function formatCapabilities(map) {
  const L = [];
  L.push(`claudenv capabilities${map.version ? ` v${map.version}` : ''}  (Node ${map.node})`);
  L.push('');

  L.push(`Skills installed (~/.claude/skills): ${map.skills.count}`);
  for (const s of map.skills.installed) {
    L.push(`  - ${s.slug}${s.hasSkillMd ? '' : '  (no SKILL.md)'}`);
  }
  if (map.skills.count === 0) L.push('  (none — try `claudenv skills search <task>`)');
  L.push('');

  const k = map.kimi;
  const kimiState = !k.installed
    ? 'not installed (`claudenv skills add kimi-webbridge`)'
    : k.running && k.extensionConnected
      ? 'healthy (daemon + extension connected)'
      : k.running
        ? 'daemon up, browser extension NOT connected'
        : 'installed, daemon stopped (`~/.kimi-webbridge/bin/kimi-webbridge start`)';
  L.push(`Browser automation (kimi-webbridge): ${kimiState}`);
  L.push('');

  L.push('Memory & workspaces:');
  L.push(`  global memory: ${map.memory.memoriesExists ? 'present' : 'not initialised (`claudenv memory init`)'}, ${map.memory.decisions} decisions, INDEX.md ${map.memory.indexExists ? 'present' : 'absent'}`);
  if (map.workspace.active) {
    L.push(`  active workspace: ${map.workspace.active} — connectors: ${map.workspace.connectors.length ? map.workspace.connectors.join(', ') : 'none'}`);
  } else {
    L.push('  active workspace: none (`claudenv workspace use <id>`)');
  }
  L.push('');

  L.push(`Project MCP servers (.mcp.json): ${map.mcp.project.length ? map.mcp.project.join(', ') : 'none'}`);
  L.push(`Skills registry: ${map.registry.bundled} curated + ${map.registry.cached} cached live`);
  L.push('');

  L.push('CLI surface:');
  for (const c of map.cli) L.push(`  ${c.cmd.padEnd(24)} ${c.what}`);

  return L.join('\n');
}
