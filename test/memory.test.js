import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, stat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { memoryInit, memoryIndex, memoryShow } from '../src/memory.js';

describe('memory CLI', () => {
  let tempHome;
  let prevHome;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'claudenv-home-'));
    prevHome = process.env.CLAUDENV_HOME;
    process.env.CLAUDENV_HOME = tempHome;
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAUDENV_HOME;
    else process.env.CLAUDENV_HOME = prevHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  it('memoryInit creates layout idempotently', async () => {
    const first = await memoryInit();
    expect(first.created.length).toBeGreaterThan(0);

    const indexStat = await stat(join(tempHome, 'memories', 'INDEX.md'));
    expect(indexStat.isFile()).toBe(true);

    const decisionsStat = await stat(join(tempHome, 'memories', 'decisions'));
    expect(decisionsStat.isDirectory()).toBe(true);

    const second = await memoryInit();
    expect(second.created).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);
  });

  it('memoryIndex regenerates INDEX.md', async () => {
    await memoryInit();
    // Seed one decision
    await mkdir(join(tempHome, 'memories', 'decisions'), { recursive: true });
    await writeFile(
      join(tempHome, 'memories', 'decisions', '2026-05-27-foo.md'),
      `---\ndate: 2026-05-27\ntopic: foo-topic\nchose: A\nreason: r\n---\n`
    );

    const result = await memoryIndex();
    expect(result.decisionCount).toBe(1);

    const content = await readFile(join(tempHome, 'memories', 'INDEX.md'), 'utf-8');
    expect(content).toContain('foo-topic');
  });

  it('memoryShow reads relative paths within memories', async () => {
    await memoryInit();
    const content = await memoryShow('INDEX.md');
    expect(content).toContain('claudenv memory');
  });

  it('memoryShow rejects path traversal', async () => {
    await memoryInit();
    await expect(memoryShow('../../etc/passwd')).rejects.toThrow();
  });
});
