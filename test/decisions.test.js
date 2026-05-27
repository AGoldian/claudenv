import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listDecisions,
  showDecision,
  searchDecisions,
  archiveDecision,
  formatDecisionList,
} from '../src/decisions.js';

describe('decisions CLI', () => {
  let tempHome;
  let workDir;
  let prevHome;

  async function makeDecision(dir, name, fm) {
    await mkdir(dir, { recursive: true });
    const yaml = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n');
    await writeFile(join(dir, name), `---\n${yaml}\n---\n\nbody\n`);
  }

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'claudenv-home-'));
    workDir = await mkdtemp(join(tmpdir(), 'claudenv-work-'));
    prevHome = process.env.CLAUDENV_HOME;
    process.env.CLAUDENV_HOME = tempHome;
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAUDENV_HOME;
    else process.env.CLAUDENV_HOME = prevHome;
    await rm(tempHome, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('listDecisions merges global + project sorted newest first', async () => {
    await makeDecision(join(tempHome, 'memories', 'decisions'), 'g.md', {
      date: '2026-05-27', topic: 'global-thing', chose: 'X',
    });
    await makeDecision(join(workDir, '.claude', 'memories', 'decisions'), 'p.md', {
      date: '2026-05-20', topic: 'project-thing', chose: 'Y',
    });
    const all = await listDecisions({ cwd: workDir });
    expect(all).toHaveLength(2);
    expect(all[0].topic).toBe('global-thing'); // newer
    expect(all[1].topic).toBe('project-thing');
  });

  it('listDecisions filters by scope', async () => {
    await makeDecision(join(tempHome, 'memories', 'decisions'), 'g.md', {
      date: '2026-05-27', topic: 'g', chose: 'X',
    });
    await makeDecision(join(workDir, '.claude', 'memories', 'decisions'), 'p.md', {
      date: '2026-05-20', topic: 'p', chose: 'Y',
    });
    const globalOnly = await listDecisions({ cwd: workDir, scope: 'global' });
    expect(globalOnly).toHaveLength(1);
    expect(globalOnly[0].scope).toBe('global');
  });

  it('showDecision finds by exact slug', async () => {
    await makeDecision(join(tempHome, 'memories', 'decisions'), '2026-05-27-distributed-locks.md', {
      date: '2026-05-27', topic: 'distributed locks', chose: 'redis',
    });
    const d = await showDecision('2026-05-27-distributed-locks', { cwd: workDir });
    expect(d.chose).toBe('redis');
  });

  it('showDecision finds by topic substring', async () => {
    await makeDecision(join(tempHome, 'memories', 'decisions'), 'x.md', {
      date: '2026-05-27', topic: 'distributed locks', chose: 'redis',
    });
    const d = await showDecision('locks', { cwd: workDir });
    expect(d.chose).toBe('redis');
  });

  it('showDecision throws when no match', async () => {
    await makeDecision(join(tempHome, 'memories', 'decisions'), 'x.md', {
      date: '2026-05-27', topic: 'foo', chose: 'bar',
    });
    await expect(showDecision('nonexistent', { cwd: workDir })).rejects.toMatchObject({
      notFound: true,
    });
  });

  it('searchDecisions matches topic and reason', async () => {
    await makeDecision(join(tempHome, 'memories', 'decisions'), 'a.md', {
      date: '2026-05-27', topic: 'database choice', chose: 'postgres', reason: 'durability',
    });
    await makeDecision(join(tempHome, 'memories', 'decisions'), 'b.md', {
      date: '2026-05-26', topic: 'cache layer', chose: 'redis', reason: 'speed',
    });
    const hits = await searchDecisions('durability', { cwd: workDir });
    expect(hits).toHaveLength(1);
    expect(hits[0].chose).toBe('postgres');
  });

  it('archiveDecision moves file into archive/', async () => {
    const dir = join(tempHome, 'memories', 'decisions');
    await makeDecision(dir, 'a.md', { date: '2026-05-27', topic: 't', chose: 'c' });
    const result = await archiveDecision('a', { cwd: workDir });
    expect(result.to).toContain('archive');
    await expect(stat(result.from)).rejects.toThrow();
    const archivedStat = await stat(result.to);
    expect(archivedStat.isFile()).toBe(true);
  });

  it('formatDecisionList prints empty-state for no decisions', () => {
    expect(formatDecisionList([])).toContain('No decisions yet');
  });
});
