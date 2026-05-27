import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { regenIndex, isIndexDirty, handleRegenIndex } from '../../src/hooks/regen-index.js';

describe('regen-index hook', () => {
  let tempHome;
  let workDir;
  let prevHome;

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

  async function makeDecision(dir, name, frontmatter) {
    await mkdir(dir, { recursive: true });
    const fm = Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    await writeFile(join(dir, name), `---\n${fm}\n---\n\nbody\n`);
  }

  it('produces an INDEX.md with header when no decisions exist', async () => {
    const result = await regenIndex({ cwd: workDir });
    expect(result.decisionCount).toBe(0);
    expect(result.recentCount).toBe(0);

    const content = await readFile(join(tempHome, 'memories', 'INDEX.md'), 'utf-8');
    expect(content).toContain('claudenv memory — INDEX');
    expect(content).toContain('No decisions yet');
  });

  it('lists decisions sorted by date (newest first)', async () => {
    const globalDir = join(tempHome, 'memories', 'decisions');
    await makeDecision(globalDir, 'old.md', {
      date: '2026-01-01',
      topic: 'old-thing',
      chose: 'A',
    });
    await makeDecision(globalDir, 'newer.md', {
      date: '2026-05-27',
      topic: 'newer-thing',
      chose: 'B',
    });

    await regenIndex({ cwd: workDir });
    const content = await readFile(join(tempHome, 'memories', 'INDEX.md'), 'utf-8');

    const newerIdx = content.indexOf('newer-thing');
    const olderIdx = content.indexOf('old-thing');
    expect(newerIdx).toBeGreaterThan(-1);
    expect(olderIdx).toBeGreaterThan(-1);
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it('merges project + global decisions', async () => {
    await makeDecision(join(tempHome, 'memories', 'decisions'), 'g.md', {
      date: '2026-05-27',
      topic: 'global-decision',
      chose: 'X',
      scope: 'global',
    });
    await makeDecision(join(workDir, '.claude', 'memories', 'decisions'), 'p.md', {
      date: '2026-05-26',
      topic: 'project-decision',
      chose: 'Y',
      scope: 'project',
    });

    const result = await regenIndex({ cwd: workDir });
    expect(result.decisionCount).toBe(2);

    const content = await readFile(join(tempHome, 'memories', 'INDEX.md'), 'utf-8');
    expect(content).toContain('global-decision');
    expect(content).toContain('project-decision');
    expect(content).toContain('[global]');
    expect(content).toContain('[project]');
  });

  it('respects recent limit (default 5)', async () => {
    const dir = join(tempHome, 'memories', 'decisions');
    for (let i = 0; i < 8; i++) {
      await makeDecision(dir, `d${i}.md`, {
        date: `2026-05-${String(20 + i).padStart(2, '0')}`,
        topic: `topic-${i}`,
        chose: 'x',
      });
    }

    const result = await regenIndex({ cwd: workDir });
    expect(result.decisionCount).toBe(8);
    expect(result.recentCount).toBe(5);

    const content = await readFile(join(tempHome, 'memories', 'INDEX.md'), 'utf-8');
    // Newest (topic-7) present, oldest (topic-0) NOT in recent block
    expect(content).toContain('topic-7');
    expect(content).not.toContain('topic-0');
  });

  it('clears the dirty flag after regen', async () => {
    const flag = join(tempHome, '.index-dirty');
    await writeFile(flag, 'stale');

    expect(await isIndexDirty()).toBe(true);
    await regenIndex({ cwd: workDir });
    expect(await isIndexDirty()).toBe(false);
  });

  it('includes user preferences if present', async () => {
    await mkdir(join(tempHome, 'memories', 'user'), { recursive: true });
    await writeFile(
      join(tempHome, 'memories', 'user', 'preferences.md'),
      '# Preferences\n\n- Editor: helix\n- pnpm not npm\n\n'
    );

    await regenIndex({ cwd: workDir });
    const content = await readFile(join(tempHome, 'memories', 'INDEX.md'), 'utf-8');
    expect(content).toContain('Editor: helix');
    expect(content).toContain('pnpm not npm');
  });

  it('caps output to ~60 lines (cache discipline)', async () => {
    const dir = join(tempHome, 'memories', 'decisions');
    for (let i = 0; i < 100; i++) {
      await makeDecision(dir, `d${i}.md`, {
        date: `2026-05-${String(1 + (i % 27)).padStart(2, '0')}`,
        topic: `t-${i}`,
        chose: 'x',
      });
    }
    await regenIndex({ cwd: workDir });
    const content = await readFile(join(tempHome, 'memories', 'INDEX.md'), 'utf-8');
    expect(content.split('\n').length).toBeLessThanOrEqual(61);
  });

  it('handleRegenIndex returns message with counts', async () => {
    await makeDecision(join(tempHome, 'memories', 'decisions'), 'a.md', {
      date: '2026-05-27',
      topic: 'x',
      chose: 'y',
    });
    const res = await handleRegenIndex({ event: { cwd: workDir } });
    expect(res.exitCode).toBe(0);
    expect(res.message).toContain('INDEX.md regenerated');
    expect(res.message).toContain('1 recent');
  });
});
