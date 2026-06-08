import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCapabilityMap, formatCapabilities } from '../src/capabilities.js';

describe('buildCapabilityMap', () => {
  let claudeHome;
  let claudenvHome;
  let cwd;
  let prevHome;

  beforeEach(async () => {
    claudeHome = await mkdtemp(join(tmpdir(), 'claudenv-claude-'));
    claudenvHome = await mkdtemp(join(tmpdir(), 'claudenv-state-'));
    cwd = await mkdtemp(join(tmpdir(), 'claudenv-proj-'));
    prevHome = process.env.CLAUDENV_HOME;
    process.env.CLAUDENV_HOME = claudenvHome;
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAUDENV_HOME;
    else process.env.CLAUDENV_HOME = prevHome;
    await rm(claudeHome, { recursive: true, force: true });
    await rm(claudenvHome, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  });

  it('reports installed skills from the given claudeHome', async () => {
    await mkdir(join(claudeHome, 'skills', 'harness'), { recursive: true });
    await writeFile(join(claudeHome, 'skills', 'harness', 'SKILL.md'), '---\nname: harness\ndescription: self-extend\n---\nbody');

    const map = await buildCapabilityMap({ cwd, claudeHome, version: '1.3.2' });
    expect(map.version).toBe('1.3.2');
    expect(map.skills.count).toBe(1);
    expect(map.skills.installed[0].slug).toBe('harness');
  });

  it('reports memory + registry + cli surface', async () => {
    const map = await buildCapabilityMap({ cwd, claudeHome });
    expect(map.memory.home).toBe(claudenvHome);
    expect(map.memory.decisions).toBe(0);
    expect(map.registry.bundled).toBeGreaterThan(0);
    expect(map.cli.some((c) => c.cmd === 'claudenv skills')).toBe(true);
    expect(map.cli.some((c) => c.cmd === 'claudenv capabilities')).toBe(true);
  });

  it('detects project MCP servers from .mcp.json', async () => {
    await writeFile(join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { postgres: {}, context7: {} } }));
    const map = await buildCapabilityMap({ cwd, claudeHome });
    expect(map.mcp.project.sort()).toEqual(['context7', 'postgres']);
  });

  it('reports no active workspace when none is set', async () => {
    const prevWs = process.env.CLAUDENV_WORKSPACE;
    delete process.env.CLAUDENV_WORKSPACE;
    const map = await buildCapabilityMap({ cwd, claudeHome });
    expect(map.workspace.active).toBeNull();
    if (prevWs !== undefined) process.env.CLAUDENV_WORKSPACE = prevWs;
  });

  it('includes a kimi field with installed boolean', async () => {
    const map = await buildCapabilityMap({ cwd, claudeHome });
    expect(typeof map.kimi.installed).toBe('boolean');
  });

  it('counts cached live registry entries', async () => {
    await writeFile(join(claudenvHome, 'skills-registry.json'), JSON.stringify([{ slug: 'a' }, { slug: 'b' }]));
    const map = await buildCapabilityMap({ cwd, claudeHome });
    expect(map.registry.cached).toBe(2);
  });

  it('reports registry.cached = 0 when no cache exists', async () => {
    const map = await buildCapabilityMap({ cwd, claudeHome });
    expect(map.registry.cached).toBe(0);
  });
});

describe('formatCapabilities', () => {
  it('renders the key sections', () => {
    const map = {
      version: '1.3.2',
      node: 'v20.0.0',
      cli: [{ cmd: 'claudenv skills', what: 'discover & install' }],
      skills: { installed: [{ slug: 'harness', hasSkillMd: true }], count: 1 },
      memory: { home: '/tmp/x', indexExists: false, memoriesExists: true, decisions: 3 },
      workspace: { active: 'kontur', connectors: ['adwh'] },
      kimi: { installed: true, running: true, extensionConnected: true },
      mcp: { project: ['postgres'] },
      registry: { bundled: 15, cached: 0 },
    };
    const out = formatCapabilities(map);
    expect(out).toContain('claudenv capabilities v1.3.2');
    expect(out).toContain('harness');
    expect(out).toContain('kimi-webbridge): healthy');
    expect(out).toContain('active workspace: kontur');
    expect(out).toContain('postgres');
    expect(out).toContain('CLI surface');
  });

  it('guides the user when nothing is set up', () => {
    const map = {
      version: null,
      node: 'v20.0.0',
      cli: [],
      skills: { installed: [], count: 0 },
      memory: { home: '/tmp/x', indexExists: false, memoriesExists: false, decisions: 0 },
      workspace: { active: null, connectors: [] },
      kimi: { installed: false, running: false, extensionConnected: false },
      mcp: { project: [] },
      registry: { bundled: 15, cached: 0 },
    };
    const out = formatCapabilities(map);
    expect(out).toContain('claudenv skills add kimi-webbridge');
    expect(out).toContain('claudenv skills search');
  });
});
