import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createWorkspace,
  listWorkspaces,
  useWorkspace,
  showActive,
  validateId,
} from '../src/workspaces.js';
import { workspaceConnectorsDir, workspaceManifestPath } from '../src/memory-paths.js';

describe('workspaces', () => {
  let tempHome;
  let prevHome;
  let prevWs;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'claudenv-home-'));
    prevHome = process.env.CLAUDENV_HOME;
    prevWs = process.env.CLAUDENV_WORKSPACE;
    process.env.CLAUDENV_HOME = tempHome;
    delete process.env.CLAUDENV_WORKSPACE; // тесты используют файл-указатель
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAUDENV_HOME;
    else process.env.CLAUDENV_HOME = prevHome;
    if (prevWs === undefined) delete process.env.CLAUDENV_WORKSPACE;
    else process.env.CLAUDENV_WORKSPACE = prevWs;
    await rm(tempHome, { recursive: true, force: true });
  });

  it('createWorkspace lays out connectors dir, manifest and .gitignore', async () => {
    await createWorkspace('kontur', { name: 'Kontur', description: 'УКС', paths: ['/x/ottok'] });
    await expect(stat(workspaceConnectorsDir('kontur'))).resolves.toBeDefined();
    const manifest = await readFile(workspaceManifestPath('kontur'), 'utf-8');
    expect(manifest).toContain('name: Kontur');
    expect(manifest).toContain('- /x/ottok');
    const gi = await readFile(join(tempHome, 'workspaces', 'kontur', '.gitignore'), 'utf-8');
    expect(gi).toContain('.env.local');
  });

  it('rejects invalid ids', () => {
    expect(() => validateId('Bad Name')).toThrow();
    expect(() => validateId('UPPER')).toThrow();
    expect(() => validateId('ok-id_1')).not.toThrow();
  });

  it('refuses duplicate workspace', async () => {
    await createWorkspace('a');
    await expect(createWorkspace('a')).rejects.toThrow(/already exists/);
  });

  it('use + show round-trips the active workspace via pointer file', async () => {
    await createWorkspace('danone');
    await useWorkspace('danone');
    const active = await showActive();
    expect(active.id).toBe('danone');
    expect(active.source).toContain('file');
  });

  it('use rejects a non-existent workspace', async () => {
    await expect(useWorkspace('ghost')).rejects.toThrow(/does not exist/);
  });

  it('env CLAUDENV_WORKSPACE overrides the pointer file', async () => {
    await createWorkspace('a');
    await createWorkspace('b');
    await useWorkspace('a');
    process.env.CLAUDENV_WORKSPACE = 'b';
    const active = await showActive();
    expect(active.id).toBe('b');
    expect(active.source).toContain('env');
  });

  it('list marks the active workspace and lists all', async () => {
    await createWorkspace('a');
    await createWorkspace('b');
    await useWorkspace('b');
    const list = await listWorkspaces();
    const ids = list.map((w) => w.id).sort();
    expect(ids).toEqual(['a', 'b']);
    expect(list.find((w) => w.id === 'b').active).toBe(true);
    expect(list.find((w) => w.id === 'a').active).toBe(false);
  });
});
