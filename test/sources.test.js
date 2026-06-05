import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listConnectors, showConnector, scanForSecretLeaks } from '../src/sources.js';
import { createWorkspace, useWorkspace } from '../src/workspaces.js';
import { workspaceConnectorsDir } from '../src/memory-paths.js';

describe('sources / connectors', () => {
  let tempHome;
  let prevHome;
  let prevWs;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'claudenv-home-'));
    prevHome = process.env.CLAUDENV_HOME;
    prevWs = process.env.CLAUDENV_WORKSPACE;
    process.env.CLAUDENV_HOME = tempHome;
    delete process.env.CLAUDENV_WORKSPACE;
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAUDENV_HOME;
    else process.env.CLAUDENV_HOME = prevHome;
    if (prevWs === undefined) delete process.env.CLAUDENV_WORKSPACE;
    else process.env.CLAUDENV_WORKSPACE = prevWs;
    await rm(tempHome, { recursive: true, force: true });
  });

  async function addConnector(ws, name, body) {
    await writeFile(join(workspaceConnectorsDir(ws), `${name}.md`), body, 'utf-8');
  }

  const rec = (name, type, status, host) =>
    `---\nname: ${name}\ntype: ${type}\nstatus: ${status}\nhost: ${host}\n---\n\nbody`;

  it('listConnectors returns empty with no active workspace', async () => {
    const res = await listConnectors();
    expect(res.workspace).toBeNull();
    expect(res.connectors).toEqual([]);
  });

  it('lists connectors of the active workspace', async () => {
    await createWorkspace('kontur');
    await useWorkspace('kontur');
    await addConnector('kontur', 'adwh', rec('adwh', 'mssql', 'blocked', 'adwh'));
    const res = await listConnectors();
    expect(res.workspace).toBe('kontur');
    expect(res.connectors).toHaveLength(1);
    expect(res.connectors[0]).toMatchObject({ name: 'adwh', type: 'mssql', status: 'blocked' });
  });

  it('ISOLATION: active workspace never sees another workspace connectors', async () => {
    await createWorkspace('kontur');
    await createWorkspace('danone');
    await addConnector('kontur', 'adwh', rec('adwh', 'mssql', 'working', 'adwh'));
    await addConnector('danone', 'sap', rec('sap', 'rest', 'working', 'sap.local'));

    await useWorkspace('kontur');
    let res = await listConnectors();
    expect(res.connectors.map((c) => c.name)).toEqual(['adwh']);

    await useWorkspace('danone');
    res = await listConnectors();
    expect(res.connectors.map((c) => c.name)).toEqual(['sap']);
    // kontur-коннектор не виден из danone — барьер изоляции
    expect(res.connectors.map((c) => c.name)).not.toContain('adwh');
  });

  it('showConnector reads the record from the active workspace only', async () => {
    await createWorkspace('kontur');
    await useWorkspace('kontur');
    await addConnector('kontur', 'adwh', rec('adwh', 'mssql', 'blocked', 'adwh'));
    expect(await showConnector('adwh')).toContain('name: adwh');
    expect(await showConnector('nope')).toBeNull();
  });

  describe('scanForSecretLeaks (doctor lint)', () => {
    it('flags a hardcoded secret value', () => {
      const f = scanForSecretLeaks('password: FAKE-not-a-real-secret-9921');
      expect(f.length).toBeGreaterThan(0);
    });

    it('passes secret_refs with env-var names', () => {
      const f = scanForSecretLeaks('secret_refs: {user: adwh_login, password: adwh_password}');
      expect(f).toEqual([]);
    });

    it('passes placeholders and env refs', () => {
      expect(scanForSecretLeaks('password: <пароль>')).toEqual([]);
      expect(scanForSecretLeaks('token: WIKI_TOKEN')).toEqual([]);
      expect(scanForSecretLeaks('api_key: env:MY_KEY')).toEqual([]);
    });
  });
});
